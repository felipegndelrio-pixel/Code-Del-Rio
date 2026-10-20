# Checklist de release — NexoProcess

Itens verificados antes de cada versão. Detalhes por fase em [`plano-fases.md`](plano-fases.md).

## Portões automáticos (CI)

- [ ] `npm run nexo:typecheck && npm run nexo:lint && npm run nexo:test:unit && npm run nexo:check-bundle && npm run nexo:build`
- [ ] E2E (`nexoprocess-e2e`) verde, incluindo axe sem exclusão do diagrama (desktop nos dois temas e celular 390 px no mapa)
- [ ] Contraste dos selos do mapa ≥ 4,5:1 nos dois temas (`src/styles/contrast.test.ts`, roda em `nexo:test:unit`)
- [ ] **CSP validada em CI:** `nexo:test:csp` (cabeçalhos reais via `wrangler pages dev`, diretiva a diretiva) no job `checks`, e `nexo:test:csp:rotas` (23 rotas + 5 exportações, service worker ativo, zero violações, controle positivo) no job `nexoprocess-e2e`. Política e justificativas em `docs/security-headers.md`.
- [ ] Entrada maliciosa (`tests/e2e/security.spec.ts`): 6 arquivos maliciosos, `.xlsm` com macro, `<noscript>` e tema sem flash
- [ ] Paridade `vercel.json` × `public/_headers` (`tests/api/vercel-headers.test.ts`)
- [ ] Acesso pela compra: API e webhook (`tests/api/license.test.ts`) e E2E do modo de venda (`tests/e2e/license.spec.ts`, projeto `licenca`)
- [ ] API no runtime do Cloudflare Pages (`nexo:test:api`: functions + workerd + Supabase falso, webhook → ativação → reembolso)

## Metas medidas manualmente

- [ ] Lighthouse móvel no mapa (`/app/p/:id/mapa`, perfil com a demonstração): Desempenho ≥ 80, Acessibilidade ≥ 95
- [ ] Diagrama inteiro na primeira dobra a 390×844 e 360×800 (`docs/evidencias/fase-1.5/`)
- [ ] Com deploy no Cloudflare: `TEST_BASE_URL=https://<deploy>.pages.dev npm run nexo:test:csp` e `nexo:test:csp:rotas`, `curl` em `/api/license` e "Enviar teste" do webhook da Hotmart com log `→ active` (`docs/DEPLOY_CLOUDFLARE.md`, passos 4 e 5)
- [ ] Com deploy na Vercel: os mesmos dois testes com `TEST_BASE_URL=https://<app>.vercel.app`, `curl` em `/api/license` e "Enviar teste" do webhook da Hotmart com log `→ active` (`docs/DEPLOY_VERCEL.md`, passos 4 e 5)

## Dívidas conhecidas

- `npm run test` da raiz falha por testes do app X (Supabase local); CI usa `nexo:test:unit`; migrar para workspaces eventualmente.
- `check-bundle` deve avisar quando um grupo de code splitting declarado gera chunk vazio (hoje o grupo `xlsx` não gera nada, pois o pacote não está instalado).
- `style-src 'unsafe-inline'` existe só pelo SVG inline do relatório (decisão B da Fase 2). Sai na Fase 7, junto com a tabela "Atividades por etapa" (ver `fase-2-diagnostico.md` §8).
