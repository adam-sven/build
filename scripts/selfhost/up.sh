#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "selfhost/.env" ]]; then
  echo "Missing selfhost/.env"
  echo "Run: cp selfhost/.env.example selfhost/.env"
  exit 1
fi

echo "Starting Postgres + Redis..."
docker compose --env-file selfhost/.env -f selfhost/docker-compose.yml up -d postgres redis

echo "Waiting for Postgres health..."
until docker compose --env-file selfhost/.env -f selfhost/docker-compose.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-iamtrader}" -d "${POSTGRES_DB:-iamtrader}" >/dev/null 2>&1; do
  sleep 1
done

"$ROOT_DIR/scripts/selfhost/apply-migrations.sh"

echo "Starting app + worker..."
docker compose --env-file selfhost/.env -f selfhost/docker-compose.yml up -d app worker

echo "Done."
echo "App:    http://localhost:3000"
echo "Logs:   docker compose --env-file selfhost/.env -f selfhost/docker-compose.yml logs -f app worker"
