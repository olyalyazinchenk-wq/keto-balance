#!/usr/bin/env bash
# deploy/rollback-tg-proxy.sh
# Emergency rollback script to revert the Telegram bot to the domestic reverse SSH tunnel (port 18090)
set -euo pipefail

BOT_CONTAINER="ketobalance-cloud-bot"
PROXY_CONTAINER="ketobalance-tg-proxy"

echo "[ROLLBACK] Reverting bot to domestic reverse tunnel (18090)..."

# 1. Stop local Xray proxy container
sudo docker stop "$PROXY_CONTAINER" 2>/dev/null || true

# 2. Re-point bot to 127.0.0.1:18090
BOT_TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' /home/user1/keto-balance/.env.production | cut -d '=' -f2- | tr -d '"'\'' ')

sudo docker rm -f "$BOT_CONTAINER" 2>/dev/null || true
sudo docker run -d \
    --name "$BOT_CONTAINER" \
    --restart unless-stopped \
    --net=host \
    -v ketobalance_owner_data:/app/data \
    -e APP_STAGE=staging \
    -e WEBAPP_DOMAIN=84.54.56.73.nip.io \
    -e WEBAPP_URL=https://84.54.56.73.nip.io/ \
    -e TELEGRAM_BOT_TOKEN="$BOT_TOKEN" \
    -e KETO_BOT_PROXY="socks5://127.0.0.1:18090" \
    -e PAYMENT_MODE=disabled \
    -e PAYMENTS_ENABLED=0 \
    -e KETO_DB_PATH=/app/data/keto_balance.db \
    -e KETO_DIST_DIR=/app/dist \
    -e KETO_LOAD_DOTENV=0 \
    ketobalance-owner-bot:v1 python -m bot.bot

echo "[ROLLBACK OK] Bot reverted to port 18090. Requires starting domestic reverse SSH tunnel."
