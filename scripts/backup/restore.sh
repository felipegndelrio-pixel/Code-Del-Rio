#!/usr/bin/env bash
# Restaura um backup em um banco ISOLADO (nunca em produção).
# Uso: TARGET_DB_URL='postgres://postgres@127.0.0.1:54322/gestao_restore' bash scripts/backup/restore.sh arquivo.dump
set -euo pipefail
FILE="${1:?Informe o arquivo .dump}"
: "${TARGET_DB_URL:?Defina TARGET_DB_URL (banco vazio e isolado)}"
case "$TARGET_DB_URL" in
  *supabase.co*|*supabase.com*) if [ "${I_KNOW_THIS_IS_NOT_PRODUCTION:-}" != "sim" ]; then
      echo "Recusado: destino parece ser Supabase. Restaure em ambiente isolado ou defina I_KNOW_THIS_IS_NOT_PRODUCTION=sim."; exit 1; fi;;
esac
[ -f "$FILE.sha256" ] && sha256sum -c "$FILE.sha256"
pg_restore --dbname="$TARGET_DB_URL" --clean --if-exists --no-owner --exit-on-error "$FILE"
echo "Restauração concluída em $TARGET_DB_URL"
