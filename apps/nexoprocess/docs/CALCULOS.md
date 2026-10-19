# Como calculamos — fórmulas e regras

Código: `src/domain/metrics.ts`, `compare.ts`, `advanced.ts`, `recommendations.ts`. Testes: `src/domain/*.test.ts`.

## Regras gerais
- **Ausente ≠ zero.** Indicador sem dados retorna `null` + motivo (“Adicione [campo] para calcular”).
- **Arredondamento só na exibição** (`fmtNum`: ≥100 → 0 casas; ≥10 → 1; <10 → 2).
- Divisão por zero → `null` (`safeDiv`, `reductionPct`).
- Unidade da duração vale para duração, espera, mínimo e máximo da atividade.
- Conversão: min ÷ 60; dias × **horas por dia** (premissa do processo, padrão 8, editável e exibida).
- Início, fim e decisões **sem duração** contam 0 (pontos de roteamento) e não entram na cobertura de dados.

## Por atividade
| Grandeza | Fórmula | Condição |
|---|---|---|
| Tempo ativo (h) | duração → horas | duração informada |
| Esforço por ocorrência (pessoa-h) | tempo ativo × pessoas simultâneas | duração e pessoas |
| Peso por execução | frequência % ÷ 100; senão volume da atividade ÷ volume do processo; senão **1 (premissa 100%, avisada)** | — |
| Ocorrências no período | volume da atividade; senão volume do processo × peso | volume |
| Esforço no período | esforço × ocorrências | ambos |
| Custo-hora | da atividade › da função (responsável) › padrão do processo | algum informado |
| Custo de mão de obra | esforço no período × custo-hora | ambos |
| Custo variável | custo por execução × ocorrências | ambos |
| Custo comparável | mão de obra + variável; **se “custo variável inclui mão de obra”: só o variável** | — |

## Processo
- **Soma das durações registradas** = Σ tempo ativo (uma vez cada). *Não* é tempo decorrido.
- **Tempo decorrido** = caminho mais longo (tempo ativo + espera informada) das entradas às saídas, ignorando arestas de retorno (retrabalho). Com decisões = pior caso; com paralelos = ramo mais demorado. Só é calculado sem ligações inválidas, sem atividades soltas e com todas as tarefas com duração. Esperas não informadas não são somadas (avisado).
- **Esforço por execução** = Σ esforço × peso. **Por período** = Σ esforço no período.
- **Distribuição Lean** = horas de cada classe ÷ horas classificadas (base: duração; não classificadas ficam fora e são mostradas à parte).
- **Retrabalho no período** = Σ esforço no período das atividades marcadas como retrabalho **com frequência ou volume informados**.
- **Gargalo** = participação ≥ limiar (padrão 15%) no critério escolhido (duração, esforço, custo, espera ou retrabalho), no máximo 5. Mostra concentração, não causa-raiz.
- **Pareto** = valores ordenados com participação % e acumulado %, no mesmo eixo (0–100%).

## Período → mês
mês = 1; ano = 1/12; semana = 52/12; dia = **dias de operação/mês informados** (sem eles, não converte).

## AS-IS × TO-BE (mensal)
- Volume TO-BE vazio = volume do AS-IS. Volumes diferentes → TO-BE **normalizado** (esforço e custo por execução × volume do AS-IS) e sinalizado.
- **Horas potencialmente liberadas** = esforço AS-IS − esforço TO-BE (capacidade, não caixa).
- **Capacidade adicional** = horas liberadas ÷ esforço por execução do TO-BE.
- **Benefício bruto** = custo comparável AS-IS − TO-BE.
- **Benefício líquido** = bruto − custo recorrente novo (exige o recorrente informado, mesmo que 0).
- **Payback** (meses) = investimento ÷ líquido mensal, só se líquido > 0; investimento 0 → “imediato”.
- **ROI no horizonte H** = (líquido × H − investimento) ÷ investimento × 100; investimento 0 → não aplicável.
- **Redução %** = (AS-IS − TO-BE) ÷ AS-IS × 100, só se AS-IS > 0.
- **Faixa otimista/pessimista** = esforço do TO-BE com mínimos/máximos informados.
- **Confiança qualitativa**: baixa/média/alta pela cobertura de dados, premissas a validar e normalização.

**Cenário de referência (teste automatizado):** 1.000 execuções/mês, 30 → 20 min, 1 pessoa, R$ 60/h → 500 e 333,33 pessoa-h/mês; R$ 30.000 e R$ 20.000; diferença de R$ 10.000 = custo de mão de obra alocada estimado, **não** economia de caixa. Com recorrente R$ 2.000 e investimento R$ 40.000: líquido R$ 8.000/mês, payback 5 meses, ROI 12 m = 140%.

## Resultados reais
Desvio = realizado − previsão; % do ganho previsto = (base − realizado) ÷ (base − previsão). Benefício financeiro realizado só com custo medido registrado.

## Riscos, FMEA, automação
- P × I (1–5 cada): alto ≥ 15; médio 8–14; baixo < 8.
- RPN = S × O × D (1–10); prioridade alta se RPN ≥ 100 ou S ≥ 9. Sem as três notas, não calcula.
- Aptidão de automação (0–100) = média das notas (desfavoráveis invertidas: 6 − nota), reescalada; exige ≥ 4 respostas.

## Simulação
Triangular (mín., mais provável = duração, máx.), inversão da CDF, 1.500 iterações (padrão), semente 20261019. Saídas: P10/P50/P80/P90 do tempo decorrido (caminho mais longo por iteração) e faixa do trabalho ativo por execução.

## Casos conservador / base / otimista (V4)
Premissas **editáveis por cenário** (padrão: conservador = 50% de realização do ganho e 130% do investimento; otimista = 110% e 90%; base = 100% e 100%). Implementação: `businessCases()` em `src/domain/compare.ts`.
- Horas liberadas do caso = horas liberadas (base) × realização%.
- Benefício bruto do caso = benefício bruto (base) × realização%.
- Benefício líquido do caso = bruto do caso − custo recorrente (o recorrente não é escalado).
- Investimento do caso = investimento × investimento%.
- Payback do caso = investimento do caso ÷ líquido do caso, **somente se líquido > 0**; caso contrário, “sem payback”.
- ROI do caso = (líquido × horizonte − investimento do caso) ÷ investimento do caso × 100; investimento 0 → não aplicável.
Os três casos são **estimativas**; nenhum deles é economia realizada.

## Responsabilidades alteradas (V4)
Comparação atividade a atividade (mesmo código) entre AS-IS e TO-BE: *transferida* (responsável mudou), *definida* (não havia responsável), *deixa de existir* (atividade removida) e *nova*. Carga mensal por responsável = Σ esforço por período das atividades do responsável × fator mensal, nos dois cenários; sem volume ou pessoas, “não calculável”.

## Lean: necessário × desperdício (V4)
Atividades **necessárias (NNVA)** recebem um motivo: exigência legal/regulatória, controle interno/auditoria, segurança, restrição técnica/contratual ou outro. Com motivo legal, de controle ou de segurança, as recomendações trazem o alerta “não elimine: simplifique ou automatize preservando o requisito” e a dependência de validação pela área responsável. NNVA sem motivo aparece como informação ausente.
