# ==============================================================================
# Keto Balance — Production Docker Image for Linux (1 vCPU / 2 GB RAM)
# Multi-stage build: Frontend Vite SPA -> Slim Python 3.12 Runtime
# ==============================================================================

# --- Stage 1: Build Frontend SPA ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit --no-fund
COPY . .
RUN npm run build

# --- Stage 2: Production Python Runtime ---
FROM python:3.12-slim-bookworm AS production
WORKDIR /app

# Hardened defaults: payments strictly disabled, no dotenv loading, clean logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_STAGE=production \
    PAYMENT_MODE=disabled \
    PAYMENTS_ENABLED=0 \
    KETO_LOAD_DOTENV=0 \
    KETO_DB_PATH=/app/data/keto_balance.db \
    KETO_DIST_DIR=/app/dist

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and built frontend
COPY bot ./bot
COPY bot_data.json ./bot_data.json
COPY docs ./docs
COPY scripts ./scripts
COPY --from=frontend-builder /app/dist ./dist

# Create persistent storage directories
RUN mkdir -p /app/data /app/data/backups

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "bot.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
