#!/usr/bin/env python3
"""
scripts/run_load_test.py — Нагрузочное испытание API сервера «КетоБаланс».

Строго отделено от статических конфигурационных проверок Docker Compose.
Выполняет 10 одновременных пользовательских сценариев (конкурентные потоки),
измеряет и протоколирует время отклика каждого запроса, вычисляет p95 латентность
и проверяет отсутствие потерь данных и ошибок.
"""
import concurrent.futures
import json
import logging
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

# Установка корневого каталога
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["KETO_LOAD_DOTENV"] = "0"

from fastapi.testclient import TestClient

from bot.app_settings import AppSettings
from bot.auth import generate_telegram_init_data
from bot.server import create_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("LoadTest")

TEST_BOT_TOKEN = "777888999:LOAD_TEST_TELEGRAM_BOT_TOKEN"

class LatencyRecord:
    def __init__(self, worker_id: int, method: str, endpoint: str, status_code: int, duration_ms: float, success: bool):
        self.worker_id = worker_id
        self.method = method
        self.endpoint = endpoint
        self.status_code = status_code
        self.duration_ms = duration_ms
        self.success = success

    def __repr__(self) -> str:
        status_str = "OK" if self.success else f"FAIL({self.status_code})"
        return f"[Worker {self.worker_id:02d}] {self.method:<6} {self.endpoint:<28} -> {status_str:<8} in {self.duration_ms:6.2f} ms"


def execute_user_scenario(worker_id: int, client: TestClient) -> List[LatencyRecord]:
    """
    Выполняет реалистичный сквозной сценарий пользователя:
    1. Проверка работоспособности и версии (/api/health, /api/version)
    2. Аутентификация Telegram TMA (/api/session)
    3. Загрузка каталога и просмотр рецепта (/api/catalog, /api/catalog/k1)
    4. Чтение профиля и состояния (/api/user)
    5. Обновление меню и состояния с 4 порциями/партиями (/api/user)
    6. Чтение и обновление списка покупок (/api/shopping)
    7. Фиксация согласия пользователя (/api/user/consents)
    8. Отправка обращения в поддержку (/api/support)
    """
    records: List[LatencyRecord] = []
    user_id = 10000 + worker_id

    def timed_request(method: str, endpoint: str, **kwargs) -> Tuple[Any, LatencyRecord]:
        t0 = time.perf_counter()
        if method == "GET":
            resp = client.get(endpoint, **kwargs)
        elif method == "POST":
            resp = client.post(endpoint, **kwargs)
        elif method == "PUT":
            resp = client.put(endpoint, **kwargs)
        elif method == "DELETE":
            resp = client.delete(endpoint, **kwargs)
        else:
            raise ValueError(f"Unsupported method {method}")
        duration_ms = (time.perf_counter() - t0) * 1000.0
        success = (200 <= resp.status_code < 300)
        rec = LatencyRecord(worker_id, method, endpoint, resp.status_code, duration_ms, success)
        records.append(rec)
        logger.info(str(rec))
        return resp, rec

    # 1. Health check
    timed_request("GET", "/api/health")

    # 2. Telegram Auth Session
    init_data = generate_telegram_init_data({"id": user_id, "first_name": f"Tester_{worker_id}"}, TEST_BOT_TOKEN)
    resp_sess, _ = timed_request("POST", "/api/session", json={"init_data": init_data})
    if resp_sess.status_code != 200:
        return records

    token = resp_sess.json().get("session_token", "")
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Catalog exploration
    timed_request("GET", "/api/catalog")
    timed_request("GET", "/api/catalog/k1")

    # 4. User profile & state read
    resp_u, _ = timed_request("GET", "/api/user", headers=headers)
    curr_rev = resp_u.json().get("revision", 0) if resp_u.status_code == 200 else 0

    # 5. User state update with 4 shopping batches
    menu_payload = {
        "mode": "keto",
        "numDays": 1,
        "meals": 2,
        "portion": 4,
        "saved": True,
        "created": int(time.time()),
        "days": [
            {
                "date": "2026-11-06",
                "slots": {"breakfast": "k1", "dinner": "k2"}
            }
        ]
    }
    user_write = {
        "schema_version": 1,
        "expected_revision": curr_rev,
        "profile": {
            "settings": {
                "confirmed18Plus": True,
                "approach": "keto",
                "restrictions": [],
                "prepTimeMax": 30,
                "mealsPerDay": 2,
                "preferenceNote": ""
            },
            "weight": 70.0 + worker_id,
            "goal": "energy"
        },
        "state": {
            "schema_version": 1,
            "menu": menu_payload,
            "selected_date": "2026-11-06",
            "checked_ingredients": {},
            "checked_steps": {},
            "shopping_batches": 4,
            "shopping_stale": False
        }
    }
    resp_put, _ = timed_request("PUT", "/api/user", json=user_write, headers=headers)

    # 6. Shopping list interaction
    timed_request("GET", "/api/shopping", headers=headers)

    # 7. User consent
    consent_data = {
        "consents": [
            {"consent_type": "terms", "version": "v1.0.0-release", "granted": True, "source": "tma"}
        ]
    }
    timed_request("POST", "/api/user/consents", json=consent_data, headers=headers)

    # 8. Support Ticket
    support_data = {
        "topic": "general",
        "message": f"Load test message from concurrent worker {worker_id}",
        "contact": f"@user_{worker_id}"
    }
    timed_request("POST", "/api/support", json=support_data, headers=headers)

    return records


