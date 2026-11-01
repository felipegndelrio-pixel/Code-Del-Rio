# HANDOFF EN — próxima sessão

Versão 2, 01/11/2026 (v1 no mesmo dia; v2 acrescenta Formulário, Assistente e Relatório/PDF). Branch `wip/en-foundation`. Autor: sessão de engenharia EN (Sonnet).

## 1. Estado da branch
- HEAD: ver `git log -1`. Último G3 verde confirmado no GitHub: run #19 em `b16a6b9`. Commits posteriores (revert do demo, testes e2e do demo, CLAUDE.md, rascunho legal, este arquivo) só mexem em 2 telas PT revertidas ao comportamento original, testes e docs; G3 deles A VALIDAR no Actions.
- Local em `b16a6b9`+: typecheck e eslint ok; vitest 298/298; golden PT de 25 telas idêntico; e2e projeto `licenca` 32/32.
- PROIBIDO: deploy, Wrangler, Cloudflare, Supabase, Hotmart, conta Gumroad, produção, merge, tags, force-push, publicar landing/legais. Push só em `wip/**`.
- Regra permanente do fundador: **não impactar a versão PT**.

## 2. O que já está em EN
Entrada e licença (e-mail + license key), cabeçalho/shell, gate, faixa de demo, Home, moldura do projeto, jornada, 16 abas (Visão geral, Dados, Validar, Mapa, Diagnóstico, Recomendações, TO-BE, Comparar, Plano, Resultados, Riscos, RACI, Simulação, Automação, Exportar), domínio (métricas, validação, comparar, recomendações, TO-BE, tipos, glossário), gráficos e mapa BPMN, Landing, Importar planilha, marca/textos comerciais, fábrica de projeto (exemplo).
Também em EN (v2): Formulário completo, Assistente de criação (inclui texto livre em inglês), aviso de rascunho desatualizado, Relatório executivo/PDF. Dicionário na v1: 2086 chaves (agora ~2700) (`ws.` 1075, `d.` 625, `pg.` 116, `home.` 84, `ui.` 49, `nav.` 45, demais 92).

## 3. O que falta (contagens da ferramenta; são candidatos, não textos finais)
| Item | Candidatos | Observação |
|---|---|---|
| Assistente, Formulário, Relatório/PDF | FEITO (v2) | chaves `as.*`, `wz.*`, `stale.*`, `rp.*`, `bpmn.*` |
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

## 9. Estado após a v2 (01/11/2026)
- Golden PT: 57 estados (25 originais + Formulário 11 + Assistente 20 + Relatório de projeto sem TO-BE 1), idênticos. Cobertura EN (`en-coverage.spec.ts`): zero sobras no Formulário, Assistente e Relatório (demo e projeto do Assistente).
- PDF: `report-print.spec.ts` (Chromium) confere o título do arquivo (`Executive report - …`), `window.print` e o PDF em mídia de impressão (10 páginas, mesmas quebras do PT). `NEXO_PDF_OUT=<pasta>` grava os PDFs. **Safari/iPhone e Android reais: NÃO verificados.**
- A VALIDAR: `CompareTab.tsx` compara `r.unit === 'R$/mês'` (texto PT); em EN a unidade é `$/month`, então custos podem sair sem formatação de moeda e a coluna de unidade mostra códigos em PT. O Relatório já usa `isCostUnit()`; a aba Comparar não foi alterada (fora do escopo desta sessão).
- Ajuda (~93), XLSX/CSV e mensagens de banco/ações continuam pendentes. Páginas `ajuda`, `privacidade` e `termos` seguem em PT no EN (decisão legal: não traduzir no app).
- Texto livre do Assistente: o EN aceita `by`, `owner:`, `then`, unidades em inglês; no PT as expressões são as de sempre (teste `assistant.test.ts`).

## 10. Dívida técnica registrada (decisão do revisor, 01/11/2026)
- **Bundle inicial 157,8 KB gzip (JS+CSS, 9 arquivos) contra a meta de 130 KB.** Aceito por agora: o `check-bundle` passa (a regra dura é a ENTRADA, 23,0 KB, limite 130 KB; a falha do inicial só ocorre acima de 400 KB, `plano-fases.md`). Linha de base antiga: 228,7 KB.
- Caminho possível para chegar a ≤130 KB: carregar o dicionário PT sob demanda (chunk de ~32 KB gzip), como já é feito com o EN.
- **Risco:** mexe no 1º render do PT (hoje síncrono, sem espera). Exige golden PT, e2e iPhone/Android e decisão do fundador. NÃO aplicar sem esse GO.

## 11. Build de venda desta branch (decisão do revisor, 01/11/2026)
- `scripts/check-sale-env.mjs` agora EXIGE `VITE_GUMROAD_CHECKOUT_URL`, `VITE_EN_TERMS_URL`, `VITE_EN_PRIVACY_URL` e `VITE_EN_REFUND_URL` (https, sem marcador `<>[]{}`/INSIRA/SEU/YOUR). Teste: `tests/api/check-sale-env.test.ts`.
- Qualquer build de venda a partir desta branch (PT ou EN) precisa das 4 variáveis. A troca PT de sábado não é afetada: a folha de execução (v2.1, Passo Zero Z3) usa um clone limpo da TAG `v2.5.0-rc1` com conferência do SHA (FATO informado pelo revisor; não verificado por esta sessão).

## 12. Limitação conhecida: moeda segue o idioma (decisão do revisor, 01/11/2026)
- A moeda exibida segue o idioma: BRL em PT, USD em EN (`fmtBRL` → `formatters(locale).currency`). Os valores guardados no projeto são números sem moeda e **não são convertidos**.
- Consequência: um projeto criado em PT (valores em reais) e aberto em EN mostra os mesmos números com "$". Não corrigir agora; registrado para decisão futura (ex.: guardar a moeda no projeto).

## 13. Estado após as rodadas I1–I5 e J (01/11/2026)

- **I1–I4:** Ajuda, mensagens de banco/rascunho/armazenamento, templates XLSX/CSV (importa arquivo PT ou EN em qualquer idioma ativo; provado por testes) e e2e em w320/android/licença, todos verdes.
- **I5, inventário de PT remanescente (contagem por arquivo):** `fields.ts` 61 (rótulos canônicos PT, intencional), `Legal.tsx` 30 (intencional), `journey.ts` 8, `license/config.ts` 6, `Login.tsx` 6 (fluxo Hotmart, intencional), `compare.ts` 4, `toProcess.ts` 3, `CompareTab` 3, `advanced` 2, `WorkspacePage` 2, `demo.ts` 1, `tobe` 1, `Assistant` 1, `Import` 1, `RisksTab` 1, `ReportPage` 1. Os pequenos são códigos internos/comentários; revisar se algum virar texto visível.
- **CSV:** `;` e vírgula decimal (limitação conhecida); CSV do plano EN usa datas ISO.
- **`DEMO_MESSAGE`:** não usada.
- **J:** landing e legais estáticas em `public/en/` (ver `LANCAMENTO_EN.md` §6.1). Nada publicado.
