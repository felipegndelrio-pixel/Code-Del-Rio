# Fase 2 — Diagnóstico de segurança (antes de qualquer código)

Medido em 2026-10-19 sobre `fase-1.5` @ `11facd7`, código idêntico ao merge do PR 3 na branch padrão (`2eea2fa`). Build `nexo:build`, preview com Playwright/Chromium, `wrangler pages dev` 4.151.2.

## 0. Pré-requisito

PR 3 (Fase 1.5) mergeado em `2eea2fa` com CI verde ([run 39302303131](https://github.com/felipegndelrio-pixel/Code-Del-Rio/actions/runs/39302303131)). Branch `fase-2-seguranca` criada a partir de `2eea2fa`.

## 1. Respostas às perguntas do diagnóstico

| Pergunta | Fato | Evidência |
|---|---|---|
| `_headers` existe? | **Sim**, desde antes da Fase 0, com CSP, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy (inclui `payment=()`) e cache. | `public/_headers`; `baseline.md` §2 |
| `wrangler` instalado? | **Não** (nem raiz nem app). Versão atual no npm: **4.151.2** (`engines: node >=22`; o CI usa 22). Testado fora do repositório: `pages dev dist --port=8788` sobe em ~3 s e **aplica o `_headers`** (`curl -I` mostra os 6 cabeçalhos). Tentativa de telemetria para `workers.cloudflare.com` foi recusada pelo proxy, sem efeito no teste → usar `WRANGLER_SEND_METRICS=false`. | log em scratchpad |
| `dangerouslySetInnerHTML` | **1 ocorrência**: `ReportPage.tsx:144`, SVG gerado por `bpmn-js saveSVG()` (Seção 3 do relatório). Contém nomes digitados pelo usuário, **como texto escapado** dentro de `<tspan>`. | sonda: atividade `<script>x</script>` → `&lt;script&gt;x&lt;/script&gt;</tspan>`; 0 `<script>`, 0 `foreignObject`, 0 atributos `on*`, 0 disparos |
| `_n` cobre todos os hrefs de input? | **`_n` não existe no código-fonte.** É nome minificado da prévia (`baseline.md` §2). **Nenhum href vem de dado do usuário:** `#conteudo`, `COMMERCIAL.secondaryCta.url` e `mailto:` de constante (`brand.ts`, hoje vazios) e `blob:` de arquivos que o próprio app gera. Não há `window.open`, `location.href =` nem `srcDoc`. | `grep` em `src` |
| `theme-init.js` inline? | **Não. Já é externo** (`public/theme-init.js`, 11 linhas, sem minificação), carregado antes do bundle. O `dist/index.html` tem só 2 `<script>`, ambos com `src` e **nenhum inline**. | `dist/index.html` |
| Flash sem ele? | **Reproduzido** quando a escolha salva difere do sistema. Com sistema claro e escolha escura, sem `theme-init.js` o 1º paint fica claro (`data-theme` nulo, fundo `rgb(245,247,250)`); com ele, fica escuro (`rgb(14,17,23)`). Quando não há escolha salva, o CSS já segue o sistema e não há flash. | sonda `DOMContentLoaded` |
| Outro script inline? | **Não.** | idem |
| `<noscript>` | Existe só com uma frase, sem estilo e sem menção à privacidade (D8). | `index.html` |
| `<meta name="referrer">` | Ausente. | idem |

## 2. Superfície de importação e exportação (estático; ainda sem os 6 arquivos)

- **Hyperlink em célula:** só o texto é lido; o endereço é descartado (`parse.ts:38`).
- **Fórmula:** só o resultado em cache é lido, nunca a fórmula (`parse.ts:36`). `=cmd|'/c calc'!A0` vindo de CSV vira texto.
- **Exportação CSV:** prefixa `'` em valores que começam com `= + - @ tab CR` (`workbook.ts:306`).
- **Exportação XLSX:** as únicas fórmulas são do próprio modelo, com referências fixas. Valores do usuário são gravados como valor; falta verificar no XML (`<f>` ausente).
- **`.xlsm`:** é aceito (`parse.ts:125`, `Import.tsx:140`). O exceljs ignora `vbaProject.bin`, e o navegador não executa VBA.
  - **Limite:** não consigo gerar um `vbaProject.bin` compilado com `Auto_Open` real neste ambiente. O teste usará um `.xlsm` com content-type *macroEnabled* e `vbaProject.bin` sintético, e isso será declarado.
- **Armazenamento:** `localStorage` só guarda `nexo.theme`; IndexedDB guarda `workspaces` e `drafts`. Nenhuma senha ou token. **Zero** dado do usuário passado a `javascript:` ou `data:text/html`.

## 3. CSP proposta × evidência (decididos na §6)

Varredura com CSP **estrita** (`style-src 'self'`, `font-src 'self'`, `worker-src 'self'`, `base-uri 'none'`) em 12 rotas da demonstração, com SW bloqueado. O controle positivo disparou.

| Diretiva proposta | Evidência | Recomendação |
|---|---|---|
| `worker-src 'self' blob:` ("necessário para jszip/exceljs") | **Nenhum `new Worker` em nenhum chunk.** As 3 ocorrências de `importScripts` em `zip-*` e `xlsx-*` são polyfills de `setImmediate` que só **testam** se estão num worker. O único worker é o `sw.js` (`'self'`). | **Manter `worker-src 'self'`, sem `blob:`** (menor privilégio). Muda a decisão prescrita → consulto. |
| `style-src 'unsafe-inline'` ("bpmn-js injeta `<style>`") | Sem `'unsafe-inline'`, **0 violações** no mapa, gráficos, assistente e exportar: React e bpmn-js aplicam estilo via CSSOM, permitido. **Única fonte: o relatório** — 325 atributos `style` do SVG inserido por `dangerouslySetInnerHTML`. | **Opção A (recomendada):** renderizar o SVG do relatório como `<img src="data:image/svg+xml…" alt="…">`. Isso elimina o único `dangerouslySetInnerHTML` e permite `style-src 'self'`. Custo: o texto do SVG deixa de ser selecionável e lido por leitor de tela (as mesmas informações estão nas tabelas do relatório; `alt` descritivo); validar impressão. **Opção B:** manter como está, com comentário de justificativa e teste E2E com payloads. |
| `font-src 'self'` (sem `data:`) | Nenhuma fonte `data:` no CSS. Todas as `woff2` são arquivos. | De acordo (aperta a política atual). |
| `base-uri 'none'` | Não há `<base>`. | De acordo. |
| Remover `X-Frame-Options: DENY` e `payment=()` (ausentes na proposta) | Já em produção hoje. Defesa extra para navegadores antigos. | **Manter os dois** (superset da proposta). |
| `img-src blob:` "para Fase 8" | O PNG exportado **hoje** já usa `blob:` → `<img>` → canvas (`render.ts:51`). | De acordo; corrigir a justificativa no doc. |

## 4. Achado novo: os E2E não aplicam CSP depois que o service worker assume

`helpers.ts` injeta a CSP via `page.route`. Navegações servidas pelo SW (precache, `navigateFallback`) **não passam por `page.route`**: com SW permitido, nem o controle positivo dispara. Logo, a "CSP aplicada nos E2E" (linha de base §8) só vale para a primeira carga de cada teste.

Proposta:
- a verificação de "zero violações em todas as rotas" roda contra o `wrangler pages dev` (cabeçalho real, decisão 7);
- os E2E passam a ler a CSP de `public/_headers`, uma fonte única em vez de uma cópia da string que pode divergir.

## 5. Premissas do prompt que não batem com o repositório (sem reabrir decisões)

- **Decisão 14:** o "aviso de grupo vazio já implementado" **não está implementado**; está registrado como dívida em `docs/release-checklist.md`. Proponho manter para a Fase 5 (higiene), fora deste PR.
- **Decisão 2:** o manifesto ainda tem `orientation: 'any'` (a Fase 3 não ocorreu). Fica para a Fase 3.
- **"Entry ≤ 120 KB":** a entrada tem 23,1 KB gzip. O limite de 120 KB vale para o **JS inicial** (hoje 115,0 KB). Usarei "JS inicial ≤ 120 KB gzip".
- **"E2E 54/54":** o real é **54 passed + 2 skipped** (56).
- **Nomes do design system** (`Cs`, `V`, `ws`…): são minificados. No código: `Card`, `Badge`, `Button` etc.
- **`.wrangler/`:** o `pages dev` cria esse diretório de estado dentro de `apps/nexoprocess/`; entra no `.gitignore` junto com o `wrangler`.
- **CI "job obrigatório":** adiciono o passo e o job no workflow. Torná-lo *required* na proteção de branch é configuração do dono do repositório.

## 6. Decisões tomadas (dono do produto)

| # | Decisão |
|---|---|
| 1 | `worker-src 'self'`, sem `blob:` |
| 2 | Relatório: opção A (`<img>`) **se** as tabelas do relatório contiverem nomes, responsáveis, tempos e classificação Lean das atividades; senão, opção B (`'unsafe-inline'` mantido, com justificativa). Se as tabelas não cobrirem o diagrama, parar e discutir antes de codar. |
| 3 | Manter `X-Frame-Options: DENY` e `payment=()` |
| 4 | `<noscript>` com tokens de tema |
| 5 | Aviso no `.xlsm`: "Macros do arquivo são ignoradas; só os valores das células são lidos" |
| 6 | Merge do PR 3: feito em `2eea2fa` |

## 7. Leitura de `ReportPage.tsx` para a decisão 2 — condição de parada atingida

**O que o diagrama desenha** (`bpmn/model.ts`, `render.ts:renderAllSvgs`): nome de cada atividade e decisão, nome das etapas, eventos de início e fim, rótulos de fluxo (`Sim`/`Não`, `Segue para: …`) e a sequência. Duração, Lean e papel só aparecem na documentação do XML, **não no desenho**.

**O que as tabelas do relatório contêm:**
- §1 processo e escopo (etapas em uma linha);
- §2 indicadores agregados;
- §4 **só os gargalos**, no máximo 5, com atividade, etapa e participação;
- §5–§11 recomendações, mudanças, comparação, business case, plano e resultados.

**Nenhuma tabela lista todas as atividades**, nem com responsável, tempo ou classificação Lean.

**Medição na demonstração** (Playwright: textos `<text>` dos SVGs comparados com o restante do relatório):

- **31 textos no diagrama.**
- **9 também aparecem no relatório:** 4 etapas e 5 atividades.
- **22 aparecem só no diagrama:** 11 atividades, 5 decisões, 2 fins, início de etapa, `Sim`/`Não` e `Segue para`.
  - Atividades: Conferir dados do cliente, Solicitar correção ao cliente, Consultar limite de crédito, Conferir itens separados, Embalar pedido, Emitir nota fiscal, Despachar pedido…
  - Decisões: Dados completos?, Crédito aprovado?, Aprovado na análise manual?, Itens corretos?

**Conclusão:** a regra da decisão 2 aponta para a **opção B**, e a condição de parada ("tabelas não contêm todas as informações do diagrama → discutir A vs B antes de codar") foi atingida. A implementação aguardou essa conversa (ver §8).

**Elementos para a conversa** (fatos, sem nova recomendação):
- **Com A**, o texto do diagrama sai da árvore de acessibilidade. Hoje o SVG inline expõe esses 22 textos a leitores de tela; dentro de `<img>`, só o `alt`.
- **Com B**, permanece `style-src 'unsafe-inline'` e o único `dangerouslySetInnerHTML`. O conteúdo é DOM serializado do bpmn-js, com nomes escapados (sonda da §1: zero execução).
- **A + tabela "Atividades por etapa"** (nome, etapa, tipo, responsável, duração, Lean) cobriria o diagrama e os dados citados na decisão 2. É **escopo novo**: muda o relatório e o PDF.

## 8. Decisão B (dono do produto) e follow-up para a Fase 7

**Decisão:** opção B. O SVG do relatório continua inline, com `dangerouslySetInnerHTML` justificado em comentário no código (`ReportPage.tsx`), e `style-src 'unsafe-inline'` permanece.

**Motivo:** é a única opção que respeita as duas restrições da fase ao mesmo tempo.
- A Fase 2 é só segurança: não muda o relatório nem o PDF.
- Não pode reduzir acessibilidade: `<img>` tiraria 22 textos da árvore de acessibilidade.

**Risco residual:** o vetor real seria script via `innerHTML`, e está contido. Os nomes saem escapados, a sonda deu zero execução, e `tests/e2e/security.spec.ts` cobre:
- script inline;
- `<img onerror>` e `<svg onload>`;
- `javascript:` como texto e como hyperlink;
- verificação de que nada aparece como elemento ou atributo no DOM do relatório.

**Follow-up registrado na Fase 7 (UX), em `plano-fases.md`:**
1. Tabela "Atividades por etapa" no relatório (nome, etapa, tipo, responsável, duração, Lean), que cobre o diagrama e os dados que hoje faltam.
2. Com a tabela, o SVG passa a `<img>` com `alt` (sem perda para leitores de tela) e o `dangerouslySetInnerHTML` sai.
3. Os atributos `style=` do SVG inline viram classes CSS, e a CSP aperta para `style-src 'self'`. Atualizar `EXPECTED_CSP` em `scripts/test-csp.mjs` e `docs/security-headers.md`.
