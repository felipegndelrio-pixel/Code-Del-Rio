# Backup e recuperação

O plano Free do Supabase **não deve ser tratado como backup**. Mantenha cópias
próprias, fora do Supabase.

## 1. Backup completo do banco (recomendado, semanal + antes de mudanças)
```bash
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<senha>@<host>:5432/postgres'  # não versionar
bash scripts/backup/backup.sh backups/     # gera .dump + .sha256
```
Inclui esquemas `public`, `app`, `auth` (usuários) e `storage` (metadados),
com políticas RLS e privilégios. Guarde o arquivo em outro local (drive
corporativo, outro provedor, mídia offline). **Não** o deixe só no Supabase.

Os **binários dos anexos** (Storage) não estão no dump: baixe-os pelo painel
do Supabase (Storage → bucket `documents`) ou via CLI, no mesmo ciclo.

## 2. Backup lógico pela aplicação
*Administração → Backup JSON / XLSX*: exporta todos os dados visíveis ao admin.
Útil como cópia legível; não substitui o `pg_dump` (não inclui usuários/senhas).

## 3. Restauração (sempre em ambiente isolado primeiro)
```bash
TARGET_DB_URL='postgres://postgres@127.0.0.1:54322/gestao_restore' \
  bash scripts/backup/restore.sh backups/gestao-AAAAMMDD-HHMM.dump
```
O script verifica o checksum e **recusa** destino Supabase sem confirmação
explícita. Para recuperar produção: crie um projeto Supabase novo, restaure nele,
valide, e só então aponte a aplicação (variáveis do Netlify) para o novo projeto.
Nunca execute operações destrutivas no banco de produção para "testar".

## 4. Teste de restauração (evidência)
```bash
npm run stack:up && bash scripts/backup/verify-restore.sh
```
Faz backup do banco local de testes, restaura num banco novo, compara contagem
de todas as tabelas + `auth.users`, checksum do conteúdo das ações, número de
políticas RLS e privilégios críticos. Resultado registrado em `docs/PROGRESSO.md`.

## Retenção
Registros de auditoria são imutáveis (gatilho bloqueia UPDATE/DELETE). Exclusões
de registros guardam cópia completa na auditoria. Expurgo só por decisão formal,
executado pelo dono do banco desativando temporariamente o gatilho, com backup prévio.
