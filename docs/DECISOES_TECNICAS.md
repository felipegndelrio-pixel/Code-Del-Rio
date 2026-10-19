# Decisões técnicas — NexoProcess (V3)

Atualizado em 2026-10-19. Branch `claude/plataforma-gestao-projetos-vni4py`.

## 1. Auditoria do repositório (Fase A)

| Item | Achado | Classificação |
|---|---|---|
| Aplicação existente | “Plataforma Executiva de Gestão de Projetos” (React 19 + TS + Vite + Tailwind + Recharts + ExcelJS + Supabase), na raiz (`src/`, `supabase/`, `tests/`). Multiusuário, com RLS e auditoria. | FACT |
| Estado | Lint, typecheck, testes unitários e build passando (ver `docs/PROGRESSO.md`). | FACT |
| Hospedagem configurada | `netlify.toml` e workflow do GitHub Pages (`.github/workflows/pages.yml`). | FACT |
| Cloudflare Pages | **Não existe** configuração de Cloudflare Pages no repositório (nem `wrangler.*`, nem `_headers`/`_redirects`). Não havia integração a preservar. | FACT |
| Escopo do pedido | NexoProcess é **outro produto**: mapeamento de processos BPMN + Lean, local-first, sem backend. | INFERENCE |

**Risco de alteração:** reescrever ou misturar os dois produtos quebraria o app existente (Supabase, RLS, testes de banco). **Decisão:** criar o NexoProcess como app independente em `apps/nexoprocess/`, reutilizando a stack e as dependências da raiz, sem alterar nenhum arquivo do app existente além de `package.json` (scripts e dependências adicionadas), `package-lock.json`, CI e README.

## 2. Decisões

| # | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| D1 | App separado em `apps/nexoprocess` com `vite.config.ts`, `tsconfig.json`, `vitest.config.ts` e `playwright.config.ts` próprios; `node_modules` da raiz | Preserva o produto existente; um único `npm ci` | Reescrever a raiz (destruiria o app atual) |
| D2 | **Local-first**: IndexedDB (`nexoprocess` v1: `workspaces`, `drafts`); preferência de tema no `localStorage` | Requisito de privacidade e custo zero; funciona offline | Supabase/servidor (exige conta, custo e política de dados) |
| D3 | Leitura de XLSX/CSV **no navegador** (ExcelJS sob demanda; parser CSV próprio com detecção de `;`/`,`/tab e fallback Windows-1252) | Nada do conteúdo sai do aparelho | Upload para API |
| D4 | **bpmn-js 18** (NavigatedViewer) para renderizar; **XML BPMN 2.0 com DI gerado pelo app**; layout automático próprio (`src/bpmn/layout.ts`) | Biblioteca madura da notação; drill-down nativo em subprocessos recolhidos; controle total do layout (testado: sem sobreposição e sem arestas atravessando caixas no exemplo) | `bpmn-auto-layout` (menos controle sobre decisões e laços); SVG próprio (não seria BPMN real) |
| D5 | Modelo de diagrama: plano macro com **um subprocesso recolhido por etapa** + um plano por etapa; decisões = gateway exclusivo; vários sucessores = gateway paralelo de divisão; retornos = sequence flows de retorno | Navegação macro → etapa exigida; XML válido no metamodelo | Diagrama único achatado (ilegível em processos grandes) |
| D6 | Validação do XML por **bpmn-moddle** nos testes (zero avisos) | Evidência objetiva | Alegar conformidade sem teste |
| D7 | Cálculos **puros e testados** em `src/domain` (sem React); ausentes = `null` com motivo, nunca zero | Fórmulas auditáveis, 76 testes unitários | Cálculo dentro dos componentes |
| D8 | Recomendações por **regras determinísticas** (R1–R9), com evidência (fato/inferência), regra, hipótese e “teto teórico” (não previsão) | Rastreabilidade; sem custo de IA; sem simular IA | LLM obrigatória |
| D9 | TO-BE = **cópia profunda** do AS-IS + registro de mudanças (antes/depois, justificativa, hipótese, validador); AS-IS original preservado em `asIsBaseline` e cópias (`snapshots`) | Integridade AS-IS × TO-BE | Edição no mesmo objeto |
| D10 | Business case mensal; volume diário só converte com “dias de operação/mês” informado; volumes diferentes → TO-BE normalizado no volume do AS-IS | Não inventar premissas | Assumir 21 ou 22 dias úteis |
| D11 | Dupla contagem: flag “custo variável já inclui mão de obra” → não soma os dois | Requisito explícito | Somar sempre |
| D12 | Simulação Monte Carlo **triangular**, 1.500 iterações, PRNG com semente fixa (mulberry32), só com mínimo/máximo válidos | Reprodutível e testável | Distribuições inventadas |
| D13 | Modelo XLSX gerado em código (ExcelJS): células de entrada desbloqueadas, cabeçalhos/fórmulas bloqueados, listas suspensas, validação numérica, abas protegidas **sem senha** e estrutura travada via `workbookProtection lockStructure` (pós-processamento com JSZip) | Proteção contra edição acidental, não segurança | Senha (dá falsa sensação de segurança) |
| D14 | Gravação automática **imediata e coalescida** (uma escrita por vez, sempre do estado mais recente) | O E2E pegou perda de dados com debounce de 350 ms ao navegar | Debounce |
| D15 | PWA (vite-plugin-pwa): cache só do app shell; dados ficam no IndexedDB; atualização com aviso | Offline confiável | Cache de dados no SW |
| D16 | CSP estrita em `public/_headers` (sem script inline: o tema inicial fica em `public/theme-init.js`) | Segurança; testada no E2E (CSP aplicada ao preview) | `unsafe-inline` |
| D17 | Tokens de cor em CSS (RGB) por tema; paleta de gráficos validada (CVD/contraste) com o validador da skill de dataviz; tema claro escurecido até passar no axe (WCAG AA) | Acessibilidade verificável | Cores “a olho” |
| D18 | Roteamento por History API (Cloudflare Pages faz fallback de SPA sem `404.html`); `VITE_ROUTER=hash` disponível para hospedagens sem fallback | Confirmado na documentação oficial do Pages | `_redirects /* /index.html 200` (desnecessário) |

