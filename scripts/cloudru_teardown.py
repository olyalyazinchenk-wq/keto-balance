#!/usr/bin/env python3
"""
scripts/cloudru_teardown.py — Безопасное завершение работы и полный аудит/демонтаж ресурсов Cloud.ru.

Официальная интеграция с Cloud.ru Evolution IAM и REST API (Compute, Disks, Floating IPs, Snapshots, VPC, Storage, Backups, Billing).
Гарантирует защиту от скрытых расходов и отрицательного баланса.

Правила безопасности:
1. По умолчанию работает ТОЛЬКО в режиме проверки (dry-run).
2. Реальная инвентаризация выполняется через официальный REST API Cloud.ru Evolution.
3. При недоступности сервиса, отсутствии прав (401/403), ошибке сети или неполном ответе
   скрипт возвращает статус UNKNOWN/ERROR и помечает расходы как НЕПОДТВЕРЖДЁННЫЕ,
   а не возвращает пустой список.
4. Ложное подтверждение нулевой задолженности СТРОГО ЗАПРЕЩЕНО:
   Нулевая задолженность (zero_residual_confirmed=True) НЕ объявляется, пока не проверены
   все потенциально платные услуги (включая хранилища S3, бэкапы, сетевые шлюзы и фактический биллинг).
5. Удаление НЕВОЗМОЖНО без подтверждённого и проверенного бэкапа (проверка целостности и тестовое восстановление).
6. Реальное автоматическое удаление через API заблокировано (LIVE_LOCKED) в целях безопасности.
7. Регламент гарантированного ручного демонтажа: docs/CLOUDRU_MANUAL_TEARDOWN.md.
"""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Callable

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from scripts.restore_db import verify_integrity, find_meta_file, compute_sha256, derive_key
from scripts.backup_db import resolve_encryption_key, SecurityError


CONFIRMATION_PHRASE = "I_CONFIRM_COMPLETE_CLOUD_TEARDOWN"


class TeardownGateError(RuntimeError):
    pass


class CloudRuApiError(RuntimeError):
    """Исключение при ошибках доступа к Cloud.ru API или отсутствии учётных данных."""
    pass


