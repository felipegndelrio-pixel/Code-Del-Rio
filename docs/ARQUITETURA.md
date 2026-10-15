# Arquitetura

```
Navegador / PWA (React + TS + Vite + Tailwind + Recharts + ExcelJS)
   │  HTTPS — somente chave pública (anon/publishable) + JWT do usuário
   ▼
Supabase (plano Free)
   ├─ Auth (GoTrue): e-mail/senha, recuperação por e-mail, senhas com bcrypt
   ├─ PostgREST: API REST gerada do esquema `public`
   ├─ PostgreSQL: RLS em todas as tabelas, gatilhos de regra, auditoria
   └─ Storage: bucket privado `documents` (URLs assinadas de 60 s)
Netlify (plano Free): hospedagem estática do build (sem Functions)
```

## Decisões
| Decisão | Motivo |
|---|---|
| Sem backend próprio; regras no PostgreSQL | Custo zero, menos superfície; RLS + gatilhos valem para qualquer cliente (UI, API direta, importação) |
| Esquema `app` (não exposto) para funções de autorização `SECURITY DEFINER` | Evita recursão de RLS e não expõe helpers via API |
| IDs `uuid` + códigos legíveis estáveis (`ACT-00042`) | UUID não previsível; código estável para planilhas. Nenhum dos dois substitui autorização |
| FKs compostas `(id, project_id)` | Impede vincular registros de projetos diferentes |
| Auditoria por gatilho, campo a campo, imutável | Independe da interface; registra usuário, data, campo, antes/depois |
| Importação via RPC `SECURITY INVOKER` com dry-run | Mesmas permissões do usuário; staging real com rollback; tudo-ou-nada |
| Projeto criado com UUID gerado no cliente e sem `RETURNING` | O vínculo de gerente é criado por gatilho AFTER; a política de leitura só passa após o comando |
| Service worker só com app shell | Nada de dados protegidos em cache |
| `fetch` com timeout de 20 s + retentativas do cliente | Erros de rede viram mensagem clara em vez de espera indefinida |

## Estrutura
```
supabase/migrations/   esquema, RLS, auditoria, storage, RPCs (ordem numérica)
src/lib/               tipos, KPIs, CPM, planilhas, arquivos, API, erros
src/pages/             telas (Dashboard, Projetos, Projeto/abas, Planilhas, Admin…)
src/components/        UI base, gráficos, cadastro genérico
tests/db/              integração contra API real local (RLS, auditoria, importação)
tests/e2e/             Playwright (navegador real)
scripts/local-stack/   Postgres + Supabase Auth + PostgREST locais para testes
scripts/backup/        pg_dump / restore / verificação de restauração
```

## Ambiente de testes local
`npm run stack:up` sobe Postgres 16, Supabase Auth v2.170 e PostgREST v12.2
(binários oficiais), aplica as migrations do Auth e da aplicação num banco
isolado `gestao_test` e gera `.env.test.local` (chaves locais, sem valor fora
do container). Os testes recusam rodar se a URL não for local.
Limitação: o serviço HTTP do Storage não é emulado; as políticas de Storage são
testadas em nível SQL com um esquema `storage` compatível.
