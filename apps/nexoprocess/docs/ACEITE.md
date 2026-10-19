# Matriz de critérios de aceite — evidências

## Auditoria de release (rodada 2, 2026-10-19)

### Defeitos encontrados e corrigidos (com reprodução antes e depois)
| # | Defeito | Evidência do defeito | Correção | Evidência após a correção |
|---|---|---|---|---|
| 1 | Restaurar um backup parcial (faltando campos da versão atual) deixava a página do projeto **em branco** (`TypeError` em `actions`/`bottleneck`). | Reprodução no app real: 2 erros de runtime, tela vazia. | `normalizeWorkspace()` completa campos ausentes na leitura e na restauração; sem AS-IS ou identificador, recusa com explicação e não altera dados. | `normalize.test.ts` (5 testes); E2E `regression.spec.ts` (projeto abre sem erro; backup inválido recusado com "Nenhum dado foi alterado"). |
| 2 | Qualquer erro de renderização deixava a aplicação inteira em branco (sem limite de erro). | Inspeção: nenhum `ErrorBoundary` no código. | `ErrorBoundary` na casca do app: mensagem, caminho de volta, dados preservados; reseta ao navegar. | Verificação por código e build; não há teste dedicado de erro forçado (limitação). |
| 3 | **Injeção de fórmulas no CSV**: texto iniciado por `=`, `+`, `@` ou `-` vira fórmula ao abrir no Excel. | Inspeção de `csvCell`; sem escape. | Apóstrofo antes de texto que começa com `= + - @ tab CR` (números não são afetados). | `csv-safety.test.ts` (2 testes). O XLSX não é afetado: o ExcelJS grava texto como texto. |
| 4 | Download de arquivos não funcionava dentro do artifact de prévia. | Relatado pelo usuário; o viewer bloqueia links de download. | Capacidade `downloads` quando disponível; fallback para download comum. | E2E de exportação e importação passam; prévia publicada com `downloads`. |

### Verificações sem defeito (inspecionadas)
- Valores negativos e percentuais fora de 0–100 são sinalizados na validação (`validation.ts`).
- Importação tem limite de 10 MB e 3.000 linhas (`io/parse.ts`).
- Cabeçalhos de segurança e CSP em `public/_headers` (sem chamadas externas; testado pelo E2E).

### Dependências
- `npm audit --omit=dev`: **2 vulnerabilidades moderadas**, ambas em `exceljs` → `uuid` (faixa afetada do `uuid`).
- Correção disponível apenas por troca de versão (`exceljs` 4.4.0 ainda depende de `uuid@^8`). **Risco aceito e registrado**: o app não passa `buf` para a geração de UUID, e as únicas entradas são planilhas que o próprio usuário escolhe no aparelho. Reavaliar a cada atualização do `exceljs`.

### Resultados desta rodada (executados)
| Verificação | Resultado |
|---|---|
| Lint (repositório) | 0 erros |
| Typecheck (ambos os apps) | 0 erros |
| Unitários NexoProcess | **102/102** (9 arquivos) |
| Unitários do app existente | 25/25 |
| Build NexoProcess (PWA) / app existente | OK (65 / 32 arquivos em precache) |
| E2E (todos os perfis, incluindo 1024 px novo) | **52 passaram**, 2 pulados (capturas sob demanda) |

### Limitações do harness (não do produto)
- Caminhos de arquivo com acentos (título do teste) fazem o `setInputFiles` do Chromium falhar silenciosamente neste ambiente. O teste usa título sem acento e um comentário explica o motivo.
- Um `readWorkspaces` executado antes de o app criar o banco cria o IndexedDB sem as tabelas. Só afeta testes; o app sempre abre o banco antes de ler.

### Publicação e reversão
- **Produção não publicada.** Não há ferramenta de deploy do Cloudflare Pages nem credencial neste ambiente. Pré-requisitos atendidos: build e testes aprovados nesta rodada.
- **Reversão:** a versão estável anterior à rodada 2 é o commit `b0f31b7`. Para reverter a produção, reimplantar um deployment anterior no painel do Pages (a confirmar no painel antes da primeira publicação).
- **Prévia:** o arquivo de prévia privada foi atualizado com as correções (versão 4).

---

## V4 — execução local em 2026-10-19 (Linux, Node 22, Chromium do Playwright)

