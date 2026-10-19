# Checklist de release — NexoProcess

Itens verificados antes de cada versão. Detalhes por fase em [`plano-fases.md`](plano-fases.md).

## Portões automáticos (CI)

- [ ] `npm run nexo:typecheck && npm run nexo:lint && npm run nexo:test:unit && npm run nexo:check-bundle && npm run nexo:build`
- [ ] E2E (`nexoprocess-e2e`) verde, incluindo axe sem exclusão do diagrama (desktop nos dois temas e celular 390 px no mapa)
- [ ] Contraste dos selos do mapa ≥ 4,5:1 nos dois temas (`src/styles/contrast.test.ts`, roda em `nexo:test:unit`)

## Metas medidas manualmente

- [ ] Lighthouse móvel no mapa (`/app/p/:id/mapa`, perfil com a demonstração): Desempenho ≥ 80, Acessibilidade ≥ 95
- [ ] Diagrama inteiro na primeira dobra a 390×844 e 360×800 (`docs/evidencias/fase-1.5/`)

## Dívidas conhecidas

- `npm run test` da raiz falha por testes do app X (Supabase local); CI usa `nexo:test:unit`; migrar para workspaces eventualmente.
- `check-bundle` deve avisar quando um grupo de code splitting declarado gera chunk vazio (hoje o grupo `xlsx` não gera nada, pois o pacote não está instalado).
