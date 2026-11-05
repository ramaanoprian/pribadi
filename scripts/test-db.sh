#!/usr/bin/env bash
# Menjalankan tes database (pgTAP) di PostgreSQL lokal tanpa Docker.
#   1. Membuat database baru yang bersih
#   2. Memasang shim Supabase (auth.users, auth.uid(), peran anon/authenticated)
#   3. Menjalankan semua migrasi + seed.sql
#   4. Menjalankan semua file supabase/tests/database/*.test.sql dengan pg_prove
#
# Variabel opsional: PGHOST, PGPORT, PGUSER (default: socket lokal, user postgres)
# Bila memakai Supabase CLI + Docker, cukup: npx supabase test db
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="${TEST_DB_NAME:-bakehouse_test}"
export PGUSER="${PGUSER:-postgres}"

run_psql() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
if [ "$(id -u)" = "0" ] && [ -z "${PGHOST:-}" ]; then
  run_psql() { sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 "$@"; }
  pg_prove_cmd() { sudo -u postgres pg_prove "$@"; }
else
  pg_prove_cmd() { pg_prove "$@"; }
fi

echo "==> Menyiapkan database $DB"
run_psql -d postgres -c "drop database if exists $DB" -c "create database $DB" \
  -c "alter database $DB set search_path = \"\$user\", public, extensions"
run_psql -d "$DB" -f "$ROOT/scripts/db/supabase_shim.sql"

echo "==> Menjalankan migrasi"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  run_psql -d "$DB" -f "$f"
done

if [ -f "$ROOT/supabase/seed.sql" ]; then
  echo "==> Menjalankan seed.sql"
  run_psql -d "$DB" -f "$ROOT/supabase/seed.sql"
fi

echo "==> Menjalankan tes pgTAP"
cd "$ROOT/supabase/tests/database"
pg_prove_cmd -d "$DB" --ext .sql -v *.test.sql