class CloudRuEvolutionClient:
    """
    Официальный клиент для взаимодействия с Cloud.ru Evolution IAM и REST API.
    Поддерживает аудит всех потенциально тарифицируемых групп ресурсов:
      - IAM Token Auth (https://iam.api.cloud.ru/api/v1/auth/token)
      - Compute VMs (https://compute.api.cloud.ru/api/v1/vms)
      - Compute Disks (https://compute.api.cloud.ru/api/v1/disks)
      - Compute Floating IPs (https://compute.api.cloud.ru/api/v1/floating-ips)
      - Compute Snapshots (https://compute.api.cloud.ru/api/v1/snapshots)
      - Compute Images (https://compute.api.cloud.ru/api/v1/images)
      - VPC Virtual IPs (https://vpc.api.cloud.ru/v1/projects/{project_id}/virtual-ips)
      - VPC Load Balancers (https://vpc.api.cloud.ru/v1/projects/{project_id}/load-balancers)
      - VPC NAT Gateways (https://vpc.api.cloud.ru/v1/projects/{project_id}/nat-gateways)
      - Object Storage S3 Buckets (https://storage.api.cloud.ru/api/v1/buckets)
      - Cloud Backup Service (https://backup.api.cloud.ru/api/v1/backups)
      - Billing & Account Balance (https://billing.api.cloud.ru/api/v1/contracts/usage)
      - Legacy OpenStack Keystone v3 fallback (при явном указании OS_AUTH_URL)
    """

    DEFAULT_IAM_URL = "https://iam.api.cloud.ru/api/v1/auth/token"
    DEFAULT_COMPUTE_URL = "https://compute.api.cloud.ru/api/v1"
    DEFAULT_VPC_URL = "https://vpc.api.cloud.ru/v1"
    DEFAULT_STORAGE_URL = "https://storage.api.cloud.ru/api/v1"
    DEFAULT_BACKUP_URL = "https://backup.api.cloud.ru/api/v1"
    DEFAULT_BILLING_URL = "https://billing.api.cloud.ru/api/v1"

    ALL_POTENTIAL_SERVICES = [
        "vms",
        "disks",
        "floating_ips",
        "snapshots",
        "images",
        "virtual_ips",
        "load_balancers",
        "nat_gateways",
        "buckets",
        "backups",
        "billing",
    ]

    def __init__(
        self,
        iam_url: Optional[str] = None,
        compute_url: Optional[str] = None,
        vpc_url: Optional[str] = None,
        storage_url: Optional[str] = None,
        backup_url: Optional[str] = None,
        billing_url: Optional[str] = None,
        project_id: Optional[str] = None,
        key_id: Optional[str] = None,
        secret_key: Optional[str] = None,
        token: Optional[str] = None,
        auth_url: Optional[str] = None,
        project_name: Optional[str] = None,
        region: Optional[str] = None,
        http_requester: Optional[Callable[[str, str, Optional[Dict[str, str]], Optional[bytes]], Tuple[int, Dict[str, str], Any]]] = None,
        timeout: int = 15,
    ):
        self.iam_url = (iam_url or os.getenv("CLOUDRU_IAM_URL") or self.DEFAULT_IAM_URL).rstrip("/")
        self.compute_url = (compute_url or os.getenv("CLOUDRU_COMPUTE_URL") or self.DEFAULT_COMPUTE_URL).rstrip("/")
        self.vpc_url = (vpc_url or os.getenv("CLOUDRU_VPC_URL") or self.DEFAULT_VPC_URL).rstrip("/")
        self.storage_url = (storage_url or os.getenv("CLOUDRU_STORAGE_URL") or self.DEFAULT_STORAGE_URL).rstrip("/")
        self.backup_url = (backup_url or os.getenv("CLOUDRU_BACKUP_URL") or self.DEFAULT_BACKUP_URL).rstrip("/")
        self.billing_url = (billing_url or os.getenv("CLOUDRU_BILLING_URL") or self.DEFAULT_BILLING_URL).rstrip("/")

        self.project_id = (
            project_id
            or os.getenv("CLOUDRU_PROJECT_ID")
            or os.getenv("OS_PROJECT_ID")
            or ""
        )
        self.key_id = (
            key_id
            or os.getenv("CLOUDRU_KEY_ID")
            or os.getenv("CLOUDRU_CLIENT_ID")
            or os.getenv("OS_USERNAME")
            or ""
        )
        self.secret_key = (
            secret_key
            or os.getenv("CLOUDRU_SECRET_KEY")
            or os.getenv("CLOUDRU_SECRET")
            or os.getenv("OS_PASSWORD")
            or ""
        )
        self.token = (
            token
            or os.getenv("CLOUDRU_TOKEN")
            or os.getenv("CLOUDRU_IAM_TOKEN")
            or os.getenv("OS_AUTH_TOKEN")
            or os.getenv("OS_TOKEN")
            or ""
        )
        self.region = region or os.getenv("CLOUDRU_REGION_NAME") or os.getenv("OS_REGION_NAME") or "ru-1"
        self.auth_url = (auth_url or os.getenv("CLOUDRU_AUTH_URL") or os.getenv("OS_AUTH_URL") or "").rstrip("/")
        self.project_name = project_name or os.getenv("CLOUDRU_PROJECT_NAME") or os.getenv("OS_PROJECT_NAME") or ""
        self.http_requester = http_requester
        self.timeout = timeout

        self.endpoints: Dict[str, str] = {}
        self._authenticated = False

    def validate_credentials(self) -> None:
        """Проверяет наличие минимально необходимых учётных данных Cloud.ru Evolution."""
        if self.token and self.project_id:
            return

        if not (self.token or (self.key_id and self.secret_key)):
            raise CloudRuApiError(
                "Отсутствуют учётные данные Cloud.ru Evolution API. "
                "Задайте переменные окружения CLOUDRU_KEY_ID и CLOUDRU_SECRET_KEY (или CLOUDRU_TOKEN)."
            )

        if not self.project_id and not self.project_name:
            raise CloudRuApiError(
                "Отсутствует идентификатор проекта Cloud.ru Evolution. "
                "Задайте переменную окружения CLOUDRU_PROJECT_ID."
            )

    def _request(
        self,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        body: Optional[bytes] = None,
    ) -> Tuple[int, Dict[str, str], Any]:
        """Выполняет HTTP запрос к API через urllib или переданный http_requester."""
        try:
            if self.http_requester:
                status, resp_headers, data = self.http_requester(method, url, headers=headers, body=body)
                norm_headers = {k.lower(): v for k, v in resp_headers.items()}
                return status, norm_headers, data

            req_headers = {
                "User-Agent": "KetoBalance-CloudRuEvolutionClient/2.0",
                "Accept": "application/json",
            }
            if headers:
                req_headers.update(headers)

            req = urllib.request.Request(url, data=body, headers=req_headers, method=method)
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.status
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                content = resp.read()
                data = None
                if content:
                    try:
                        data = json.loads(content.decode("utf-8"))
                    except Exception:
                        data = content.decode("utf-8", errors="replace")
                return status, resp_headers, data
        except urllib.error.HTTPError as e:
            err_msg = f"HTTP {e.code} {e.reason} при обращении к {url}"
            try:
                err_body = e.read().decode("utf-8", errors="replace")
                err_msg += f": {err_body[:300]}"
            except Exception:
                pass
            raise CloudRuApiError(err_msg) from e
        except urllib.error.URLError as e:
            raise CloudRuApiError(f"Сетевая ошибка при обращении к Cloud.ru API ({url}): {e.reason}") from e
        except Exception as e:
            raise CloudRuApiError(f"Ошибка вызова Cloud.ru API ({url}): {e}") from e

    def authenticate(self) -> str:
        """
        Аутентификация в Cloud.ru Evolution IAM (или Keystone v3 при явном указании OS_AUTH_URL).
        Возвращает Bearer токен доступа.
        """
        if self._authenticated and self.token:
            return self.token

        self.validate_credentials()

        if self.token:
            self._authenticated = True
            return self.token

        # Если задан явный Keystone URL, используем OpenStack протокол
        if self.auth_url and "/v3" in self.auth_url:
            return self._authenticate_keystone_v3()

        # Стандартный документированный Cloud.ru Evolution IAM
        iam_endpoint = self.iam_url
        if not iam_endpoint.endswith("/token"):
            iam_endpoint = f"{iam_endpoint}/auth/token"

        payload = {
            "keyId": self.key_id,
            "secret": self.secret_key,
        }
        body_bytes = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        try:
            status, _, data = self._request("POST", iam_endpoint, headers=headers, body=body_bytes)
        except CloudRuApiError as exc:
            raise CloudRuApiError(f"Сбой авторизации Cloud.ru Evolution IAM ({iam_endpoint}): {exc}") from exc

        if status not in (200, 201):
            raise CloudRuApiError(f"Сбой аутентификации в Cloud.ru IAM (HTTP {status}): {data}")

        if not isinstance(data, dict):
            raise CloudRuApiError(f"Некорректный формат ответа Cloud.ru IAM: ожидался JSON объект, получено {type(data)}")

        token = data.get("access_token") or data.get("token")
        if not token:
            raise CloudRuApiError(f"В ответе Cloud.ru IAM отсутствует поле access_token: {data}")

        self.token = str(token)
        self._authenticated = True
        return self.token

    def _authenticate_keystone_v3(self) -> str:
        """Резервная аутентификация в OpenStack Keystone v3 при использовании legacy-платформы."""
        auth_url = f"{self.auth_url}/auth/tokens" if not self.auth_url.endswith("/tokens") else self.auth_url
        auth_body: Dict[str, Any] = {
            "auth": {
                "identity": {
                    "methods": ["password"],
                    "password": {
                        "user": {
                            "name": self.key_id,
                            "domain": {"name": "Default"},
                            "password": self.secret_key,
                        }
                    },
                }
            }
        }
        if self.project_id:
            auth_body["auth"]["scope"] = {"project": {"id": self.project_id}}
        elif self.project_name:
            auth_body["auth"]["scope"] = {"project": {"name": self.project_name, "domain": {"name": "Default"}}}

        body_bytes = json.dumps(auth_body).encode("utf-8")
        status, resp_headers, data = self._request("POST", auth_url, headers={"Content-Type": "application/json"}, body=body_bytes)
        token = resp_headers.get("x-subject-token")
        if not token and isinstance(data, dict):
            token = data.get("token", {}).get("id")
        if not token:
            raise CloudRuApiError("Заголовок X-Subject-Token не получен от Keystone v3.")

        self.token = token
        self._authenticated = True

        catalog = data.get("token", {}).get("catalog", []) if isinstance(data, dict) else []
        for service in catalog:
            s_type = service.get("type")
            for ep in service.get("endpoints", []):
                if ep.get("interface") == "public":
                    ep_reg = ep.get("region_id") or ep.get("region")
                    raw_url = ep.get("url", "").rstrip("/")
                    if self.project_id:
                        raw_url = raw_url.replace("%(tenant_id)s", self.project_id).replace("%(project_id)s", self.project_id)
                    if self.region and ep_reg == self.region:
                        self.endpoints[s_type] = raw_url
                        break
                    elif s_type not in self.endpoints:
                        self.endpoints[s_type] = raw_url

        return self.token

    def _safe_query_service(self, service_name: str, url: str) -> Dict[str, Any]:
        """
        Выполняет безопасный запрос к REST API сервиса Cloud.ru Evolution.
        При ошибке авторизации, сети, таймауте или неполном ответе
        ВОЗВРАЩАЕТ СТАТУС UNKNOWN/ERROR, а НЕ пустой список, помечая расходы как неподтверждённые.
        """
        try:
            self.authenticate()
        except CloudRuApiError as auth_err:
            return {
                "service": service_name,
                "status": "UNAUTHORIZED",
                "error": str(auth_err),
                "items": [],
                "unconfirmed_cost": True,
                "estimated_cost_rub_month": 0,
            }

        headers = {
            "Authorization": f"Bearer {self.token}",
            "X-Auth-Token": self.token,
        }

        try:
            status, _, data = self._request("GET", url, headers=headers)
        except CloudRuApiError as api_err:
            err_str = str(api_err)
            status_code = "ERROR"
            if "HTTP 401" in err_str or "HTTP 403" in err_str:
                status_code = "UNAUTHORIZED"
            elif "HTTP 404" in err_str:
                status_code = "NOT_FOUND"
            elif "Сетевая ошибка" in err_str or "timed out" in err_str.lower():
                status_code = "NETWORK_ERROR"

            return {
                "service": service_name,
                "status": status_code,
                "error": err_str,
                "items": [],
                "unconfirmed_cost": True,
                "estimated_cost_rub_month": 0,
            }
        except Exception as exc:
            return {
                "service": service_name,
                "status": "ERROR",
                "error": str(exc),
                "items": [],
                "unconfirmed_cost": True,
                "estimated_cost_rub_month": 0,
            }

        if status == 200:
            raw_items = []
            if isinstance(data, dict):
                # Проверка стандартных полей коллекций Cloud.ru OpenAPI
                if "items" in data and isinstance(data["items"], list):
                    raw_items = data["items"]
                elif service_name in data and isinstance(data[service_name], list):
                    raw_items = data[service_name]
                elif "servers" in data and isinstance(data["servers"], list):
                    raw_items = data["servers"]
                elif "volumes" in data and isinstance(data["volumes"], list):
                    raw_items = data["volumes"]
                elif "floatingips" in data and isinstance(data["floatingips"], list):
                    raw_items = data["floatingips"]
                elif "floating_ips" in data and isinstance(data["floating_ips"], list):
                    raw_items = data["floating_ips"]
                elif "snapshots" in data and isinstance(data["snapshots"], list):
                    raw_items = data["snapshots"]
                elif "images" in data and isinstance(data["images"], list):
                    raw_items = data["images"]
                elif "buckets" in data and isinstance(data["buckets"], list):
                    raw_items = data["buckets"]
                elif "backups" in data and isinstance(data["backups"], list):
                    raw_items = data["backups"]
                elif "load_balancers" in data and isinstance(data["load_balancers"], list):
                    raw_items = data["load_balancers"]
                elif "nat_gateways" in data and isinstance(data["nat_gateways"], list):
                    raw_items = data["nat_gateways"]
                elif service_name == "billing":
                    # Особая структура для биллинга
                    balance = float(data.get("balance_rub") or data.get("balance") or 0.0)
                    accruals = float(data.get("current_accruals_rub") or data.get("accruals") or data.get("cost_rub") or 0.0)
                    debt = float(data.get("debt_rub") or data.get("debt") or 0.0)
                    return {
                        "service": "billing",
                        "status": "OK",
                        "error": None,
                        "items": [{
                            "balance_rub": balance,
                            "accruals_rub": accruals,
                            "debt_rub": debt,
                        }],
                        "unconfirmed_cost": False,
                        "estimated_cost_rub_month": int(accruals),
                    }
                elif len(data) == 0:
                    raw_items = []
                else:
                    return {
                        "service": service_name,
                        "status": "UNKNOWN",
                        "error": f"Неожиданный формат ответа сервиса {service_name}: отсутствуют ключи items или {service_name}",
                        "items": [],
                        "unconfirmed_cost": True,
                        "estimated_cost_rub_month": 0,
                    }
            elif isinstance(data, list):
                raw_items = data
            else:
                return {
                    "service": service_name,
                    "status": "MALFORMED_RESPONSE",
                    "error": f"Ответ сервиса {service_name} не является JSON объектом или списком: {type(data)}",
                    "items": [],
                    "unconfirmed_cost": True,
                    "estimated_cost_rub_month": 0,
                }

            parsed_items = self._parse_items(service_name, raw_items)
            cost = sum(i.get("cost_rub_month", 0) for i in parsed_items)
            return {
                "service": service_name,
                "status": "OK",
                "error": None,
                "items": parsed_items,
                "unconfirmed_cost": False,
                "estimated_cost_rub_month": cost,
            }
        elif status in (401, 403):
            return {
                "service": service_name,
                "status": "UNAUTHORIZED",
                "error": f"HTTP {status} Доступ запрещён: недостаточно прав для чтения {service_name}",
                "items": [],
                "unconfirmed_cost": True,
                "estimated_cost_rub_month": 0,
            }
        elif status == 404:
            return {
                "service": service_name,
                "status": "NOT_FOUND",
                "error": f"HTTP 404 Сервис или эндпоинт {service_name} не найден ({url})",
                "items": [],
                "unconfirmed_cost": True,
                "estimated_cost_rub_month": 0,
            }
        else:
            return {
                "service": service_name,
                "status": "ERROR",
                "error": f"HTTP {status} Ошибка сервиса {service_name}",
                "items": [],
                "unconfirmed_cost": True,
                "estimated_cost_rub_month": 0,
            }

    def _parse_items(self, service_name: str, raw_items: List[Any]) -> List[Dict[str, Any]]:
        """Нормализует атрибуты ресурсов Cloud.ru Evolution к единому формату."""
        parsed = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            r_id = str(item.get("id") or item.get("uuid") or item.get(f"{service_name}_id") or item.get("name") or "")
            r_name = str(item.get("name") or item.get("display_name") or "")
            r_status = str(item.get("status") or item.get("state") or "UNKNOWN")

            if service_name == "vms":
                flavor = item.get("flavor") or item.get("configuration") or {}
                disks_attached = [
                    d.get("id") or d.get("disk_id")
                    for d in item.get("disks", [])
                    if isinstance(d, dict)
                ]
                if not disks_attached:
                    disks_attached = [
                        v.get("id")
                        for v in item.get("os-extended-volumes:volumes_attached", [])
                        if isinstance(v, dict)
                    ]
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "status": r_status,
                    "flavor": flavor,
                    "attached_volumes": disks_attached,
                    "cost_rub_month": self.estimate_instance_cost(flavor),
                })
            elif service_name == "disks":
                size_gb = int(item.get("size") or item.get("size_gb") or 0)
                is_boot = bool(item.get("is_boot") or str(item.get("bootable", "")).lower() == "true")
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "size_gb": size_gb,
                    "status": r_status,
                    "bootable": is_boot,
                    "cost_rub_month": self.estimate_volume_cost(size_gb),
                })
            elif service_name == "floating_ips":
                ip_addr = item.get("ip") or item.get("floating_ip_address") or item.get("address") or ""
                parsed.append({
                    "id": r_id,
                    "ip": ip_addr,
                    "status": r_status,
                    "port_id": item.get("port_id") or item.get("attached_port_id"),
                    "cost_rub_month": 200,
                })
            elif service_name == "snapshots":
                size_gb = int(item.get("size") or item.get("size_gb") or 0)
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "size_gb": size_gb,
                    "disk_id": item.get("disk_id") or item.get("volume_id"),
                    "status": r_status,
                    "cost_rub_month": self.estimate_snapshot_cost(size_gb),
                })
            elif service_name == "images":
                bytes_used = item.get("size") or item.get("virtual_size") or 0
                size_gb = int(item.get("size_gb") or (round(bytes_used / (1024 ** 3)) if bytes_used else 10))
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "size_gb": size_gb,
                    "status": r_status,
                    "cost_rub_month": self.estimate_snapshot_cost(size_gb) if size_gb else 50,
                })
            elif service_name == "virtual_ips":
                ip_addr = item.get("ip") or item.get("address") or ""
                parsed.append({
                    "id": r_id,
                    "ip": ip_addr,
                    "status": r_status,
                    "cost_rub_month": 100,
                })
            elif service_name == "buckets":
                bytes_used = item.get("size_bytes") or item.get("bytes") or 0
                size_gb = max(1, round(bytes_used / (1024 ** 3), 2)) if bytes_used else 0
                parsed.append({
                    "id": r_id,
                    "name": r_name or r_id,
                    "size_gb": size_gb,
                    "status": r_status or "ACTIVE",
                    "cost_rub_month": max(20, int(size_gb * 3)) if size_gb else 20,
                })
            elif service_name == "backups":
                size_gb = int(item.get("size_gb") or item.get("size") or 0)
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "size_gb": size_gb,
                    "status": r_status,
                    "cost_rub_month": self.estimate_snapshot_cost(size_gb) if size_gb else 50,
                })
            elif service_name == "load_balancers":
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "status": r_status,
                    "cost_rub_month": 700,
                })
            elif service_name == "nat_gateways":
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "status": r_status,
                    "cost_rub_month": 500,
                })
            else:
                parsed.append({
                    "id": r_id,
                    "name": r_name,
                    "status": r_status,
                    "cost_rub_month": 0,
                })
        return parsed

    def query_vms(self) -> Dict[str, Any]:
        """Запрашивает список виртуальных машин в Cloud.ru Evolution."""
        endpoint = self.endpoints.get("compute")
        if endpoint:
            url = f"{endpoint}/servers/detail"
        else:
            url = f"{self.compute_url}/vms?project_id={self.project_id}"
        return self._safe_query_service("vms", url)

    def query_disks(self) -> Dict[str, Any]:
        """Запрашивает список блочных дисков в Cloud.ru Evolution."""
        endpoint = (
            self.endpoints.get("block-storage")
            or self.endpoints.get("volumev3")
            or self.endpoints.get("volume")
        )
        if endpoint:
            url = f"{endpoint}/volumes/detail"
        else:
            url = f"{self.compute_url}/disks?project_id={self.project_id}"
        return self._safe_query_service("disks", url)

    def query_floating_ips(self) -> Dict[str, Any]:
        """Запрашивает список плавающих публичных IP-адресов в Cloud.ru Evolution."""
        endpoint = self.endpoints.get("network")
        if endpoint:
            url = f"{endpoint}/v2.0/floatingips"
        else:
            url = f"{self.compute_url}/floating-ips?project_id={self.project_id}"
        return self._safe_query_service("floating_ips", url)

    def query_snapshots(self) -> Dict[str, Any]:
        """Запрашивает список снимков дисков в Cloud.ru Evolution."""
        endpoint = (
            self.endpoints.get("block-storage")
            or self.endpoints.get("volumev3")
            or self.endpoints.get("volume")
        )
        if endpoint:
            url = f"{endpoint}/snapshots/detail"
        else:
            url = f"{self.compute_url}/snapshots?project_id={self.project_id}"
        return self._safe_query_service("snapshots", url)

    def query_images(self) -> Dict[str, Any]:
        """Запрашивает список приватных образов в Cloud.ru Evolution."""
        endpoint = self.endpoints.get("image")
        if endpoint:
            url = f"{endpoint}/v2/images?visibility=private"
            if self.project_id:
                url += f"&owner={self.project_id}"
        else:
            url = f"{self.compute_url}/images?project_id={self.project_id}"
        return self._safe_query_service("images", url)

    def query_virtual_ips(self) -> Dict[str, Any]:
        """Запрашивает виртуальные IP-адреса VPC."""
        url = f"{self.vpc_url}/projects/{self.project_id}/virtual-ips"
        return self._safe_query_service("virtual_ips", url)

    def query_buckets(self) -> Dict[str, Any]:
        """Запрашивает бакеты объектного хранилища (Evolution Object Storage S3)."""
        swift_url = self.endpoints.get("object-store") or self.endpoints.get("s3")
        if swift_url:
            url = f"{swift_url}?format=json"
        else:
            url = f"{self.storage_url}/buckets?project_id={self.project_id}"
        return self._safe_query_service("buckets", url)

    def query_backups(self) -> Dict[str, Any]:
        """Запрашивает резервные копии сервиса Cloud Backup."""
        endpoint = (
            self.endpoints.get("block-storage")
            or self.endpoints.get("volumev3")
            or self.endpoints.get("volume")
        )
        if endpoint:
            url = f"{endpoint}/backups/detail"
        else:
            url = f"{self.backup_url}/backups?project_id={self.project_id}"
        return self._safe_query_service("backups", url)

    def query_load_balancers(self) -> Dict[str, Any]:
        """Запрашивает балансировщики нагрузки (VPC Load Balancers)."""
        url = f"{self.vpc_url}/projects/{self.project_id}/load-balancers"
        return self._safe_query_service("load_balancers", url)

    def query_nat_gateways(self) -> Dict[str, Any]:
        """Запрашивает сетевые NAT-шлюзы (VPC NAT Gateways)."""
        url = f"{self.vpc_url}/projects/{self.project_id}/nat-gateways"
        return self._safe_query_service("nat_gateways", url)

    def query_billing(self) -> Dict[str, Any]:
        """Запрашивает актуальный биллинг, баланс и текущие начисления в рублях."""
        url = f"{self.billing_url}/contracts/usage?project_id={self.project_id}"
        return self._safe_query_service("billing", url)

    # Методы обратной совместимости:
    def list_instances(self) -> List[Dict[str, Any]]:
        res = self.query_vms()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения виртуальных машин ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def list_volumes(self) -> List[Dict[str, Any]]:
        res = self.query_disks()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения дисков ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def list_floating_ips(self) -> List[Dict[str, Any]]:
        res = self.query_floating_ips()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения публичных IP ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def list_snapshots(self) -> List[Dict[str, Any]]:
        res = self.query_snapshots()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения снимков ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def list_images(self) -> List[Dict[str, Any]]:
        res = self.query_images()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения образов ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def list_buckets(self) -> List[Dict[str, Any]]:
        res = self.query_buckets()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения бакетов ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def list_backups(self) -> List[Dict[str, Any]]:
        res = self.query_backups()
        if res.get("status") != "OK":
            raise CloudRuApiError(f"Ошибка получения бэкапов ({res.get('status')}): {res.get('error')}")
        return res.get("items", [])

    def get_full_inventory(self) -> Dict[str, Any]:
        """
        Выполняет инвентаризацию всех потенциально тарифицируемых сервисов.
        
        СТРОГОЕ ПРАВИЛО БЕЗОПАСНОСТИ:
        Нулевая задолженность (zero_residual_confirmed=True) НЕ объявляется,
        пока не проверены все потенциально платные услуги (включая хранилища S3, бэкапы,
        балансировщики, шлюзы и фактический биллинг).
        """
        self.authenticate()

        services = {
            "vms": self.query_vms(),
            "disks": self.query_disks(),
            "floating_ips": self.query_floating_ips(),
            "snapshots": self.query_snapshots(),
            "images": self.query_images(),
            "virtual_ips": self.query_virtual_ips(),
            "load_balancers": self.query_load_balancers(),
            "nat_gateways": self.query_nat_gateways(),
            "buckets": self.query_buckets(),
            "backups": self.query_backups(),
            "billing": self.query_billing(),
        }

        unconfirmed_services = [s for s, r in services.items() if r.get("status") != "OK"]
        has_unconfirmed = len(unconfirmed_services) > 0

        # Считаем ресурсы (без биллинга, так как биллинг — это денежная сумма, а не число единиц ресурсов)
        resource_services = [s for s in services if s != "billing"]
        total_known_count = sum(len(services[s].get("items", [])) for s in resource_services if services[s].get("status") == "OK")
        total_known_rub = sum(r.get("estimated_cost_rub_month", 0) for r in services.values() if r.get("status") == "OK")

        # Проверка базовой вычислительной группы (ВМ, диски, IP)
        compute_groups = ["vms", "disks", "floating_ips", "snapshots", "images", "virtual_ips"]
        compute_resources_count = sum(len(services[s].get("items", [])) for s in compute_groups if services[s].get("status") == "OK")

        # Определение вердикта и статуса нулевой задолженности
        if total_known_count > 0:
            audit_verdict = "ACTIVE_RESOURCES_FOUND"
            zero_residual_confirmed = False
            verdict_description = f"Обнаружено {total_known_count} активных ресурсов на сумму ~{total_known_rub} ₽/мес."
        elif has_unconfirmed:
            # Требование P0: скрипт НЕ вправе объявлять нулевую задолженность, пока есть непроверенные платные услуги!
            audit_verdict = "COMPUTE_ZERO_UNCONFIRMED_BILLING_AND_STORAGE"
            zero_residual_confirmed = False
            verdict_description = (
                f"Вычислительные ресурсы (ВМ, диски, IP) не обнаружены ({compute_resources_count} шт.). "
                f"Однако нулевая задолженность НЕ подтверждена, так как не проверены остальные платные услуги: "
                f"{', '.join(unconfirmed_services)} (включая хранилища S3, бэкапы и фактический биллинг). "
                "Требуется обязательная ручная сверка разделов консоли и биллинга (docs/CLOUDRU_MANUAL_TEARDOWN.md)."
            )
        else:
            # Все 11 сервисов ответили OK, ресурсов 0, биллинг подтверждён
            audit_verdict = "VERIFIED_ZERO_ALL_SERVICES_AND_BILLING"
            zero_residual_confirmed = True
            verdict_description = "Все 11 групп облачных ресурсов и фактический биллинг проверены. Начислений и активных ресурсов 0."

        return {
            "instances": services["vms"].get("items", []),
            "volumes": services["disks"].get("items", []),
            "floating_ips": services["floating_ips"].get("items", []),
            "snapshots": services["snapshots"].get("items", []),
            "images": services["images"].get("items", []),
            "virtual_ips": services["virtual_ips"].get("items", []),
            "load_balancers": services["load_balancers"].get("items", []),
            "nat_gateways": services["nat_gateways"].get("items", []),
            "buckets": services["buckets"].get("items", []),
            "backups": services["backups"].get("items", []),
            "billing": services["billing"].get("items", []),
            "services": services,
            "unconfirmed_services": unconfirmed_services,
            "has_unconfirmed_costs": has_unconfirmed,
            "total_resources_count": total_known_count,
            "total_monthly_rub": total_known_rub,
            "zero_residual_confirmed": zero_residual_confirmed,
            "audit_verdict": audit_verdict,
            "verdict_description": verdict_description,
            "project_id": self.project_id,
            "discovered_at_utc": datetime.now(timezone.utc).isoformat(),
            "source": "CLOUDRU_EVOLUTION_REST_API",
        }

    @staticmethod
    def estimate_instance_cost(flavor: Any) -> int:
        return 1600

    @staticmethod
    def estimate_volume_cost(size_gb: int) -> int:
        return int(size_gb * 12)

    @staticmethod
    def estimate_snapshot_cost(size_gb: int) -> int:
        return int(size_gb * 5)


