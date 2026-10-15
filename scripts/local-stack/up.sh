#!/usr/bin/env bash
# Sobe um stack LOCAL equivalente ao Supabase (Postgres 16 + Supabase Auth +
# PostgREST + gateway) para testes automatizados. Não usa nenhuma credencial
# de produção. Uso: bash scripts/local-stack/up.sh [--reset]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
source "$HERE/env.sh"
DB=gestao_test
mkdir -p "$SB_LOCAL_DIR" "$SB_LOCAL_DIR/logs"

fetch() { # url dest
  for i in 1 2 3 4; do curl -sSL --retry 3 -o "$2" "$1" && return 0; sleep $((2**i)); done; return 1
}
if [ ! -x "$SB_LOCAL_DIR/postgrest" ]; then
  fetch https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz "$SB_LOCAL_DIR/pgrst.tar.xz"
  tar -C "$SB_LOCAL_DIR" -xf "$SB_LOCAL_DIR/pgrst.tar.xz"
fi
if [ ! -x "$SB_LOCAL_DIR/auth" ]; then
  fetch https://github.com/supabase/auth/releases/download/v2.170.0/auth-v2.170.0-x86.tar.gz "$SB_LOCAL_DIR/auth.tar.gz"
  tar -C "$SB_LOCAL_DIR" -xzf "$SB_LOCAL_DIR/auth.tar.gz"
fi

# --- Postgres ---------------------------------------------------------------
id postgres >/dev/null 2>&1 || useradd -m postgres
if [ ! -f "$PGDATA_DIR/PG_VERSION" ]; then
  mkdir -p "$PGDATA_DIR"; chown postgres "$PGDATA_DIR"
  su postgres -c "$PG_BIN/initdb -D $PGDATA_DIR -U postgres --auth=trust -E UTF8 >/dev/null"
fi
if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p "$PGPORT_LOCAL" >/dev/null 2>&1; then
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA_DIR -o '-p $PGPORT_LOCAL -k /tmp' -l $PGDATA_DIR/log.txt start" < /dev/null >/dev/null 2>&1
  sleep 2
fi
PSQL="psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p $PGPORT_LOCAL -U postgres"

"$HERE/down.sh" --services-only >/dev/null 2>&1 || true
if [ "${1:-}" = "--reset" ] || ! $PSQL -d postgres -tAc "select 1 from pg_database where datname='$DB'" | grep -q 1; then
  $PSQL -d postgres -c "drop database if exists $DB with (force)"
  $PSQL -d postgres -c "create database $DB"
  $PSQL -d "$DB" -f "$HERE/bootstrap.sql"
  # Migrations do Supabase Auth (cria auth.users, auth.uid() etc.)
  ( cd "$SB_LOCAL_DIR" && GOTRUE_DB_DRIVER=postgres \
    DATABASE_URL="postgres://supabase_auth_admin:local-auth-admin@127.0.0.1:$PGPORT_LOCAL/$DB?search_path=auth" \
    GOTRUE_JWT_SECRET="$LOCAL_JWT_SECRET" API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1" \
    GOTRUE_SITE_URL="http://localhost:5173" ./auth migrate > "$SB_LOCAL_DIR/logs/auth-migrate.log" 2>&1 )
  # Migrations da aplicação, em ordem
  for f in "$ROOT"/supabase/migrations/*.sql; do
    $PSQL -d "$DB" -f "$f"
  done
fi

# --- Serviços ---------------------------------------------------------------
( cd "$SB_LOCAL_DIR" && nohup env GOTRUE_DB_DRIVER=postgres \
  DATABASE_URL="postgres://supabase_auth_admin:local-auth-admin@127.0.0.1:$PGPORT_LOCAL/$DB?search_path=auth" \
  GOTRUE_JWT_SECRET="$LOCAL_JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  API_EXTERNAL_URL="http://127.0.0.1:$GATEWAY_PORT/auth/v1" GOTRUE_SITE_URL="http://localhost:5173" \
  GOTRUE_URI_ALLOW_LIST="http://localhost:5173/**,http://127.0.0.1:4173/**" \
  GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
  GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn \
  setsid ./auth serve < /dev/null > "$SB_LOCAL_DIR/logs/auth.log" 2>&1 & echo $! > "$SB_LOCAL_DIR/auth.pid" )
( nohup env PGRST_DB_URI="postgres://authenticator:local-authenticator@127.0.0.1:$PGPORT_LOCAL/$DB" \
  PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$LOCAL_JWT_SECRET" \
  PGRST_SERVER_PORT=3000 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_CHANNEL_ENABLED=true \
  setsid "$SB_LOCAL_DIR/postgrest" < /dev/null > "$SB_LOCAL_DIR/logs/postgrest.log" 2>&1 & echo $! > "$SB_LOCAL_DIR/postgrest.pid" )
( nohup env GATEWAY_PORT=$GATEWAY_PORT setsid node "$HERE/gateway.mjs" < /dev/null > "$SB_LOCAL_DIR/logs/gateway.log" 2>&1 & echo $! > "$SB_LOCAL_DIR/gateway.pid" )

for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:$GATEWAY_PORT/auth/v1/health" >/dev/null && curl -sf "http://127.0.0.1:3000/" >/dev/null; then break; fi
  sleep 0.5
done
ANON=$(node "$HERE/jwt.mjs" anon "$LOCAL_JWT_SECRET")
SERVICE=$(node "$HERE/jwt.mjs" service_role "$LOCAL_JWT_SECRET")
cat > "$ROOT/.env.test.local" <<ENV
# Gerado por scripts/local-stack/up.sh — stack LOCAL de testes, sem dados reais.
VITE_SUPABASE_URL=http://127.0.0.1:$GATEWAY_PORT
VITE_SUPABASE_ANON_KEY=$ANON
TEST_SERVICE_ROLE_KEY=$SERVICE
TEST_DB_URL=postgres://postgres@127.0.0.1:$PGPORT_LOCAL/$DB
ENV
curl -sf "http://127.0.0.1:$GATEWAY_PORT/auth/v1/health" >/dev/null && echo "auth OK" || { echo "auth FALHOU"; tail -20 "$SB_LOCAL_DIR/logs/auth.log"; exit 1; }
curl -sf "http://127.0.0.1:3000/" >/dev/null && echo "rest OK" || { echo "rest FALHOU"; tail -20 "$SB_LOCAL_DIR/logs/postgrest.log"; exit 1; }
echo "Stack local pronto em http://127.0.0.1:$GATEWAY_PORT (.env.test.local gerado)"
