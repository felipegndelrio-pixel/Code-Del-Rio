# Checklist de release — NexoProcess

Itens verificados antes de cada versão. Detalhes por fase em [`plano-fases.md`](plano-fases.md).

## Portões automáticos (CI)

- [ ] `npm run nexo:typecheck && npm run nexo:lint && npm run nexo:test:unit && npm run nexo:check-bundle && npm run nexo:build`
- [ ] E2E (`nexoprocess-e2e`) verde, incluindo axe sem exclusão do diagrama (desktop nos dois temas e celular 390 px no mapa)
- [ ] Contraste dos selos do mapa ≥ 4,5:1 nos dois temas (`src/styles/contrast.test.ts`, roda em `nexo:test:unit`)
- [ ] **CSP validada em CI:** `nexo:test:csp` (cabeçalhos reais via `wrangler pages dev`, diretiva a diretiva) no job `checks`, e `nexo:test:csp:rotas` (23 rotas + 5 exportações, service worker ativo, zero violações, controle positivo) no job `nexoprocess-e2e`. Política e justificativas em `docs/security-headers.md`.
- [ ] Entrada maliciosa (`tests/e2e/security.spec.ts`): 6 arquivos maliciosos, `.xlsm` com macro, `<noscript>` e tema sem flash

## Metas medidas manualmente

- [ ] Lighthouse móvel no mapa (`/app/p/:id/mapa`, perfil com a demonstração): Desempenho ≥ 80, Acessibilidade ≥ 95
- [ ] Diagrama inteiro na primeira dobra a 390×844 e 360×800 (`docs/evidencias/fase-1.5/`)
- [ ] Com deploy no Cloudflare: `TEST_BASE_URL=https://<deploy>.pages.dev npm run nexo:test:csp` e `nexo:test:csp:rotas` contra o deploy de preview

## Dívidas conhecidas

- `npm run test` da raiz falha por testes do app X (Supabase local); CI usa `nexo:test:unit`; migrar para workspaces eventualmente.
- `check-bundle` deve avisar quando um grupo de code splitting declarado gera chunk vazio (hoje o grupo `xlsx` não gera nada, pois o pacote não está instalado).
- `style-src 'unsafe-inline'` existe só pelo SVG inline do relatório (decisão B da Fase 2). Sai na Fase 7, junto com a tabela "Atividades por etapa" (ver `fase-2-diagnostico.md` §8).
