FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KETO_LOAD_DOTENV=0 \
    KETO_DIST_DIR=/app/dist \
    KETO_DB_PATH=/app/data/keto_balance.db
COPY requirements-p0.txt ./
RUN pip install --no-cache-dir -r requirements-p0.txt
COPY bot ./bot
COPY bot_data.json ./bot_data.json
COPY scripts/probe_entry.py ./scripts/probe_entry.py
COPY scripts/sync_telegram_buttons.py ./scripts/sync_telegram_buttons.py
COPY --from=frontend /build/dist ./dist
RUN mkdir -p /app/data && chown 65532:65532 /app/data
USER 65532:65532
CMD ["uvicorn", "bot.server:app", "--host", "0.0.0.0", "--port", "8000"]
