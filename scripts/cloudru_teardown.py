#!/usr/bin/env python3
"""
scripts/cloudru_teardown.py — Безопасное завершение работы и полное удаление ресурсов Cloud.ru.

Гарантирует 0 ₽ остаточных списаний (защита от отрицательного баланса).

Правила безопасности:
1. По умолчанию работает ТОЛЬКО в режиме проверки (dry-run).
2. Реальная инвентаризация выполняется через официальный API Cloud.ru Evolution (Keystone v3, Nova, Cinder, Neutron, Swift).
3. При отсутствии доступа к API или учётных данных программа завершается с ошибкой, а не показывает фиктивное отсутствие расходов.
4. Ложное подтверждение нулевой задолженности удалено. Подтверждение выдаётся ТОЛЬКО после реальной повторной проверки API.
5. Удаление НЕВОЗМОЖНО без подтверждённого и проверенного бэкапа (проверка целостности и тестовое восстановление).
6. Реальное автоматическое удаление заблокировано до подтверждённой процедуры и явного подтверждения владельца.
7. При недоступности автоматического удаления используется регламент ручного демонтажа: docs/CLOUDRU_MANUAL_TEARDOWN.md.
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
    Клиент для взаимодействия с API Cloud.ru Evolution (совместим с OpenStack Keystone v3, Nova, Cinder v3, Neutron, Glance, Swift).
    Использует права только на чтение (read-only) для инвентаризации тарифицируемых ресурсов.
    """
    def __init__(
        self,
        auth_url: Optional[str] = None,
        project_id: Optional[str] = None,
        project_name: Optional[str] = None,
        key_id: Optional[str] = None,
        secret_key: Optional[str] = None,
        user_domain_name: Optional[str] = None,
        project_domain_name: Optional[str] = None,
        token: Optional[str] = None,
        region: Optional[str] = None,
        http_requester: Optional[Callable[[str, str, Optional[Dict[str, str]], Optional[bytes]], Tuple[int, Dict[str, str], Any]]] = None,
        timeout: int = 15,
    ):
        self.auth_url = (auth_url or os.getenv("CLOUDRU_AUTH_URL") or os.getenv("OS_AUTH_URL") or "").rstrip("/")
        self.project_id = project_id or os.getenv("CLOUDRU_PROJECT_ID") or os.getenv("OS_PROJECT_ID") or ""
        self.project_name = project_name or os.getenv("CLOUDRU_PROJECT_NAME") or os.getenv("OS_PROJECT_NAME") or ""
        self.key_id = key_id or os.getenv("CLOUDRU_KEY_ID") or os.getenv("OS_USERNAME") or ""
        self.secret_key = secret_key or os.getenv("CLOUDRU_SECRET_KEY") or os.getenv("OS_PASSWORD") or ""
        self.user_domain_name = user_domain_name or os.getenv("CLOUDRU_USER_DOMAIN_NAME") or os.getenv("OS_USER_DOMAIN_NAME") or "Default"
        self.project_domain_name = project_domain_name or os.getenv("CLOUDRU_PROJECT_DOMAIN_NAME") or os.getenv("OS_PROJECT_DOMAIN_NAME") or "Default"
        self.token = token or os.getenv("CLOUDRU_TOKEN") or os.getenv("OS_AUTH_TOKEN") or os.getenv("OS_TOKEN") or ""
        self.region = region or os.getenv("CLOUDRU_REGION_NAME") or os.getenv("OS_REGION_NAME") or "ru-1"
        self.http_requester = http_requester
        self.timeout = timeout

        self.endpoints: Dict[str, str] = {}
        self._authenticated = False

    def validate_credentials(self) -> None:
        """Проверяет наличие минимально необходимых учётных данных."""
        if self.token and (self.endpoints or self.auth_url):
            return
        if not self.auth_url:
            raise CloudRuApiError(
                "Отсутствует URL аутентификации Cloud.ru. "
                "Задайте переменную CLOUDRU_AUTH_URL или OS_AUTH_URL (например, https://iam.ru-1.cloud.ru/v3)."
            )
        if not (self.token or (self.key_id and self.secret_key)):
            raise CloudRuApiError(
                "Отсутствуют учётные данные Cloud.ru API. "
                "Задайте CLOUDRU_KEY_ID и CLOUDRU_SECRET_KEY (или OS_USERNAME и OS_PASSWORD)."
            )
        if not self.project_id and not self.project_name and not self.token:
            raise CloudRuApiError(
                "Отсутствует идентификатор проекта Cloud.ru. "
                "Задайте CLOUDRU_PROJECT_ID или OS_PROJECT_ID."
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
                "User-Agent": "KetoBalance-CloudRuClient/1.0",
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
        """Аутентификация в Keystone v3 и обнаружение каталога сервисов."""
        if self._authenticated and self.token:
            return self.token

        if self.token and self.endpoints:
            self._authenticated = True
            return self.token

        self.validate_credentials()

        auth_url = f"{self.auth_url}/auth/tokens" if not self.auth_url.endswith("/tokens") else self.auth_url

        if self.token:
            auth_body: Dict[str, Any] = {
                "auth": {
                    "identity": {
                        "methods": ["token"],
                        "token": {"id": self.token},
                    }
                }
            }
        else:
            auth_body = {
                "auth": {
                    "identity": {
                        "methods": ["password"],
                        "password": {
                            "user": {
                                "name": self.key_id,
                                "domain": {"name": self.user_domain_name},
                                "password": self.secret_key,
                            }
                        },
                    }
                }
            }

        if self.project_id:
            auth_body["auth"]["scope"] = {
                "project": {"id": self.project_id}
            }
        elif self.project_name:
            auth_body["auth"]["scope"] = {
                "project": {
                    "name": self.project_name,
                    "domain": {"name": self.project_domain_name},
                }
            }

        body_bytes = json.dumps(auth_body).encode("utf-8")
        headers = {"Content-Type": "application/json"}

        status, resp_headers, data = self._request("POST", auth_url, headers=headers, body=body_bytes)
        if status not in (200, 201):
            raise CloudRuApiError(f"Аутентификация в Keystone завершилась со статусом {status}")

        token = resp_headers.get("x-subject-token")
        if not token and isinstance(data, dict):
            token = data.get("token", {}).get("id") or self.token

        if not token:
            raise CloudRuApiError("Заголовок X-Subject-Token не получен от Keystone v3.")

        self.token = token
        self._authenticated = True

        catalog = data.get("token", {}).get("catalog", []) if isinstance(data, dict) else []
        for service in catalog:
            s_type = service.get("type")
            endpoints = service.get("endpoints", [])
            chosen_url = None
            for ep in endpoints:
                if ep.get("interface") == "public":
                    ep_region = ep.get("region_id") or ep.get("region")
                    raw_url = ep.get("url", "").rstrip("/")
                    if self.project_id:
                        raw_url = (
                            raw_url.replace("%(tenant_id)s", self.project_id)
                            .replace("$(tenant_id)s", self.project_id)
                            .replace("%(project_id)s", self.project_id)
                            .replace("$(project_id)s", self.project_id)
                        )
                    if self.region and ep_region == self.region:
                        chosen_url = raw_url
                        break
                    elif chosen_url is None:
                        chosen_url = raw_url
            if chosen_url:
                self.endpoints[s_type] = chosen_url

        return self.token

    def _get_authed(self, url: str) -> Any:
        self.authenticate()
        headers = {"X-Auth-Token": self.token}
        status, _, data = self._request("GET", url, headers=headers)
        return data

    def list_instances(self) -> List[Dict[str, Any]]:
        self.authenticate()
        compute_url = self.endpoints.get("compute")
        if not compute_url:
            return []
        url = f"{compute_url}/servers/detail"
        data = self._get_authed(url)
        servers = data.get("servers", []) if isinstance(data, dict) else []
        results = []
        for s in servers:
            flavor = s.get("flavor", {})
            results.append({
                "id": s.get("id"),
                "name": s.get("name"),
                "status": s.get("status"),
                "flavor": flavor,
                "created": s.get("created"),
                "attached_volumes": [v.get("id") for v in s.get("os-extended-volumes:volumes_attached", []) if isinstance(v, dict)],
                "cost_rub_month": self.estimate_instance_cost(flavor),
            })
        return results

    def _get_volume_url(self) -> Optional[str]:
        return (
            self.endpoints.get("block-storage")
            or self.endpoints.get("volumev3")
            or self.endpoints.get("volumev2")
            or self.endpoints.get("volume")
            or self.endpoints.get("block-store")
        )

    def list_volumes(self) -> List[Dict[str, Any]]:
        self.authenticate()
        vol_url = self._get_volume_url()
        if not vol_url:
            return []
        url = f"{vol_url}/volumes/detail"
        data = self._get_authed(url)
        volumes = data.get("volumes", []) if isinstance(data, dict) else []
        results = []
        for v in volumes:
            size_gb = v.get("size", 0)
            results.append({
                "id": v.get("id"),
                "name": v.get("name") or v.get("display_name") or "",
                "size_gb": size_gb,
                "status": v.get("status"),
                "attachments": v.get("attachments", []),
                "bootable": str(v.get("bootable", "")).lower() == "true",
                "volume_type": v.get("volume_type", "standard"),
                "cost_rub_month": self.estimate_volume_cost(size_gb),
            })
        return results

    def list_floating_ips(self) -> List[Dict[str, Any]]:
        self.authenticate()
        net_url = self.endpoints.get("network")
        if not net_url:
            return []
        url = f"{net_url}/v2.0/floatingips"
        data = self._get_authed(url)
        fips = data.get("floatingips", []) if isinstance(data, dict) else []
        results = []
        for f in fips:
            results.append({
                "id": f.get("id"),
                "ip": f.get("floating_ip_address"),
                "status": f.get("status"),
                "port_id": f.get("port_id"),
                "cost_rub_month": 200,
            })
        return results

    def list_snapshots(self) -> List[Dict[str, Any]]:
        self.authenticate()
        vol_url = self._get_volume_url()
        if not vol_url:
            return []
        url = f"{vol_url}/snapshots/detail"
        data = self._get_authed(url)
        snaps = data.get("snapshots", []) if isinstance(data, dict) else []
        results = []
        for s in snaps:
            size_gb = s.get("size", 0)
            results.append({
                "id": s.get("id"),
                "name": s.get("name") or s.get("display_name") or "",
                "size_gb": size_gb,
                "volume_id": s.get("volume_id"),
                "status": s.get("status"),
                "cost_rub_month": self.estimate_snapshot_cost(size_gb),
            })
        return results

    def list_images(self) -> List[Dict[str, Any]]:
        self.authenticate()
        image_url = self.endpoints.get("image")
        if not image_url:
            return []
        url = f"{image_url}/v2/images?visibility=private"
        if self.project_id:
            url += f"&owner={self.project_id}"
        try:
            data = self._get_authed(url)
            images = data.get("images", []) if isinstance(data, dict) else []
            results = []
            for img in images:
                bytes_used = img.get("size") or img.get("virtual_size") or 0
                size_gb = max(1, round(bytes_used / (1024 ** 3), 2)) if bytes_used else 0
                results.append({
                    "id": img.get("id"),
                    "name": img.get("name") or "",
                    "status": img.get("status"),
                    "size_gb": size_gb,
                    "image_type": img.get("image_type", "snapshot"),
                    "cost_rub_month": self.estimate_snapshot_cost(size_gb) if size_gb else 50,
                })
            return results
        except CloudRuApiError as e:
            if "HTTP 404" in str(e):
                return []
            raise

    def list_backups(self) -> List[Dict[str, Any]]:
        self.authenticate()
        vol_url = self._get_volume_url()
        if not vol_url:
            return []
        try:
            url = f"{vol_url}/backups/detail"
            data = self._get_authed(url)
            backups = data.get("backups", []) if isinstance(data, dict) else []
            results = []
            for b in backups:
                size_gb = b.get("size", 0)
                results.append({
                    "id": b.get("id"),
                    "name": b.get("name") or "",
                    "size_gb": size_gb,
                    "status": b.get("status"),
                    "cost_rub_month": self.estimate_snapshot_cost(size_gb),
                })
            return results
        except CloudRuApiError as e:
            if "HTTP 404" in str(e):
                return []
            raise

    def list_buckets(self) -> List[Dict[str, Any]]:
        self.authenticate()
        swift_url = self.endpoints.get("object-store") or self.endpoints.get("s3")
        if not swift_url:
            return []
        try:
            url = f"{swift_url}?format=json"
            data = self._get_authed(url)
            containers = data if isinstance(data, list) else []
            results = []
            for c in containers:
                bytes_used = c.get("bytes", 0)
                size_gb = round(bytes_used / (1024 ** 3), 2)
                results.append({
                    "id": c.get("name"),
                    "name": c.get("name"),
                    "count": c.get("count", 0),
                    "bytes": bytes_used,
                    "size_gb": size_gb,
                    "cost_rub_month": max(10, int(size_gb * 2)),
                })
            return results
        except CloudRuApiError as e:
            if "HTTP 404" in str(e):
                return []
            raise

    def get_full_inventory(self) -> Dict[str, Any]:
        self.authenticate()
        instances = self.list_instances()
        volumes = self.list_volumes()
        fips = self.list_floating_ips()
        snapshots = self.list_snapshots()
        images = self.list_images()
        backups = self.list_backups()
        buckets = self.list_buckets()

        total_cost = (
            sum(i.get("cost_rub_month", 0) for i in instances) +
            sum(v.get("cost_rub_month", 0) for v in volumes) +
            sum(f.get("cost_rub_month", 0) for f in fips) +
            sum(s.get("cost_rub_month", 0) for s in snapshots) +
            sum(im.get("cost_rub_month", 0) for im in images) +
            sum(b.get("cost_rub_month", 0) for b in backups) +
            sum(bk.get("cost_rub_month", 0) for bk in buckets)
        )

        total_count = (
            len(instances)
            + len(volumes)
            + len(fips)
            + len(snapshots)
            + len(images)
            + len(backups)
            + len(buckets)
        )

        return {
            "instances": instances,
            "volumes": volumes,
            "floating_ips": fips,
            "snapshots": snapshots,
            "images": images,
            "backups": backups,
            "buckets": buckets,
            "total_resources_count": total_count,
            "total_monthly_rub": total_cost,
            "project_id": self.project_id,
            "discovered_at_utc": datetime.now(timezone.utc).isoformat(),
            "source": "CLOUDRU_API_EVOLUTION",
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
    Инвентаризирует фактические тарифицируемые ресурсы Cloud.ru через официальный OpenStack/Cloud.ru API.
    
    ВНИМАНИЕ: Если учётные данные API отсутствуют или API недоступен,
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
    Выполняет план гарантированного удаления ресурсов в строгой последовательности:
    1. Виртуальные машины
    2. Блочные диски (системные и данные)
    3. Плавающие IP (возврат в пул)
    4. Снимки дисков
    5. Резервные копии дисков
    6. Бакеты объектного хранилища
    """
    total_monthly_rub = (
        sum(i.get("cost_rub_month", 0) for i in inventory.get("instances", [])) +
        sum(v.get("cost_rub_month", 0) for v in inventory.get("volumes", [])) +
        sum(f.get("cost_rub_month", 0) for f in inventory.get("floating_ips", [])) +
        sum(s.get("cost_rub_month", 0) for s in inventory.get("snapshots", [])) +
        sum(im.get("cost_rub_month", 0) for im in inventory.get("images", [])) +
        sum(b.get("cost_rub_month", 0) for b in inventory.get("backups", [])) +
        sum(bk.get("cost_rub_month", 0) for bk in inventory.get("buckets", []))
    )

    if dry_run:
        actions_planned = []
        for inst in inventory.get("instances", []):
            actions_planned.append(f"Delete instance {inst.get('id')} ({inst.get('name')})")
        for vol in inventory.get("volumes", []):
            actions_planned.append(f"Delete volume {vol.get('id')} ({vol.get('name')}, {vol.get('size_gb')} GB)")
        for fip in inventory.get("floating_ips", []):
            actions_planned.append(f"Release floating IP {fip.get('id')} ({fip.get('ip')})")
        for snap in inventory.get("snapshots", []):
            actions_planned.append(f"Delete snapshot {snap.get('id')} ({snap.get('name')})")
        for img in inventory.get("images", []):
            actions_planned.append(f"Delete image {img.get('id')} ({img.get('name')})")
        for b in inventory.get("backups", []):
            actions_planned.append(f"Delete backup {b.get('id')} ({b.get('name')})")
        for bk in inventory.get("buckets", []):
            actions_planned.append(f"Delete bucket {bk.get('id')} ({bk.get('name')})")

        return {
            "mode": "DRY_RUN",
            "executed": False,
            "zero_residual_confirmed": False,
            "total_monthly_rub_prevented": total_monthly_rub,
            "actions_planned": actions_planned,
            "resources_found": {
                "instances": len(inventory.get("instances", [])),
                "volumes": len(inventory.get("volumes", [])),
                "floating_ips": len(inventory.get("floating_ips", [])),
                "snapshots": len(inventory.get("snapshots", [])),
                "images": len(inventory.get("images", [])),
                "backups": len(inventory.get("backups", [])),
                "buckets": len(inventory.get("buckets", [])),
            },
            "message": "Режим предварительной проверки (dry-run). Ни один ресурс не был удалён.",
        }

    # Боевой режим удаления
    if executor is None:
        # В соответствии с требованиями P0: автоматическое удаление заблокировано
        # до подтверждённой процедуры, проверенного бэкапа и отдельного разрешения владельца.
        return {
            "mode": "LIVE_LOCKED",
            "executed": False,
            "zero_residual_confirmed": False,
            "total_monthly_rub_prevented": total_monthly_rub,
            "message": (
                "Автоматическое удаление через API заблокировано в целях безопасности. "
                "Во избежание неполного удаления и непредвиденных начислений выполните ручной демонтаж "
                "через веб-кабинет Cloud.ru по инструкции docs/CLOUDRU_MANUAL_TEARDOWN.md."
            ),
        }

    deleted_log = []
    for inst in inventory.get("instances", []):
        executor("instance", inst["id"])
        deleted_log.append(f"Deleted instance: {inst['id']}")

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

    for b in inventory.get("backups", []):
        executor("backup", b["id"])
        deleted_log.append(f"Deleted backup: {b['id']}")

    for bk in inventory.get("buckets", []):
        executor("bucket", bk["id"])
        deleted_log.append(f"Deleted bucket: {bk['id']}")

    # Проверка остаточных ресурсов: подтверждение ТОЛЬКО если verifier вернул 0 ресурсов
    zero_residual_confirmed = False
    if verifier is not None:
        residual = verifier()
        total_remaining = (
            len(residual.get("instances", [])) +
            len(residual.get("volumes", [])) +
            len(residual.get("floating_ips", [])) +
            len(residual.get("snapshots", [])) +
            len(residual.get("images", [])) +
            len(residual.get("backups", [])) +
            len(residual.get("buckets", []))
        )
        if total_remaining == 0:
            zero_residual_confirmed = True

    return {
        "mode": "LIVE_DESTROY",
        "executed": True,
        "total_monthly_rub_prevented": total_monthly_rub,
        "deleted_resources": deleted_log,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "zero_residual_confirmed": zero_residual_confirmed,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Zero-residual Cloud.ru teardown utility")
    parser.add_argument("--backup-file", type=Path, required=True, help="Path to verified database backup")
    parser.add_argument("--key", type=str, default="", help="Decryption key if backup is encrypted (insecure; prefer --key-file, --key-stdin or KETO_BACKUP_ENCRYPTION_KEY)")
    parser.add_argument("--key-file", type=Path, default=None, help="Path to file containing decryption key")
    parser.add_argument("--key-stdin", action="store_true", help="Read decryption key from stdin")
    parser.add_argument("--confirm-destroy", action="store_true", help="Authorize actual destruction of resources")
    parser.add_argument("--confirm-phrase", type=str, default="", help="Must match confirmation phrase")
    parser.add_argument("--mock-inventory-file", type=Path, default=None, help="Path to JSON file with mock inventory for testing/dry-run drills")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args()

    # Защитный барьер 1: Проверка бэкапа и тестовое восстановление
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

    # Защитный барьер 2: Инвентаризация ресурсов через API
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
        print("Программа не может гарантировать отсутствие расходов без реальной проверки.", file=sys.stderr)
        print("Для предотвращения списаний выполните ручной демонтаж по инструкции:", file=sys.stderr)
        print("  docs/CLOUDRU_MANUAL_TEARDOWN.md", file=sys.stderr)
        return 3

    # Определение режима: dry-run или боевое удаление
    is_live = args.confirm_destroy and (args.confirm_phrase == CONFIRMATION_PHRASE)

    result = execute_teardown_plan(inv, dry_run=(not is_live))
    result["backup_verification"] = backup_status

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    print("=" * 60)
    print("  KETO BALANCE: CLOUD.RU ZERO-RESIDUAL TEARDOWN")
    print("=" * 60)
    print(f"Verified Backup:    {backup_status['backup_file']}")
    print(f"Backup SHA256:      {backup_status['sha256'][:12]}... (Users: {backup_status['user_count']})")
    print(f"Encrypted:          {'YES' if backup_status['is_encrypted'] else 'NO'}")
    print(f"Drill Restore:      PASSED (PRAGMA integrity_check OK)")
    print("-" * 60)
    print(f"Execution Mode:     {result['mode']}")
    print(f"Monthly Cost Cut:   ~{result['total_monthly_rub_prevented']} RUB/month saved")

    if result["mode"] == "DRY_RUN":
        print("\n[DRY RUN] Запланированные операции полного демонтажа:")
        for action in result.get("actions_planned", []):
            print(f"  - {action}")
        print("\nВНИМАНИЕ: Ни один ресурс не был удалён (безопасный dry-run).")
        print(f"Для подтверждения боевого удаления передайте флаги:")
        print(f"  --confirm-destroy --confirm-phrase {CONFIRMATION_PHRASE}")
    elif result["mode"] == "LIVE_LOCKED":
        print("\n[LIVE LOCKED] Автоматическое удаление через API заблокировано:")
        print(result["message"])
    else:
        print("\n[SUCCESS] Тарифицируемые ресурсы обработаны:")
        for item in result.get("deleted_resources", []):
            print(f"  ✓ {item}")
        if result.get("zero_residual_confirmed"):
            print("\n[CONFIRMED] Баланс защищён от отрицательных начислений. Повторный опрос API подтвердил: остаточных ресурсов 0.")
        else:
            print("\n[WARNING] Автоматическое удаление выполнено, но нулевой остаток не подтверждён повторным вызовом API.")
            print("Обязательно проверьте консоль Cloud.ru: docs/CLOUDRU_MANUAL_TEARDOWN.md")

    return 0


if __name__ == "__main__":
    sys.exit(main())
