# Variáveis do ambiente LOCAL de testes (valores sem valor fora deste container).
export SB_LOCAL_DIR="${SB_LOCAL_DIR:-/opt/localstack-sb}"
export PGDATA_DIR="${PGDATA_DIR:-/opt/pgdata}"
export PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
export PGPORT_LOCAL=54322
export LOCAL_JWT_SECRET="local-dev-jwt-secret-not-for-production-000000"
export LOCAL_DB_URL="postgres://postgres@127.0.0.1:${PGPORT_LOCAL}/postgres"
export GATEWAY_PORT=54321
