#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")" && pwd)"; source "$HERE/env.sh"
for s in auth postgrest gateway; do
  [ -f "$SB_LOCAL_DIR/$s.pid" ] && kill "$(cat "$SB_LOCAL_DIR/$s.pid")" 2>/dev/null; rm -f "$SB_LOCAL_DIR/$s.pid"
done
pkill -f "$SB_LOCAL_DIR/postgrest" 2>/dev/null; pkill -f "auth serve" 2>/dev/null; pkill -f "local-stack/gateway.mjs" 2>/dev/null
[ "${1:-}" = "--services-only" ] && exit 0
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA_DIR stop" 2>/dev/null || true
