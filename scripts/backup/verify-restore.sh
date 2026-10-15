#!/usr/bin/env bash
# Teste de restauração no stack LOCAL: faz backup do banco de teste, restaura
# em um banco novo e isolado e compara a contagem de linhas de cada tabela.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/../local-stack/env.sh"
SRC="postgres://postgres@127.0.0.1:$PGPORT_LOCAL/gestao_test"
DST_DB=gestao_restore_check
DST="postgres://postgres@127.0.0.1:$PGPORT_LOCAL/$DST_DB"
OUT="$(mktemp -d)"
SUPABASE_DB_URL="$SRC" bash "$HERE/backup.sh" "$OUT" >/dev/null
FILE="$(ls "$OUT"/*.dump)"
psql -q -h 127.0.0.1 -p "$PGPORT_LOCAL" -U postgres -d postgres -c "drop database if exists $DST_DB with (force)" -c "create database $DST_DB"
# Os papéis do Supabase existem no cluster; recria-se só a estrutura de esquemas vazia
TARGET_DB_URL="$DST" bash "$HERE/restore.sh" "$FILE" >/dev/null
TABLES="profiles projects project_members wbs_items wbs_dependencies milestones actions action_dependencies action_comments risks issues change_requests decisions stakeholders raci_assignments status_reports lessons_learned documents audit_log"
FAIL=0
printf "%-22s %10s %10s\n" tabela origem restaurado
for t in $TABLES; do
  a=$(psql -tA "$SRC" -c "select count(*) from public.$t")
  b=$(psql -tA "$DST" -c "select count(*) from public.$t")
  printf "%-22s %10s %10s %s\n" "$t" "$a" "$b" "$([ "$a" = "$b" ] && echo OK || echo DIVERGENTE)"
  [ "$a" = "$b" ] || FAIL=1
done
a=$(psql -tA "$SRC" -c "select count(*) from auth.users"); b=$(psql -tA "$DST" -c "select count(*) from auth.users")
printf "%-22s %10s %10s %s\n" "auth.users" "$a" "$b" "$([ "$a" = "$b" ] && echo OK || echo DIVERGENTE)"; [ "$a" = "$b" ] || FAIL=1
# integridade: checksum do conteúdo das ações
ha=$(psql -tA "$SRC" -c "select md5(string_agg(to_jsonb(a)::text, '' order by id)) from public.actions a")
hb=$(psql -tA "$DST" -c "select md5(string_agg(to_jsonb(a)::text, '' order by id)) from public.actions a")
echo "checksum ações: $ha / $hb $([ "$ha" = "$hb" ] && echo OK || echo DIVERGENTE)"; [ "$ha" = "$hb" ] || FAIL=1
# políticas RLS restauradas
p=$(psql -tA "$DST" -c "select count(*) from pg_policies where schemaname='public'")
echo "políticas RLS restauradas: $p"
g=$(psql -tA "$DST" -c "select has_table_privilege('authenticated','public.actions','UPDATE')::text || '/' || has_table_privilege('authenticated','public.audit_log','DELETE')::text || '/' || has_table_privilege('anon','public.projects','SELECT')::text")
echo "privilégios (authenticated UPDATE actions / DELETE audit / anon SELECT projects): $g"; [ "$g" = "true/false/false" ] || FAIL=1
psql -q -h 127.0.0.1 -p "$PGPORT_LOCAL" -U postgres -d postgres -c "drop database $DST_DB with (force)"
rm -rf "$OUT"
[ $FAIL = 0 ] && echo "RESTAURAÇÃO VERIFICADA" || { echo "FALHA NA VERIFICAÇÃO"; exit 1; }
