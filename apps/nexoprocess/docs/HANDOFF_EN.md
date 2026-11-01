# HANDOFF EN — próxima sessão

Versão 1, 01/11/2026. Branch `wip/en-foundation`. Autor: sessão de engenharia EN (Sonnet).

## 1. Estado da branch
- HEAD: ver `git log -1`. Último G3 verde confirmado no GitHub: run #19 em `b16a6b9`. Commits posteriores (revert do demo, testes e2e do demo, CLAUDE.md, rascunho legal, este arquivo) só mexem em 2 telas PT revertidas ao comportamento original, testes e docs; G3 deles A VALIDAR no Actions.
- Local em `b16a6b9`+: typecheck e eslint ok; vitest 298/298; golden PT de 25 telas idêntico; e2e projeto `licenca` 32/32.
- PROIBIDO: deploy, Wrangler, Cloudflare, Supabase, Hotmart, conta Gumroad, produção, merge, tags, force-push, publicar landing/legais. Push só em `wip/**`.
- Regra permanente do fundador: **não impactar a versão PT**.

## 2. O que já está em EN
Entrada e licença (e-mail + license key), cabeçalho/shell, gate, faixa de demo, Home, moldura do projeto, jornada, 16 abas (Visão geral, Dados, Validar, Mapa, Diagnóstico, Recomendações, TO-BE, Comparar, Plano, Resultados, Riscos, RACI, Simulação, Automação, Exportar), domínio (métricas, validação, comparar, recomendações, TO-BE, tipos, glossário), gráficos e mapa BPMN, Landing, Importar planilha, marca/textos comerciais, fábrica de projeto (exemplo).
Dicionário: 2086 chaves (`ws.` 1075, `d.` 625, `pg.` 116, `home.` 84, `ui.` 49, `nav.` 45, demais 92).

## 3. O que falta (contagens da ferramenta; são candidatos, não textos finais)
| Item | Candidatos | Observação |
|---|---|---|
| Assistente (`Assistant.tsx`) | ~209 (189 únicos novos) | usa `t` como identificador → `TNAME=tx` |
| Formulário (`Wizard.tsx`) | ~126 | |
| Relatório/PDF (`ReportPage`) | ~216 | |
| Ajuda (`Help.tsx`) | ~93 | |
| Mensagens de banco/rascunho/ações | não contado | `db`, `draftCommit`, `actions` |
| Templates XLSX/CSV e cabeçalhos | não contado | `io/fields.ts`, `workbook.ts`, `planCsv.ts`, `toProcess.ts` continuam PT; CSV usa `;` e vírgula decimal |
| Páginas legais | — | decisão: NÃO traduzir texto legal no app; usar páginas EN via `VITE_EN_*`. Rascunho em `docs/legal-en/` |
| Home EN: links de documentos | — | usar `LICENSE.legalEn` ou ocultar |
- O revisor limitou o escopo EN v1 ao 1º uso. Formulário/Assistente (~315) e Relatório/PDF (~216) exigem decisão antes.

## 4. Como o i18n funciona
- `src/i18n/`: `messages/pt.ts` é a fonte da verdade; `en.ts` é `Record<MessageKey,string>` (chunk separado, ~93 KB gzip, `loadLocale('en')` antes do render em `main.tsx`).
- Em componente: `const { t, fmt } = useI18n()`. Fora de componente: `tr()`. Tabelas de rótulos: `lazyLabels()` (getters). Datas, números e moeda: `units.ts` (BRL em PT, USD em EN).
- Idioma: `?lang=en|pt` + preferência `nexo-ui.lang`. Padrão PT.
- Valores internos (`alta`, códigos, ids) ficam em PT; só o rótulo muda.

## 5. Procedimento para cada tela nova (ordem obrigatória)
1. Gere o **golden PT** da tela ANTES de migrar (`tests/e2e/golden`, spec `pt-golden.spec.ts`; texto visível + aria/title/placeholder/alt).
2. Migre para o dicionário (PT idêntico).
3. `npm run nexo:typecheck`, `npm run nexo:lint`, `npm run nexo:test -- src tests/api`.
4. `npx playwright test -c apps/nexoprocess/playwright.config.ts --project=desktop tests/e2e/pt-golden.spec.ts` (golden PT tem que ficar idêntico) e `en-coverage.spec.ts`.
5. Commit pequeno, push em `wip/en-foundation`, esperar o G3 (mínimo `passed >= 29`; se o total mudar, ajustar o mínimo para o total exato, `pending=0`) e anotar a linha do validador.
6. Relatório curto ao revisor: hash, arquivos, testes, linha do G3, riscos, o que NÃO foi verificado.
- Não rodar duas execuções do Playwright ao mesmo tempo (porta 4180; `licenca` usa 4181).
- Duas falhas no mesmo ponto: pare e diagnostique.

## 6. Comandos (a partir da raiz do repositório)
- `npm run nexo:typecheck` · `npm run nexo:lint` · `npm run nexo:test -- src tests/api`
- `npm run nexo:e2e` (todos os projetos: desktop, licenca, iphone-390, w320, android)
- `npm run nexo:build` e check do bundle (entrada ≤130 KB gzip é o limite do `check-bundle`; ver §7)

## 7. Riscos e pendências conhecidas
- Bundle inicial ~155 KB gzip (dicionário PT eager); verificar o resultado do `check-bundle` no HEAD antes de afirmar que passa — A VALIDAR.
- Textos EN são rascunho sem revisão nativa; moeda "R$"→"$" em rótulos; privacidade/Help precisam de revisão jurídica.
- Não verificado: Safari iPhone e Android reais, Gumroad real (1ª venda valida formatos; falha fechada com 422 `ativacao_manual` + runbook em `GUMROAD_ENTITLEMENT.md` §13), Pages Functions reais.
- Fora do alcance sem GO do fundador: deploy, SQL em produção, merge, publicar landing/legais, variáveis de produção, Ping/OAuth, produto Gumroad.
- T5 (landing f5): só quando o fundador anexar `f5-landing-en.tar`; extrair em commit separado, sem publicar.
- Regras de modelo: ver `CLAUDE.md` (MODEL ROUTING POLICY).

## Teste de fumaça real (fundador, antes de abrir a venda; sem mexer em variáveis)
1. Faça uma compra do próprio produto com **cupom de 100%**.
2. Ative em `/entrar?lang=en` com o e-mail da compra e a license key. Esperado: entra (token).
3. No painel da Gumroad, **reembolse** essa compra.
4. Tente ativar de novo com a mesma chave. Esperado: "We could not find an active purchase" (HTTP 404) e, no banco, a compra como `refunded` (consulta no runbook §13 de `GUMROAD_ENTITLEMENT.md`).
5. Anote só **se o product_id/sale_id tem "=" e o comprimento**, nunca o valor.
- Prova a detecção de reembolso com evidência real. Se falhar no passo 2, a causa mais provável é formato de id ou `GUMROAD_PRODUCT_ID` (o código aceita a variável com ou sem "==", mas a chamada à API da Gumroad usa o valor colado; A VALIDAR com a 1ª compra real).
- Pendente de decisão do fundador (NÃO implementado): TTL próprio de 7 dias para tokens Gumroad, para reduzir a janela offline após reembolso.

## 8. Documentos relacionados
`docs/GUMROAD_ENTITLEMENT.md` (decisões D1–D8, runbook), `docs/LANCAMENTO_EN.md` (runbook do fundador), `docs/legal-en/` (rascunho legal), `docs/DEPLOY_CLOUDFLARE.md`.