## 3. Licenças e marcas (TO VALIDATE antes de comercializar)

- **bpmn-js** — licença bpmn.io (MIT + condição): a marca d'água do bpmn.io **deve permanecer visível** e sem sobreposição. O app mantém a marca (CSS não a oculta; controles ficam nos cantos superiores). Validar com o jurídico se a condição é aceitável comercialmente.
- ExcelJS, JSZip, Recharts, React, bpmn-moddle: MIT.
- “NexoProcess” é **codinome**: marca e domínio não foram pesquisados (ver `apps/nexoprocess/docs/COMERCIALIZACAO.md`).
- Não há uso de logotipos, textos ou layout da ferramenta de referência, do PMI ou da Hotmart. O ciclo de IA (7 etapas) é descrito como “boas práticas gerais”, **sem** alegar padrão oficial do PMI/PMBOK.

## 4. Limitações técnicas conhecidas

1. **Junções paralelas** não são inferidas: o XML tem gateway paralelo de divisão, mas a junção fica implícita (várias entradas na atividade). Válido sintaticamente; a semântica de execução não é garantida (`isExecutable="false"`).
2. Fluxos de decisão que saem de uma etapa aparecem no macro como sequence flows entre subprocessos, com rótulo “Sim”/“Não” (resumo visual).
3. Tempo decorrido com decisões = **pior caso** (caminho mais longo); sem probabilidade por ramo.
4. LibreOffice: reconhece abas e células protegidas (teste automatizado), mas **não preserva** a trava de estrutura sem senha. **Excel não foi testado** neste ambiente (indisponível): TO VALIDATE.
5. Dados só no navegador: limpar dados do site apaga tudo. Mitigação: backup/restauração JSON.
6. Sem multiusuário, sem sincronização e sem login (fora do escopo do MVP; não simulados).