| Verificação | Comando | Resultado |
|---|---|---|
| Lint (repositório inteiro) | `npm run lint` | 0 erros |
| Typecheck NexoProcess / app existente | `npm run nexo:typecheck` / `npm run typecheck` | 0 erros / 0 erros |
| Unitários NexoProcess | `npm run nexo:test` | **95/95** (7 arquivos; +assistente, +decisão) |
| Unitários do app existente (regressão) | `npm run test:unit` | 25/25 (inalterado) |
| Builds | `npm run nexo:build` / `npm run build` | OK (PWA: 66 arquivos em precache) / OK |
| E2E (todos os perfis) | `npm run nexo:e2e` | **46 passaram**, 2 pulados (capturas sob demanda): desktop 1366 = 23, 1440 = 4, 768 = 4, iPhone 390 = 5, 320 = 5, Android Pixel 7 = 5 |
| Acessibilidade (axe-core, regras WCAG 2.0/2.1/2.2 A e AA) | `a11y.spec.ts` | 0 violações em 19 telas, temas claro e escuro |
| Desempenho medido | `node apps/nexoprocess/scripts/perf.mjs` | ver tabela abaixo e `docs/desempenho-medido.json` |

### Critérios V4
| Critério | Status | Evidência |
|---|---|---|
| V3 preservada (nenhuma tela removida) | Passou | jornada V3 completa (`journey.spec.ts`) pelo formulário em `/app/novo/formulario`; tour por todas as abas |
| Identidade visual própria, tokens centralizados, sem copiar marca de terceiros | Passou | `src/styles/index.css`, `tailwind.config.js`; `docs/DECISOES_TECNICAS.md` §5 |
| Navegação por jornada com orientação por etapa | Passou | barra lateral/inferior; `data-testid="step-requirements"`; `v4.spec.ts` (visão geral) |
| Início muda conforme o estado | Passou | `journey.spec.ts` (1), helper `openDemo` cobre os dois estados |
| Desfazer | Passou | `v4.spec.ts`: valor salvo e revertido no IndexedDB |
| Assistente conversacional com “Não sei”, texto→estrutura confirmada, correção e resumo | Passou | `mobile-assistant.spec.ts` em desktop, iPhone 390, 320 e Android: rascunho retomado após recarregar; “não sei” fica ausente (não zero) |
| Continuidade sem prometer sincronização | Passou | `v4.spec.ts`: arquivo gerado em um contexto do navegador e importado em outro |
| Offline honesto | Passou | `responsive.spec.ts`: aviso “Offline — seus dados continuam disponíveis” + dados locais carregam |
| Lean distingue exigência de desperdício | Passou | `v4.spec.ts` + `decision.test.ts`: motivo regulatório gera alerta “Não elimine” |
| Recomendações com problema, evidência, impacto, intervenção, dependências, riscos e informações ausentes | Passou | `decision.test.ts`, `v4.spec.ts` |
| Casos conservador/base/otimista com premissas editáveis; payback só com benefício positivo | Passou | `decision.test.ts` (fórmulas), `v4.spec.ts` (edição → “sem payback”) |
| Responsabilidades alteradas | Passou | `decision.test.ts` (transferência, nova, removida, carga −200/+200 pessoa-h/mês), `v4.spec.ts` |
| Ação não é “concluída” sem registro | Passou | `decision.test.ts` (`completionIssue`), `v4.spec.ts` (bloqueia e depois salva com resultado e data) |
| Demonstração coerente até o plano, rotulada como fictícia | Passou | `decision.test.ts` (recomendações aceitas = mudanças ligadas; 4 ações; nenhuma concluída; sem resultados) |
| Larguras 1440/768/390/320 sem rolagem horizontal, nos dois temas | Passou | `responsive.spec.ts` em 17 telas por perfil |
| Custo zero | Passou | nenhuma API ou serviço pago; fontes e bibliotecas empacotadas; E2E falha se houver requisição externa |
| Safari real (iPhone) | **A validar** | ambiente sem WebKit; perfil iPhone executado em Chromium |
| Leitor de tela real (VoiceOver/TalkBack) | **A validar** | só verificação automatizada (axe) |
| Publicação no Cloudflare Pages | **Não realizada** | sem credencial/ferramenta de deploy de Pages no ambiente; ver `DEPLOY_CLOUDFLARE.md` |

