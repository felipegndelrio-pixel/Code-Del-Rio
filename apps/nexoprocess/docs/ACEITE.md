# Matriz de critérios de aceite — evidências

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
