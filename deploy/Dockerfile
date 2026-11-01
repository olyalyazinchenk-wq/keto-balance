# --- Stage 1: Build Frontend SPA ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit
COPY . .
RUN npm run build

# --- Stage 2: Production Python Runtime ---
FROM python:3.12-slim-bookworm AS production
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_STAGE=production \
    PAYMENT_MODE=enabled \
    PAYMENTS_ENABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and built frontend
COPY bot ./bot
COPY docs ./docs
COPY scripts ./scripts
COPY --from=frontend-builder /app/dist ./dist

# Create persistent data and backup directories
RUN mkdir -p /data /data/backups

ENV KETO_DB_PATH=/data/keto_balance.db \
    KETO_DIST_DIR=/app/dist

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "bot.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