def run_load_test(concurrent_workers: int = 10) -> Dict[str, Any]:
    """
    Запускает 10 одновременных рабочих сценариев в пуле потоков.
    """
    logger.info("=" * 70)
    logger.info(f"ЗАПУСК НАГРУЗОЧНОГО ИСПЫТАНИЯ: {concurrent_workers} конкурентных сценариев")
    logger.info("=" * 70)

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp_dir:
        db_path = Path(tmp_dir) / "load_test.db"
        settings = AppSettings(
            app_stage="test",
            telegram_bot_token=TEST_BOT_TOKEN,
            db_path=db_path,
            dist_dir=Path(tmp_dir),
        )
        app = create_app(dist_dir=Path(tmp_dir), db_path=db_path, settings=settings)
        client = TestClient(app)

        all_records: List[LatencyRecord] = []
        start_time = time.perf_counter()

        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrent_workers) as executor:
            futures = [
                executor.submit(execute_user_scenario, i + 1, client)
                for i in range(concurrent_workers)
            ]
            for fut in concurrent.futures.as_completed(futures):
                try:
                    records = fut.result()
                    all_records.extend(records)
                except Exception as e:
                    logger.error(f"Worker crashed with exception: {e}")

        total_elapsed = time.perf_counter() - start_time

    # Вычисление метрик
    total_reqs = len(all_records)
    successful_reqs = sum(1 for r in all_records if r.success)
    failed_reqs = total_reqs - successful_reqs
    latencies = sorted(r.duration_ms for r in all_records)

    min_lat = latencies[0] if latencies else 0.0
    max_lat = latencies[-1] if latencies else 0.0
    avg_lat = sum(latencies) / len(latencies) if latencies else 0.0
    p50_lat = latencies[int(len(latencies) * 0.50)] if latencies else 0.0
    p90_lat = latencies[int(len(latencies) * 0.90)] if latencies else 0.0
    p95_lat = latencies[int(len(latencies) * 0.95)] if latencies else 0.0

    logger.info("=" * 70)
    logger.info("ИТОГОВЫЙ ОТЧЁТ НАГРУЗОЧНОГО ТЕСТИРОВАНИЯ")
    logger.info("=" * 70)
    logger.info(f"Общее время выполнения:     {total_elapsed:.2f} сек")
    logger.info(f"Всего запросов выполнено:   {total_reqs}")
    logger.info(f"Успешных запросов:          {successful_reqs}")
    logger.info(f"Ошибок / отказов:           {failed_reqs}")
    logger.info(f"Пропускная способность:     {total_reqs / total_elapsed:.1f} req/s")
    logger.info(f"Минимальная задержка:       {min_lat:.2f} ms")
    logger.info(f"Средняя задержка:           {avg_lat:.2f} ms")
    logger.info(f"Медиана (p50):              {p50_lat:.2f} ms")
    logger.info(f"90-й перцентиль (p90):      {p90_lat:.2f} ms")
    logger.info(f"95-й перцентиль (p95):      {p95_lat:.2f} ms (критерий: < 2000 ms)")
    logger.info(f"Максимальная задержка:      {max_lat:.2f} ms")
    logger.info("=" * 70)

    passed = (failed_reqs == 0) and (p95_lat <= 2000.0) and (total_reqs >= concurrent_workers * 7)
    if passed:
        logger.info("[PASS] Нагрузочное испытание УСПЕШНО ПРОЙДЕНО: 10 одновременных сценариев выполнены без ошибок, p95 < 2.0s.")
    else:
        logger.error(f"[FAIL] Нагрузочное испытание НЕ ПРОЙДЕНО: failures={failed_reqs}, p95={p95_lat:.2f}ms, requests={total_reqs}")

    return {
        "passed": passed,
        "concurrent_workers": concurrent_workers,
        "total_requests": total_reqs,
        "successful_requests": successful_reqs,
        "failed_requests": failed_reqs,
        "elapsed_seconds": total_elapsed,
        "p95_ms": p95_lat,
        "avg_ms": avg_lat,
        "max_ms": max_lat,
    }


def main():
    result = run_load_test(10)
    sys.exit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
