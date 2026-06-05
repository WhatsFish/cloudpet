#!/usr/bin/env bash
# Bootstrap the cloudpet Postgres role + DB inside the shared
# traffic-monitor-db-1 container, then apply schema.sql.
#
# Idempotent: safe to re-run. Reads CLOUDPET_PG_PASSWORD from the env
# file at /home/liharr/.config/cloudpet.env (mode 600).
#
# Run from the repo root.
set -eo pipefail

ENV_FILE="${CLOUDPET_ENV_FILE:-/home/liharr/.config/cloudpet.env}"
DB_CONTAINER="${CLOUDPET_DB_CONTAINER:-traffic-monitor-db-1}"
SCHEMA_FILE="$(dirname "$0")/schema.sql"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found. Create it with CLOUDPET_PG_PASSWORD=..." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${CLOUDPET_PG_PASSWORD:-}" ]; then
  echo "ERROR: CLOUDPET_PG_PASSWORD not set in $ENV_FILE" >&2
  exit 1
fi

# Step 1: create role + database. The shared db container's superuser is
# `umami` (the role created when umami was first installed); reuse it.
docker exec -i "$DB_CONTAINER" psql -U umami -d umami <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloudpet') THEN
    CREATE ROLE cloudpet WITH LOGIN PASSWORD '${CLOUDPET_PG_PASSWORD}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE cloudpet OWNER cloudpet'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'cloudpet')\gexec

GRANT ALL PRIVILEGES ON DATABASE cloudpet TO cloudpet;
SQL

# Step 2: apply schema as the owner role.
docker exec -i -e PGPASSWORD="$CLOUDPET_PG_PASSWORD" "$DB_CONTAINER" \
  psql -h localhost -U cloudpet -d cloudpet < "$SCHEMA_FILE"

echo "cloudpet bootstrap complete."