### Desempenho medido (build de produção servido localmente)
Perfil móvel: 390×844, CPU 4× mais lenta, rede 1,6 Mbps / 150 ms, cache HTTP desativado. Páginas do projeto medidas após abrir a demonstração no mesmo navegador (service worker pode servir o app shell — equivale a uma visita de retorno). Servidor local, sem CDN: na internet os tempos podem ser maiores.

| Página | Desktop LCP · CLS | Móvel FCP · LCP · CLS | Transferido |
|---|---|---|---|
| Landing `/` | 216 ms · 0 | 1.952 · 1.952 ms · 0,015 | 305 KB |
| Meus projetos `/app` | 180 ms · 0 | 1.840 · 1.988 ms · 0,001 | 305–329 KB |
| Assistente `/app/novo` | 460 ms · 0 | 1.876 · 2.212 ms · 0 | 319 KB |
| Visão geral do projeto | 452 ms · 0 | 1.584 · 2.316 ms · 0 | 351 KB |
| Mapa BPMN | 400 ms · 0,004 | 1.632 · 1.952 ms · 0,02 | 419–433 KB |

Correção feita a partir da medição: CLS de 0,395 → 0,001 em `/app` no perfil móvel.

---

## V3 (histórico)

Execução local em 2026-10-19 (Linux, Node 22.22, Chromium do Playwright). Status: **Passou** / **Falhou** / **Não implementado** / **Parcial (a validar)**.

## Resultados das suítes
| Verificação | Comando | Resultado |
|---|---|---|
| Lint (repositório inteiro) | `npm run lint` | 0 erros |
| Typecheck NexoProcess / app existente | `npm run nexo:typecheck` / `npm run typecheck` | 0 erros / 0 erros |
| Unitários NexoProcess | `npm run nexo:test` | **76/76** (5 arquivos; inclui teste no LibreOffice real) |
| Unitários do app existente (regressão) | `npm run test:unit` | 25/25 (inalterado) |
| Build NexoProcess (PWA) / app existente | `npm run nexo:build` / `npm run build` | OK (58 arquivos em precache) / OK |
| E2E desktop + celular (Pixel 7) | `npm run nexo:e2e` | **20 passaram**, 2 pulados (capturas sob demanda) |
| E2E tablet (820×1180, toque) | `npx playwright test -c apps/nexoprocess/playwright.config.ts --project=tablet` | **4/4** |
| Acessibilidade automatizada (axe, WCAG 2.1 A/AA) | `a11y.spec.ts` | 0 violações em 11 telas, temas claro e escuro |

## MVP (seção 10)
| Critério | Status | Evidência |
|---|---|---|
| Leigo abre o exemplo e entende o fluxo | Passou | `journey.spec.ts` (1); exemplo marcado “fictício”, mapa e cenário ilustrativo |
| Criar processo por planilha e por assistente | Passou | `journey.spec.ts` (assistente), `import.spec.ts` (XLSX, CSV) |
| Importação explica erros/faltantes sem descartar | Passou | `import.spec.ts` (arquivo inválido mantém o anterior; erros por linha; confirmação) |
| Mapa interativo; clicar em etapa abre atividades | Passou | `journey.spec.ts`, `responsive.spec.ts` (desktop/tablet/celular) |
| Fórmulas transparentes e testadas | Passou | `metrics.test.ts`, `analysis.test.ts`; `docs/CALCULOS.md`; “Como calculamos” na UI |
| Soma das durações, pessoa-hora e tempo decorrido separados | Passou | testes “decisão”, “paralelo”, “linear” em `metrics.test.ts` |
| Recomendações rastreáveis a dados e regras | Passou | `analysis.test.ts` (evidência/regra/hipótese obrigatórias) |
| AS-IS × TO-BE preserva versões e premissas | Passou | E2E verifica IndexedDB: AS-IS e original intactos, mudança registrada |
| Exportações utilizáveis | Passou | `exports.spec.ts`: BPMN validado no bpmn-moddle, ZIP SVG/PNG (5 mapas), XLSX, CSV, modelo |
| Claro/escuro, responsivo, PWA | Passou | `responsive.spec.ts` (manifesto, ícones, SW, **offline com dados locais**) |
| Dados não transmitidos a terceiros | Passou | Todos os E2E falham se houver requisição fora da origem; CSP aplicada |
| Build sem erros; testes documentados | Passou | Esta matriz |