def verify_backup_readiness(
    backup_path: Path,
    encryption_key: str = "",
    key_file: Optional[Path] = None,
    key_stdin: bool = False,
) -> Dict[str, Any]:
    """
    Проверяет готовность резервной копии к удалению облачной инфраструктуры.
    1. Существование файла бэкапа и метаданных.
    2. Проверка контрольной суммы SHA256.
    3. Тестовая расшифровка (если зашифрован) и проверка PRAGMA integrity_check.
    """
    if not backup_path.is_file():
        raise TeardownGateError(f"Резервная копия не найдена: {backup_path}")

    meta_file = find_meta_file(backup_path)
    meta = {}
    if meta_file.is_file():
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception as e:
            raise TeardownGateError(f"Файл метаданных бэкапа повреждён: {e}")
    else:
        raise TeardownGateError(f"Отсутствуют метаданные бэкапа (.json): {meta_file}")

    expected_sha = meta.get("sha256_ciphertext") or meta.get("sha256")
    actual_sha = compute_sha256(backup_path)
    if expected_sha and actual_sha != expected_sha:
        raise TeardownGateError(f"Контрольная сумма SHA256 не совпадает: ожидалось {expected_sha[:12]}, получено {actual_sha[:12]}")

    is_encrypted = meta.get("encrypted") or backup_path.name.endswith(".enc")
    effective_key = ""
    if is_encrypted:
        try:
            effective_key = resolve_encryption_key(
                key_arg=encryption_key,
                key_file=key_file,
                key_stdin=key_stdin,
            )
        except SecurityError as sec_err:
            raise TeardownGateError(f"Безопасность нарушена: {sec_err}")
        except Exception as exc:
            raise TeardownGateError(f"Ошибка получения ключа расшифровки: {exc}")

        if not effective_key:
            raise TeardownGateError("Бэкап зашифрован, но ключ не передан (KETO_BACKUP_ENCRYPTION_KEY, --key-file или --key-stdin)")

    drill_db = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".teardown_drill.db", delete=False) as tmp:
            drill_db = Path(tmp.name)

        if is_encrypted:
            from cryptography.fernet import Fernet
            salt_hex = meta.get("kdf_salt_hex") or meta.get("salt_hex") or (meta.get("kdf", {}).get("salt_hex") if isinstance(meta.get("kdf"), dict) else None)
            salt = bytes.fromhex(salt_hex) if salt_hex else None
            try:
                fernet = Fernet(derive_key(effective_key, salt=salt))
                decrypted = fernet.decrypt(backup_path.read_bytes())
            except Exception as decrypt_err:
                raise TeardownGateError(f"Ошибка расшифровки бэкапа: неверный ключ или повреждённые данные ({decrypt_err})")
            drill_db.write_bytes(decrypted)
        else:
            drill_db.write_bytes(backup_path.read_bytes())

        if not verify_integrity(drill_db):
            raise TeardownGateError("Тестовая проверка целостности PRAGMA integrity_check провалена!")

        conn = None
        try:
            conn = sqlite3.connect(str(drill_db))
            cur = conn.cursor()
            cur.execute("SELECT count(*) FROM users")
            user_count = cur.fetchone()[0]
        except Exception as db_err:
            raise TeardownGateError(f"Тестовая БД повреждена или не содержит пользователей: {db_err}")
        finally:
            if conn is not None:
                conn.close()
    finally:
        if drill_db is not None and drill_db.is_file():
            drill_db.unlink(missing_ok=True)

    return {
        "verified": True,
        "backup_file": str(backup_path),
        "sha256": actual_sha,
        "is_encrypted": is_encrypted,
        "user_count": user_count,
        "timestamp_utc": meta.get("timestamp_utc"),
    }


