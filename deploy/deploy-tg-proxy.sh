#!/usr/bin/env bash
# deploy/deploy-tg-proxy.sh
# Reproducible deployment of autonomous Xray proxy and KetoBalance bot on Cloud.ru VM.
# Pinned Image Digest: ghcr.io/xtls/xray-core@sha256:ceabeac03a89d991d2a247361825c1d1d2e9c91cd5dc010f298c7dc0c2f325c9
set -euo pipefail

CONFIG_FILE="/etc/ketobalance/xray_config.json"
XRAY_IMAGE="ghcr.io/xtls/xray-core@sha256:ceabeac03a89d991d2a247361825c1d1d2e9c91cd5dc010f298c7dc0c2f325c9"
PROXY_CONTAINER="ketobalance-tg-proxy"
BOT_CONTAINER="ketobalance-cloud-bot"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "[ERROR] Configuration file $CONFIG_FILE not found!" >&2
    exit 1
fi

# Ensure strict file ownership and permissions (xray non-root uid 65532, mode 0600)
sudo chown 65532:65532 "$CONFIG_FILE"
sudo chmod 0600 "$CONFIG_FILE"

# 1. Start or recreate Xray proxy container
echo "[1/3] Deploying $PROXY_CONTAINER..."
sudo docker rm -f "$PROXY_CONTAINER" 2>/dev/null || true
sudo docker run -d \
    --name "$PROXY_CONTAINER" \
    --restart unless-stopped \
    --net=host \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    --health-cmd "/usr/local/bin/xray run -test -c /etc/xray/config.json" \
    --health-interval 30s \
    --health-timeout 5s \
    --health-retries 3 \
    -v "$CONFIG_FILE:/etc/xray/config.json:ro" \
    "$XRAY_IMAGE" run -c /etc/xray/config.json

# Wait for proxy to start listening
sleep 2
if ! ss -tlpn | grep -q "127.0.0.1:10808"; then
    echo "[ERROR] Proxy is not listening on 127.0.0.1:10808!" >&2
    exit 1
fi
echo "[OK] Proxy is active on 127.0.0.1:10808"

# 2. Start or recreate Cloud bot with heartbeat healthcheck
echo "[2/3] Deploying $BOT_CONTAINER..."
BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' /home/user1/keto-balance/.env.production | cut -d '=' -f2- | tr -d '"'\'' ')

sudo docker rm -f "$BOT_CONTAINER" 2>/dev/null || true
sudo docker run -d \
    --name "$BOT_CONTAINER" \
    --restart unless-stopped \
    --net=host \
    --log-opt max-size=10m \
    --log-opt max-file=3 \
    --health-cmd "python -c \"import time, sys, os; p = os.getenv('KETO_BOT_HEARTBEAT_PATH', '/tmp/bot_heartbeat.ts'); sys.exit(0 if os.path.isfile(p) and (time.time() - os.path.getmtime(p) < 90) else 1)\"" \
    --health-interval 30s \
    --health-timeout 10s \
    --health-retries 3 \
    --health-start-period 20s \
    -v ketobalance_owner_data:/app/data \
    -e APP_STAGE=staging \
    -e WEBAPP_DOMAIN=84.54.56.73.nip.io \
    -e WEBAPP_URL=https://84.54.56.73.nip.io/ \
    -e TELEGRAM_BOT_TOKEN="$BOT_TOKEN" \
    -e KETO_BOT_PROXY="socks5://127.0.0.1:10808" \
    -e PAYMENT_MODE=disabled \
    -e PAYMENTS_ENABLED=0 \
    -e KETO_DB_PATH=/app/data/keto_balance.db \
    -e KETO_DIST_DIR=/app/dist \
    -e KETO_LOAD_DOTENV=0 \
    -e KETO_BOT_HEARTBEAT_PATH=/tmp/bot_heartbeat.ts \
    ketobalance-owner-bot:v1 python -m bot.bot

echo "[3/3] Deployment complete. Both containers are active."
