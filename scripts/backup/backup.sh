#!/usr/bin/env bash
# Backup independente do banco (dados + esquema) com pg_dump.
# Uso: SUPABASE_DB_URL='postgresql://...' bash scripts/backup/backup.sh [diretorio]
#   SUPABASE_DB_URL: Supabase > Project Settings > Database > Connection string
#   (use a "Session pooler" se sua rede não tiver IPv6). NÃO versione esta URL.
# Gera <dir>/gestao-AAAAMMDD-HHMM.dump (formato custom) + .sha256.
# Guarde o arquivo FORA do Supabase (drive corporativo, outro provedor, mídia offline).
set -euo pipefail
: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL}"
DIR="${1:-backups}"
mkdir -p "$DIR"
FILE="$DIR/gestao-$(date -u +%Y%m%d-%H%M).dump"
pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner \
  --schema=public --schema=app --schema=auth --schema=storage \
  --file="$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "Backup gerado: $FILE ($(du -h "$FILE" | cut -f1))"
echo "Lembrete: anexos binários do Storage não estão no dump; exporte-os pelo painel ou CLI do Supabase."
