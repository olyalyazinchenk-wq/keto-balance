# Пакет экстренной и плановой миграции «КетоБаланс»

## 1. Назначение пакета
Данный пакет позволяет в течение 15 минут перенести проект «КетоБаланс» на любую альтернативную площадку:
- **Yandex Cloud** (Compute Cloud VM, 2 vCPU / 2 ГБ RAM)
- **Selectel** / **Timeweb Cloud** / **Любой независимый Linux VPS**

## 2. Порядок переноса
1. Развернуть сервер с ОС Ubuntu 22.04 / 24.04 LTS и установить Docker Compose.
2. Склонировать репозиторий: `git clone https://github.com/olyalyazinchenk-wq/keto-balance.git`.
3. Скопировать свежий зашифрованный бэкап: `scp backup.db.enc user@new_server:/tmp/`.
4. Восстановить базу данных: `python scripts/restore_db.py --backup /tmp/backup.db.enc --out /var/lib/docker/volumes/...`.
5. Запустить сервисы: `docker compose -f deploy/docker-compose.migration.yml up -d --build`.
6. Перенаправить A-запись домена на IP-адрес нового сервера. Caddy автоматически выпустит бесплатный SSL-сертификат Let's Encrypt.