## Planilha protegida e business case (seções 12–16)
| Critério | Status | Evidência |
|---|---|---|
| Entradas editáveis; cabeçalhos/fórmulas/listas bloqueados | Passou | `io.test.ts` (ExcelJS) + `libreoffice.test.ts` (abas protegidas e células desprotegidas no LibreOffice) |
| Validação de dados e listas suspensas | Passou | `io.test.ts` (listas de tipo, unidade, Lean, sim/não; números com mensagens) |
| Estrutura do arquivo travada sem senha | Parcial | Presente no XLSX (teste); **LibreOffice não preserva**; Excel: **a validar** |
| Conversões min/h/dias | Passou | `metrics.test.ts` |
| Esforço/custo com volume conhecido (1.000 × 30→20 min × R$ 60) | Passou | 500/333,33 h; R$ 30.000/20.000 |
| Redução %, denominador zero | Passou | `reductionPct` |
| Custo incremental, payback, ROI | Passou | líquido R$ 8.000, payback 5 m, ROI 140% |
| Sem custo-hora não inventa R$ | Passou | unitário + E2E (“Informe o custo-hora…”) |
| Horas liberadas ≠ saving realizado | Passou | unitário + rótulos na UI e no relatório |
| Períodos e volumes diferentes | Passou | semana→mês; normalização de volume |
| Dupla contagem de custos | Passou | flag “custo variável inclui mão de obra” |
| AS-IS preservado ao editar TO-BE | Passou | unitário + E2E (IndexedDB) |
| Premissas e histórico de versões | Passou | E2E (premissa no relatório); histórico e cópias na aba Dados |

## Jornada V3 (seção 20)
| # | Passo | Status |
|---|---|---|
| 1 | Exemplo reconhecido como fictício | Passou |
| 2 | Criar/importar AS-IS | Passou |
| 3 | Corrigir/aceitar alertas (correção sugerida só com confirmação) | Passou |
| 4 | Mapa macro e detalhes de etapa | Passou |
| 5 | Diagnóstico com evidências | Passou |
| 6 | Aceitar uma recomendação e rejeitar outra (AS-IS inalterado) | Passou |
| 7 | TO-BE sem modificar AS-IS | Passou |
| 8 | Ajustar premissas e ver comparação recalculada | Passou |
| 9 | Relatório com informado/calculado/estimado/a validar/realizado (PDF gerado, ≥ 2 páginas) | Passou |
| 10 | Ações de implementação | Passou |
| 11 | Resultado real × estimativa (75% do ganho previsto) | Passou |
| 12 | Fechar e reabrir: persistência | Passou |
| 13 | Valores não informados não inventados | Passou |
| 14 | Proteção das células no modelo XLSX | Passou (LibreOffice/ExcelJS); Excel a validar |
| 15 | Testes automatizados executados e documentados | Passou |

## Módulos avançados
| Módulo | Status |
|---|---|
| Riscos (P×I) e FMEA simplificada | Implementado; regras testadas (unitário); UI coberta pelo tour |
| RACI (sugere só “R”; “A” nunca automático) | Implementado; testado |
| Simulação Monte Carlo (1.500 iterações) | Implementado; reprodutível; testado |
| Automação e IA (critérios, checklist, etapas) | Implementado; índice testado |
| IA generativa | **Não implementado** (por decisão; interface documentada como futura) |
| Login, multiusuário, sincronização, pagamento | **Não implementado** (fora do MVP; nada simulado) |

## Defeitos encontrados e corrigidos durante a validação
1. Perda do último registro ao navegar logo após editar (debounce) → gravação imediata e coalescida.
2. Fórmulas sem resultado em cache lidas como texto → 280 alertas falsos na reimportação.
3. Decisões contadas como “dados faltantes” e falso alerta de laço sem decisão.
4. Rótulos “Sim”/“Não” sobrepostos e arestas cruzando caixas no layout → teste de não cruzamento.
5. Página reduzida no celular por `sr-only` fora do contêiner de rolagem → teste agora compara `innerWidth`.
6. Diagrama ilegível no celular (escala de 30%) → escala mínima de 60% com pan e pinça.
7. Contrastes abaixo de AA no tema claro e texto branco na barra Lean → tokens ajustados (axe passa).
