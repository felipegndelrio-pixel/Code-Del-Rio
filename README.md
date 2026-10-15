# Plataforma Executiva de Gestão de Projetos

Projetos, planos de ação e governança (PMI/PMBOK) com dashboard executivo,
permissões por projeto aplicadas no banco, trilha de auditoria imutável,
importação/exportação XLSX/CSV e acesso móvel (PWA).

**Stack:** React 19 + TypeScript + Vite + Tailwind + Recharts + ExcelJS ·
Supabase (PostgreSQL + RLS, Auth, Storage) · Netlify (estático) · custo-alvo R$ 0.

> **Status de publicação:** código completo e testado localmente; **ainda não
> publicado**. Rotas gratuitas em [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md):
> **demo** (GitHub Pages, sem contas novas), **A** (GitHub Pages + Supabase Free)
> e **B** (Netlify Free + Supabase Free).

## Modo demonstração
Roda inteiro no aparelho, sem servidor e sem conta, com dados de exemplo
fictícios (salvos só naquele navegador). Mesmas telas e regras de negócio;
não demonstra segurança multiusuário.
```bash
npm run dev:demo                # local
npm run build:demo              # site estático com PWA (dist-demo/)
npm run build:preview-file      # um único index.html (dist-single/)
npx playwright test -c playwright.demo.config.ts   # testes da demo em viewport de iPhone
```

## Funcionalidades
- **Dashboard**: projetos ativos/atrasados, avanço físico × planejado, ações
  atrasadas/bloqueadas/críticas, riscos altos, decisões pendentes, marcos,
  curva S, orçamento planejado × realizado, matriz P×I. Filtros por projeto,
  período, área, responsável e status. Tudo calculado dos dados gravados.
- **Projetos**: termo de abertura, sponsor/gerente, datas, orçamento, encerramento
  (concluídos/cancelados/suspensos continuam consultáveis), SPI/CPI só com dados suficientes.
- **Plano de ação**: tabela filtrável, Kanban (arrastar-e-soltar persistido),
  cronograma; dependências, comentários, evidências, anexos, histórico; conclusão
  registra quem e quando (definido pelo banco).
- **Governança**: EAP/entregas, Gantt e caminho crítico (CPM), marcos, riscos e
  respostas, problemas, solicitações de mudança, decisões, stakeholders
  (poder × interesse), matriz RACI, status reports com snapshot de métricas, lições.
- **Segurança**: 5 papéis, RLS em todas as tabelas, campos privilegiados
  protegidos por gatilhos, anexos em bucket privado com URL assinada, auditoria
  campo a campo imutável. Ver [matriz de permissões](docs/PERMISSOES.md).
- **Planilhas**: template oficial, importação em etapas com simulação no servidor
  e gravação tudo-ou-nada; exportação XLSX (14 abas) e CSV. Ver [docs/PLANILHAS.md](docs/PLANILHAS.md).
- **PWA**: instalável em iPhone (Safari) e Android; sem cache de dados. Ver [docs/PWA.md](docs/PWA.md).
- **Backup**: `pg_dump` independente + restauração verificada. Ver [docs/BACKUP.md](docs/BACKUP.md).

## Desenvolvimento local
```bash
npm install
cp .env.example .env.local      # preencha com o SEU projeto Supabase
npm run dev                     # http://localhost:5173
```
Sem Supabase próprio, use o stack local (Linux com Postgres 16 em
`/usr/lib/postgresql/16/bin`; baixa Supabase Auth e PostgREST oficiais):
```bash
npm run stack:up                # gera .env.test.local
npx vite --mode test            # app apontando para o stack local
```

## Testes
| Comando | O que valida |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript estrito |
| `npm run test:unit` | KPIs, CPM, validação de arquivos, parsing de planilhas, erros |
| `npm run stack:up && npm run test:db` | API real: autenticação, RLS positivo/negativo por papel, auditoria, storage, importação/exportação e ida-e-volta |
| `npx playwright test` | Navegador real: fluxos completos, permissões, indicadores, planilhas, PWA, offline, falha de API, layout celular |
| `bash scripts/backup/verify-restore.sh` | Backup + restauração isolada + comparação |

## Documentação
[Arquitetura](docs/ARQUITETURA.md) · [Permissões](docs/PERMISSOES.md) ·
[KPIs](docs/KPIS.md) · [Planilhas](docs/PLANILHAS.md) · [PWA](docs/PWA.md) ·
[Backup](docs/BACKUP.md) · [Implantação, serviços e custos](docs/IMPLANTACAO.md) ·
[Progresso e pendências](docs/PROGRESSO.md)

Capturas (dados de teste fictícios do ambiente local): `docs/screenshots/`.
