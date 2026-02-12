#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "selfhost/.env" ]]; then
  echo "Missing selfhost/.env. Copy selfhost/.env.example first."
  exit 1
fi

echo "Applying SQL migrations to local Postgres..."
for file in db/migrations/*.sql; do
  echo " - $file"
  docker compose --env-file selfhost/.env -f selfhost/docker-compose.yml exec -T postgres \
    psql -U "${POSTGRES_USER:-iamtrader}" -d "${POSTGRES_DB:-iamtrader}" < "$file"
done
echo "Migrations applied."
