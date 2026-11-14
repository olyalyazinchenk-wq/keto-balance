# Руководство по безопасному переносу «КетоБаланс» на другого провайдера (VPS / Cloud)

Архитектура «КетоБаланс» спроектирована как **100% независимый от облачного провайдера (cloud-agnostic) контейнерный стек**.
Приложение не привязано к проприетарным сервисам Cloud.ru и переносится на любой стандартный Linux VPS (Beget, Timeweb Cloud, Selectel, Hetzner и др.) за **10–15 минут** без потери данных.

---

## 1. Системные требования целевого сервера

- **ОС:** Ubuntu 22.04 LTS или 24.04 LTS (чистая установка).
- **Конфигурация:** **1 vCPU / 2 ГБ RAM** (достаточно даже 1 vCPU / 1 ГБ RAM при настройке swap-файла на 1–2 ГБ).
- **Диск:** от 15–20 ГБ NVMe/SSD.
- **Сеть:** 1 публичный IPv4-адрес.
- **Стоимость на рынке РФ:** фиксированные 250–400 ₽/месяц (без скрытых платежей за диски и сетевой трафик).

---

## 2. Пошаговый регламент переноса

### Шаг 1: Создание финального бэкапа на исходном сервере
На сервере Cloud.ru (или локальном сервере):
```bash
# 1. Запуск шифрованного резервного копирования
python3 scripts/backup_db.py \
    --source /app/data/keto_balance.db \
    --dest /tmp/migration_backup.db.enc \
    --encrypt \
    --key-file /etc/keto_backup.key
```
*Скрипт создаст файл зашифрованной базы данных `migration_backup.db.enc` и файл метаданных `migration_backup.json` с контрольной суммой SHA-256.*

### Шаг 2: Выгрузка данных на рабочий компьютер оператора
```bash
scp root@<OLD_SERVER_IP>:/tmp/migration_backup.db.enc ./
scp root@<OLD_SERVER_IP>:/tmp/migration_backup.json ./
scp root@<OLD_SERVER_IP>:/etc/keto_backup.key ./
```
Проверьте целостность локально:
```bash
python3 scripts/restore_db.py ./migration_backup.db.enc \
    --target ./test_check.db \
    --key-file ./keto_backup.key
```

### Шаг 3: Подготовка нового сервера у выбранного провайдера
Подключитесь по SSH к новому серверу:
```bash
ssh root@<NEW_SERVER_IP>
```

1. **Обновление пакетов и установка Docker:**
   ```bash
   apt update && apt upgrade -y
   curl -fsSL https://get.docker.com | sh
   apt install -y git python3 python3-pip
   ```

2. **Настройка swap-файла (защита от всплесков памяти):**
   ```bash
   fallocate -l 2G /swapfile
   chmod 600 /swapfile
   mkswap /swapfile
   swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   ```

3. **Клонирование репозитория:**
   ```bash
   git clone https://github.com/olyalyazinchenk-wq/keto-balance.git /opt/keto-balance
   cd /opt/keto-balance
   git checkout release/1.0.0
   ```

### Шаг 4: Настройка конфигурации окружения
Создайте боевой файл конфигурации:
```bash
cp .env.production.example .env
nano .env
```
*(Или сохраните как `.env.production` и используйте `docker compose --env-file .env.production up -d --build`).*

Заполните переменные:
```env
APP_STAGE=production
PAYMENT_MODE=disabled
PAYMENTS_ENABLED=0
WEBAPP_DOMAIN=app.ketobalans.ru
TELEGRAM_BOT_TOKEN=1234567890:AA...
TELEGRAM_WEBHOOK_SECRET_TOKEN=strong_random_token_here
```

### Шаг 5: Перенос домена (DNS)
1. В панели управления DNS вашего регистратора (Reg.ru, Beget, Cloudflare и др.) найдите A-запись для домена бота.
2. Измените IP-адрес на `<NEW_SERVER_IP>`.
3. Установите TTL = 300 секунд (5 минут).

### Шаг 6: Восстановление базы данных на новом сервере
1. Загрузите файлы бэкапа и ключа на новый сервер:
   ```bash
   scp ./migration_backup.db.enc root@<NEW_SERVER_IP>:/opt/keto-balance/
   scp ./migration_backup.json root@<NEW_SERVER_IP>:/opt/keto-balance/
   scp ./keto_backup.key root@<NEW_SERVER_IP>:/opt/keto-balance/
   ```

2. Создайте каталог данных и выполните восстановление:
   ```bash
   mkdir -p /opt/keto-balance/data
   python3 scripts/restore_db.py /opt/keto-balance/migration_backup.db.enc \
       --target /opt/keto-balance/data/keto_balance.db \
       --key-file /opt/keto-balance/keto_backup.key
   ```
   *Убедитесь в успешном прохождении `PRAGMA integrity_check`.*

### Шаг 7: Запуск сервиса одной командой
```bash
cd /opt/keto-balance
docker compose up -d --build
# Или: docker compose --env-file .env.production up -d --build
```
Caddy автоматически обнаружит домен из конфигурации и за 15–30 секунд выпустит доверенный бесплатный SSL-сертификат Let's Encrypt.

### Шаг 8: Проверка работоспособности
```bash
# 1. Проверка контейнеров
docker compose ps

# 2. Проверка здоровья локального API
curl -f http://127.0.0.1:8000/api/health

# 3. Проверка публичного HTTPS
curl -f https://<ВАШ_ДОМЕН>/api/version
```
Откройте Telegram и отправьте боту `/start` — проверьте меню и статус.

### Шаг 9: Завершение работы на старом хостинге
После подтверждения корректной работы нового сервера выполните полный демонтаж на Cloud.ru по регламенту:
`docs/CLOUDRU_MANUAL_TEARDOWN.md`.