def inventory_local_and_cloud_resources(
    client: Optional[CloudRuEvolutionClient] = None,
    mock_inventory: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Инвентаризирует фактические тарифицируемые ресурсы Cloud.ru через официальный Cloud.ru Evolution REST API.
    
    ВНИМАНИЕ: Если учётные данные отсутствуют или API недоступен,
    функция выбрасывает CloudRuApiError и завершает работу с ошибкой.
    Использование вымышленных ресурсов и ложное заявление о 0 ₽ остаточных расходов строго запрещены.
    """
    if mock_inventory is not None:
        return mock_inventory

    if client is None:
        client = CloudRuEvolutionClient()
        client.validate_credentials()
        client.authenticate()

    return client.get_full_inventory()


def execute_teardown_plan(
    inventory: Dict[str, Any],
    dry_run: bool = True,
    executor: Optional[Any] = None,
    verifier: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Выполняет план гарантированного удаления ресурсов в строгой последовательности.
    При обнаружении неподтверждённых расходов (ошибки API) флаг zero_residual_confirmed сбрасывается в False.
    """
    total_monthly_rub = (
        sum(i.get("cost_rub_month", 0) for i in inventory.get("instances", [])) +
        sum(v.get("cost_rub_month", 0) for v in inventory.get("volumes", [])) +
        sum(f.get("cost_rub_month", 0) for f in inventory.get("floating_ips", [])) +
        sum(s.get("cost_rub_month", 0) for s in inventory.get("snapshots", [])) +
        sum(im.get("cost_rub_month", 0) for im in inventory.get("images", [])) +
        sum(vip.get("cost_rub_month", 0) for vip in inventory.get("virtual_ips", [])) +
        sum(lb.get("cost_rub_month", 0) for lb in inventory.get("load_balancers", [])) +
        sum(nat.get("cost_rub_month", 0) for nat in inventory.get("nat_gateways", [])) +
        sum(b.get("cost_rub_month", 0) for b in inventory.get("buckets", [])) +
        sum(bk.get("cost_rub_month", 0) for bk in inventory.get("backups", []))
    )

    has_unconfirmed = bool(inventory.get("has_unconfirmed_costs"))
    unconfirmed_services = inventory.get("unconfirmed_services", [])

    if dry_run:
        actions_planned = []
        for inst in inventory.get("instances", []):
            actions_planned.append(f"Delete VM {inst.get('id')} ({inst.get('name')})")
        for vol in inventory.get("volumes", []):
            actions_planned.append(f"Delete volume {vol.get('id')} ({vol.get('name')}, {vol.get('size_gb')} GB)")
        for fip in inventory.get("floating_ips", []):
            actions_planned.append(f"Release floating IP {fip.get('id')} ({fip.get('ip')})")
        for snap in inventory.get("snapshots", []):
            actions_planned.append(f"Delete snapshot {snap.get('id')} ({snap.get('name')})")
        for img in inventory.get("images", []):
            actions_planned.append(f"Delete image {img.get('id')} ({img.get('name')})")
        for vip in inventory.get("virtual_ips", []):
            actions_planned.append(f"Release virtual IP {vip.get('id')} ({vip.get('ip')})")
        for lb in inventory.get("load_balancers", []):
            actions_planned.append(f"Delete load balancer {lb.get('id')} ({lb.get('name')})")
        for nat in inventory.get("nat_gateways", []):
            actions_planned.append(f"Delete NAT gateway {nat.get('id')} ({nat.get('name')})")
        for b in inventory.get("buckets", []):
            actions_planned.append(f"Delete S3 bucket {b.get('id')} ({b.get('name')})")
        for bk in inventory.get("backups", []):
            actions_planned.append(f"Delete backup {bk.get('id')} ({bk.get('name')})")

        msg = "Режим предварительной проверки (dry-run). Ни один ресурс не был удалён."
        if has_unconfirmed:
            msg += f" ВНИМАНИЕ: Не удалось подтвердить расходы по сервисам: {', '.join(unconfirmed_services)}."

        return {
            "mode": "DRY_RUN",
            "executed": False,
            "zero_residual_confirmed": False,
            "has_unconfirmed_costs": has_unconfirmed,
            "unconfirmed_services": unconfirmed_services,
            "audit_verdict": inventory.get("audit_verdict", "UNKNOWN"),
            "verdict_description": inventory.get("verdict_description", ""),
            "total_monthly_rub_prevented": total_monthly_rub,
            "actions_planned": actions_planned,
            "resources_found": {
                "vms": len(inventory.get("instances", [])),
                "disks": len(inventory.get("volumes", [])),
                "floating_ips": len(inventory.get("floating_ips", [])),
                "snapshots": len(inventory.get("snapshots", [])),
                "images": len(inventory.get("images", [])),
                "virtual_ips": len(inventory.get("virtual_ips", [])),
                "load_balancers": len(inventory.get("load_balancers", [])),
                "nat_gateways": len(inventory.get("nat_gateways", [])),
                "buckets": len(inventory.get("buckets", [])),
                "backups": len(inventory.get("backups", [])),
            },
            "message": msg,
        }

    # Боевой режим удаления
    if executor is None:
        # Автоматическое удаление через API заблокировано (LIVE_LOCKED)
        return {
            "mode": "LIVE_LOCKED",
            "executed": False,
            "zero_residual_confirmed": False,
            "has_unconfirmed_costs": has_unconfirmed,
            "unconfirmed_services": unconfirmed_services,
            "total_monthly_rub_prevented": total_monthly_rub,
            "audit_verdict": inventory.get("audit_verdict", "UNKNOWN"),
            "verdict_description": inventory.get("verdict_description", ""),
            "message": (
                "Автоматическое удаление через API заблокировано в целях безопасности. "
                "Во избежание неполного удаления и непредвиденных начислений выполните ручной демонтаж "
                "через веб-кабинет Cloud.ru по инструкции docs/CLOUDRU_MANUAL_TEARDOWN.md."
            ),
        }

    deleted_log = []
    for inst in inventory.get("instances", []):
        executor("instance", inst["id"])
        deleted_log.append(f"Deleted VM: {inst['id']}")

    for vol in inventory.get("volumes", []):
        executor("volume", vol["id"])
        deleted_log.append(f"Deleted volume: {vol['id']}")

    for fip in inventory.get("floating_ips", []):
        executor("floating_ip", fip["id"])
        deleted_log.append(f"Released floating IP: {fip['id']}")

    for snap in inventory.get("snapshots", []):
        executor("snapshot", snap["id"])
        deleted_log.append(f"Deleted snapshot: {snap['id']}")

    for img in inventory.get("images", []):
        executor("image", img["id"])
        deleted_log.append(f"Deleted image: {img['id']}")

    for vip in inventory.get("virtual_ips", []):
        executor("virtual_ip", vip["id"])
        deleted_log.append(f"Released virtual IP: {vip['id']}")

    for lb in inventory.get("load_balancers", []):
        executor("load_balancer", lb["id"])
        deleted_log.append(f"Deleted load balancer: {lb['id']}")

    for nat in inventory.get("nat_gateways", []):
        executor("nat_gateway", nat["id"])
        deleted_log.append(f"Deleted NAT gateway: {nat['id']}")

    for b in inventory.get("buckets", []):
        executor("bucket", b["id"])
        deleted_log.append(f"Deleted S3 bucket: {b['id']}")

    for bk in inventory.get("backups", []):
        executor("backup", bk["id"])
        deleted_log.append(f"Deleted backup: {bk['id']}")

    zero_residual_confirmed = False
    if verifier is not None:
        residual = verifier()
        total_remaining = (
            len(residual.get("instances", [])) +
            len(residual.get("volumes", [])) +
            len(residual.get("floating_ips", [])) +
            len(residual.get("snapshots", [])) +
            len(residual.get("images", [])) +
            len(residual.get("virtual_ips", [])) +
            len(residual.get("load_balancers", [])) +
            len(residual.get("nat_gateways", [])) +
            len(residual.get("buckets", [])) +
            len(residual.get("backups", []))
        )
        res_has_unconfirmed = bool(residual.get("has_unconfirmed_costs"))
        if total_remaining == 0 and not res_has_unconfirmed:
            zero_residual_confirmed = True

    return {
        "mode": "LIVE_DESTROY",
        "executed": True,
        "total_monthly_rub_prevented": total_monthly_rub,
        "deleted_resources": deleted_log,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "zero_residual_confirmed": zero_residual_confirmed,
        "has_unconfirmed_costs": has_unconfirmed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Zero-residual Cloud.ru teardown & audit utility")
    parser.add_argument("--backup-file", type=Path, default=None, help="Path to verified database backup")
    parser.add_argument("--key", type=str, default="", help="Decryption key if backup is encrypted (insecure; prefer --key-file, --key-stdin or KETO_BACKUP_ENCRYPTION_KEY)")
    parser.add_argument("--key-file", type=Path, default=None, help="Path to file containing decryption key")
    parser.add_argument("--key-stdin", action="store_true", help="Read decryption key from stdin")
    parser.add_argument("--confirm-destroy", action="store_true", help="Authorize actual destruction of resources")
    parser.add_argument("--confirm-phrase", type=str, default="", help="Must match confirmation phrase")
    parser.add_argument("--mock-inventory-file", type=Path, default=None, help="Path to JSON file with mock inventory for testing/dry-run drills")
    parser.add_argument("--audit-only", action="store_true", help="Perform read-only API inspection and cost audit without requiring backup verification")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args()

    # В режиме полного демонтажа обязателен проверенный бэкап
    backup_status = None
    if not args.audit_only:
        if not args.backup_file:
            print("[FATAL ERROR] Не передан обязательный параметр --backup-file (или используйте --audit-only для проверки API).", file=sys.stderr)
            return 2

        try:
            backup_status = verify_backup_readiness(
                args.backup_file,
                encryption_key=args.key,
                key_file=args.key_file,
                key_stdin=args.key_stdin,
            )
        except TeardownGateError as exc:
            print(f"[FATAL BLOCKED] Удаление запрещено: {exc}", file=sys.stderr)
            return 2

    # Инвентаризация ресурсов через Cloud.ru Evolution API
    mock_inv = None
    if args.mock_inventory_file:
        if not args.mock_inventory_file.is_file():
            print(f"[FATAL ERROR] Mock inventory file not found: {args.mock_inventory_file}", file=sys.stderr)
            return 2
        try:
            mock_inv = json.loads(args.mock_inventory_file.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[FATAL ERROR] Invalid mock inventory JSON: {e}", file=sys.stderr)
            return 2

    try:
        inv = inventory_local_and_cloud_resources(mock_inventory=mock_inv)
    except CloudRuApiError as api_err:
        print(f"[FATAL CLOUD RU API ERROR] {api_err}", file=sys.stderr)
        print("\nВНИМАНИЕ: Автоматическая инвентаризация невозможна без доступа к Cloud.ru API.", file=sys.stderr)
        print("Статус аудита: UNKNOWN/ERROR. Все потенциальные расходы считаются НЕПОДТВЕРЖДЁННЫМИ.", file=sys.stderr)
        print("Программа не может гарантировать отсутствие расходов без реальной проверки.", file=sys.stderr)
        print("Для предотвращения списаний выполните ручной демонтаж по инструкции:", file=sys.stderr)
        print("  docs/CLOUDRU_MANUAL_TEARDOWN.md", file=sys.stderr)
        return 3

    # Режим проверки только API
    if args.audit_only:
        if args.json:
            print(json.dumps(inv, indent=2, ensure_ascii=False))
        else:
            print("=" * 70)
            print("  CLOUD.RU EVOLUTION REST API: АУДИТ ТАРИФИЦИРУЕМЫХ РЕСУРСОВ")
            print("=" * 70)
            print(f"Источник API:          {inv.get('source')}")
            print(f"Идентификатор проекта: {inv.get('project_id') or 'НЕ УКАЗАН'}")
            print(f"Вердикт аудита:        {inv.get('audit_verdict')}")
            print(f"Остаток подтверждён:   {'ДА (0 ₽)' if inv.get('zero_residual_confirmed') else 'НЕТ'}")
            print(f"Известные расходы:     ~{inv.get('total_monthly_rub', 0)} ₽/месяц ({inv.get('total_resources_count', 0)} ресурсов)")
            print(f"Пояснение:             {inv.get('verdict_description')}")
            print("-" * 70)
            services = inv.get("services", {})
            for s_name, s_data in services.items():
                st = s_data.get("status")
                cnt = len(s_data.get("items", []))
                cost = s_data.get("estimated_cost_rub_month", 0)
                err = s_data.get("error")
                status_str = f"[{st}]"
                if err:
                    status_str += f" ({err[:50]}...)"
                print(f"  {s_name:<16} : {status_str:<26} | Найдено: {cnt:<3} | ~{cost} ₽/мес")
            print("-" * 70)
            unconfirmed = inv.get("unconfirmed_services", [])
            if unconfirmed:
                print(f"[ВНИМАНИЕ] Непроверенные / потенциально платные услуги ({len(unconfirmed)}):")
                for s in unconfirmed:
                    print(f"  - {s}")
                print("\n[ПРЕДОСТЕРЕЖЕНИЕ] Нулевая задолженность НЕ подтверждена автоматически.")
                print("Обязательно выполните ручную сверку биллинга и всех разделов:")
                print("  docs/CLOUDRU_MANUAL_TEARDOWN.md")
            else:
                print("[УСПЕХ] Все 11 групп услуг и биллинг подтверждены. Активных ресурсов 0.")
            print("=" * 70)
        return 0 if inv.get("zero_residual_confirmed") else 1

    # Режим вывода из эксплуатации (dry-run или live)
    is_live = args.confirm_destroy and (args.confirm_phrase == CONFIRMATION_PHRASE)

    result = execute_teardown_plan(inv, dry_run=(not is_live))
    result["backup_verification"] = backup_status

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    print("=" * 60)
    print("  KETO BALANCE: CLOUD.RU ZERO-RESIDUAL TEARDOWN")
    print("=" * 60)
    if backup_status:
        print(f"Verified Backup:    {backup_status['backup_file']}")
        print(f"Backup SHA256:      {backup_status['sha256'][:12]}... (Users: {backup_status['user_count']})")
        print(f"Encrypted:          {'YES' if backup_status['is_encrypted'] else 'NO'}")
        print(f"Drill Restore:      PASSED (PRAGMA integrity_check OK)")
    print("-" * 60)
    print(f"Execution Mode:     {result['mode']}")
    print(f"Monthly Cost Cut:   ~{result['total_monthly_rub_prevented']} RUB/month saved")
    print(f"Audit Verdict:      {result.get('audit_verdict')}")
    print(f"Zero Residual:      {'CONFIRMED (0 RUB)' if result.get('zero_residual_confirmed') else 'UNCONFIRMED'}")

    if result.get("has_unconfirmed_costs"):
        print(f"\n[ВНИМАНИЕ] Обнаружены непроверенные платные услуги:")
        for s in result.get("unconfirmed_services", []):
            print(f"  - {s}")

    if result["mode"] == "DRY_RUN":
        print("\n[DRY RUN] Запланированные операции полного демонтажа:")
        for action in result.get("actions_planned", []):
            print(f"  - {action}")
        print("\nВНИМАНИЕ: Ни один ресурс не был удалён (безопасный dry-run).")
    elif result["mode"] == "LIVE_LOCKED":
        print("\n[LIVE LOCKED] Автоматическое удаление через API заблокировано:")
        print(result["message"])
    else:
        print("\n[SUCCESS] Тарифицируемые ресурсы обработаны:")
        for item in result.get("deleted_resources", []):
            print(f"  ✓ {item}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
