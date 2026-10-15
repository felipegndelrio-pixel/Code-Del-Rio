# Indicadores (KPIs) — fórmulas

Implementação: `src/lib/kpi.ts` e `src/lib/cpm.ts` (testes em `src/lib/*.test.ts`).
Todos os valores são calculados a partir dos dados gravados. **Quando faltam dados,
o indicador mostra “—” e o motivo; nenhum número é estimado.**

| Indicador | Fórmula | Dados necessários |
|---|---|---|
| Avanço físico | Σ(peso × % das folhas da EAP) ÷ Σ pesos. Sem EAP: média do % das ações não canceladas (concluída = 100%). Sem ações: % manual do projeto | EAP, ações ou % manual |
| Avanço planejado (data D) | Mesma ponderação, com fração planejada de cada item = (D − início) ÷ (fim − início), limitada a 0–1; sem início: 0 antes do fim e 1 depois. Sem EAP/ações com datas: datas do projeto | Datas planejadas |
| EV (valor agregado) | BAC × avanço físico | Orçamento planejado (BAC) |
| PV (valor planejado) | BAC × avanço planejado | BAC + cronograma |
| AC (custo real) | Custo realizado informado | Custo realizado |
| SPI | EV ÷ PV (não calculado se PV = 0 ou ausente) | BAC, avanço físico, cronograma |
| CPI | EV ÷ AC (não calculado sem AC > 0) | BAC, avanço físico, custo real |
| Variação de custo | EV − AC | idem |
| Desvio de prazo (dias) | Concluído: fim real − fim planejado. Ativo: hoje − fim planejado (se vencido), senão 0 | Fim planejado |
| Projeto atrasado | Ativo **e** (fim planejado < hoje **ou** avanço planejado − físico > 10 p.p.) | — |
| Ação atrasada | Status ≠ concluída/cancelada **e** prazo < hoje | Prazo |
| Ação crítica | Aberta **e** (prioridade crítica **ou** criticidade alta) | — |
| Risco: severidade | Probabilidade (1–5) × impacto (1–5); alto ≥ 15; médio 8–14 | P e I |
| Marcos próximos | Pendentes com data prevista (ou planejada) ≤ hoje + 30 dias | — |
| Curva S | Por mês: % acumulado de ações com prazo até o fim do mês (planejado) e % concluído até o fim do mês (realizado). Denominador: ações não canceladas com prazo | Prazos e conclusões |
| Caminho crítico | CPM (passagens direta e inversa) sobre as folhas da EAP, relação término-início com defasagem; folga zero = crítico | **Todas** as folhas com início/fim e ≥ 1 dependência; sem ciclos |

Observações:
- O EVM é simplificado (EV derivado do avanço físico × BAC). Para EVM formal,
  registre custos por pacote de trabalho na EAP.
- O snapshot de métricas de cada relatório de status é calculado no servidor
  (`app.project_metrics`) no momento da emissão e é imutável.
