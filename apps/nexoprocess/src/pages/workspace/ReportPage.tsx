// Relatório executivo imprimível (PDF via "Imprimir → Salvar como PDF").
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { buildBpmn } from '../../bpmn/model';
import { Badge, BasisTag, Button, Field, Select } from '../../components/ui';
import { CONFIDENCE_LABEL, businessCases, CASE_LABEL, compareScenarios, responsibilityChanges } from '../../domain/compare';
import { relatedProblemOf } from '../../domain/plan';
import { bottlenecks, CRITERION_LABEL, dataGaps, pareto } from '../../domain/metrics';
import { GROUP_LABEL } from '../../domain/recommendations';
import { CHANGE_LABEL } from '../../domain/tobe';
import { LEAN_LABEL, PERIOD_LABEL } from '../../domain/types';
import { fmtBRL, fmtDate, fmtDateTime, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';
import { ACTION_STATUS } from './PlanTab';
import { demoBlocked } from '../../license/demo';
import { printAs, restoreTitle } from '../../state/print';
import { HBars, PairBars, RC, ReportFigure, ShareBar, StackedHBars } from '../../components/reportCharts';

// Rótulos curtos para o gráfico AS-IS × TO-BE (a tabela completa segue no detalhamento).
const PAIR_LABEL: Record<string, string> = {
  active: 'Trabalho ativo / execução',
  wait: 'Espera / execução',
  elapsed: 'Tempo decorrido',
  effortExec: 'Esforço / execução',
  effortMonth: 'Esforço / mês',
  costMonth: 'Custo / mês',
  reworkMonth: 'Retrabalho / mês',
};

const tbl = 'w-full border-collapse text-[12px]';
const c = 'border border-line/25 px-2 py-1 text-left align-top';
const h = `${c} bg-surface2 font-semibold`;

export default function ReportPage() {
  const { w, update, metrics: m, issues, recs } = useWorkspace();
  const [sid, setSid] = useState(w.activeScenarioId ?? w.scenarios[0]?.id ?? '');
  const sc = w.scenarios.find((s) => s.id === sid);
  const cmp = useMemo(() => (sc ? compareScenarios(w.asIs, sc) : null), [w.asIs, sc]);
  const bn = bottlenecks(w.asIs, m, w.bottleneck.criterion, w.bottleneck.thresholdPct);
  const gaps = dataGaps(w.asIs, m);
  const [svgs, setSvgs] = useState<{ label: string; svg: string }[] | null>(null);
  const per = PERIOD_LABEL[w.asIs.volumePeriod];
  useEffect(() => restoreTitle, []);
  // ?imprimir=1 (atalho "Baixar Relatório Executivo" do Diagnóstico): abre a impressão assim
  // que os mapas estiverem desenhados. Uma vez só; o parâmetro sai da URL para não repetir
  // ao recarregar. Se o navegador não abrir sozinho, o botão "Imprimir / salvar PDF" segue no topo.
  const [params, setParams] = useSearchParams();
  const autoPrint = useRef(params.get('imprimir') === '1');
  useEffect(() => {
    if (!autoPrint.current || svgs === null) return;
    autoPrint.current = false;
    // A URL só é limpa dentro do timer: limpá-la antes re-executa este efeito e o cleanup cancelaria a impressão.
    const t = window.setTimeout(() => {
      setParams({}, { replace: true });
      if (!demoBlocked('exportar')) printAs(`Relatório executivo - ${w.asIs.name}`);
    }, 300);
    return () => window.clearTimeout(t);
  }, [svgs, setParams, w.asIs.name]);
  useEffect(() => {
    if (!w.visited.report) update((d) => void (d.visited.report = nowIso()));
  }, [w.visited.report, update]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = buildBpmn(w.asIs);
        const { renderAllSvgs } = await import('../../bpmn/render');
        const out = await renderAllSvgs(b.xml, [{ id: '', label: 'Visão macro' }, ...b.stages.map((s) => ({ id: s.owner, label: `Etapa: ${s.stage}` }))], 'light');
        if (alive) setSvgs(out);
      } catch {
        if (alive) setSvgs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [w.asIs]);

  const decided = recs.filter((r) => ['accepted', 'investigating'].includes(w.recDecisions[r.id]?.status ?? ''));
  const rejected = recs.filter((r) => w.recDecisions[r.id]?.status === 'rejected').length;
  const errors = issues.filter((i) => i.severity === 'error').length;

  // Dados dos gráficos: as mesmas funções das abas Diagnóstico e Comparação.
  const name = (id: string) => m.graph.byId.get(id)?.name ?? id;
  const pr = pareto(w.asIs, m, w.bottleneck.criterion);
  const flaggedIds = new Set(bn.flagged.map((b) => b.id));
  const ownerEffort = m.byOwner.filter((g) => g.effortExecH > 0);
  const biz = cmp?.business ?? null;
  const cases = biz && sc ? businessCases(biz, sc.sensitivity) : [];
  const pairs = (cmp?.rows ?? [])
    .filter((r) => ['active', 'wait', 'elapsed', 'effortExec', 'effortMonth', 'costMonth', 'reworkMonth'].includes(r.key) && r.asIs !== null && r.toBe !== null && (r.asIs > 0 || r.toBe > 0))
    .map((r) => ({
      label: PAIR_LABEL[r.key] ?? r.label,
      asIs: r.asIs!,
      toBe: r.toBe!,
      fmt: (v: number) => (r.unit === 'R$/mês' ? fmtBRL(v) : r.unit === 'horas' ? fmtHours(v) : `${fmtNum(v)} ${r.unit.replace('pessoa-hora', 'pessoa-h')}`),
      change: r.reductionPct === null ? '—' : r.reductionPct > 0 ? `−${fmtPct(r.reductionPct, 1)}` : r.reductionPct < 0 ? `+${fmtPct(-r.reductionPct, 1)}` : '0%',
    }));
  const openActions = w.actions.filter((a) => a.status !== 'concluida' && a.status !== 'cancelada');
  const PRIO_ORDER = { alta: 0, media: 1, baixa: 2 } as const;
  const nextSteps = [...openActions].sort((a, b) => PRIO_ORDER[a.priority] - PRIO_ORDER[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999')).slice(0, 3);
  const pendingOwners = openActions.filter((a) => !a.owner || !a.due).length;
  // Mensagens-chave montadas só com valores calculados; o que falta não vira frase.
  const messages: string[] = [];
  if (m.effortPeriodH.value !== null) messages.push(`O processo consome ${fmtNum(m.effortPeriodH.value)} pessoa-h por ${per}${m.totalCostPeriod.value !== null ? `, com custo estimado de ${fmtBRL(m.totalCostPeriod.value)}` : ''}.`);
  if (m.lean.classifiedHours > 0 && m.lean.pct.W !== null) messages.push(`${fmtPct(m.lean.pct.W)} do tempo classificado é desperdício e ${fmtPct(m.lean.pct.NNVA)} é necessário sem agregar valor.`);
  if (bn.flagged.length) messages.push(`${bn.flagged.length === 1 ? 'Um gargalo concentra' : `${bn.flagged.length} gargalos concentram`} ${fmtPct(bn.flagged.reduce((t, b) => t + b.share, 0))} de “${CRITERION_LABEL[w.bottleneck.criterion].toLowerCase()}”; o principal é “${name(bn.flagged[0].id)}”.`);
  if (sc && biz?.netBenefitMonth != null) messages.push(`O cenário “${sc.name}” estima benefício líquido de ${fmtBRL(biz.netBenefitMonth)}/mês${biz.paybackMonths !== null ? `, payback de ${biz.paybackMonths === 0 ? 'imediato' : `${fmtNum(biz.paybackMonths, 1)} meses`}` : ''}${biz.roiPct !== null ? ` e ROI de ${fmtPct(biz.roiPct)} em ${biz.horizonMonths} meses` : ''} — estimativa a validar.`);
  if (openActions.length) messages.push(`${openActions.length} ação(ões) em aberto no plano${pendingOwners ? `; ${pendingOwners} ainda sem responsável ou prazo definidos pela equipe` : ''}.`);
  let sn = 0;
  const next = () => ++sn;

  return (
    <div className="mx-auto max-w-[900px] bg-surface px-4 py-6 text-ink print:max-w-none print:p-0" data-testid="report">
      <div className="no-print mb-4 flex flex-wrap items-end gap-3">
        <Link to={`/app/p/${w.id}/exportar`} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        {w.scenarios.length > 0 && (
          <Field label="Cenário TO-BE no relatório" className="min-w-[220px]">
            {(f) => (
              <Select {...f} value={sid} onChange={(e) => setSid(e.target.value)}>
                {w.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Button onClick={() => !demoBlocked('exportar') && printAs(`Relatório executivo - ${w.asIs.name}`)} disabled={svgs === null}>
          <Printer className="h-4 w-4" /> Imprimir / salvar PDF
        </Button>
        <p className="w-full text-xs text-muted">Dica: no diálogo de impressão escolha “Salvar como PDF”, papel A4, e ative “Gráficos de plano de fundo”.</p>
      </div>

      <header className="avoid-break border-b-2 border-brand pb-3 print:pb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Relatório executivo de processo · {BRAND.name}</p>
        <h1 className="mt-1 text-2xl font-extrabold print:text-xl">{w.asIs.name}</h1>
        <p className="mt-1 text-sm text-ink2">
          Gerado em {fmtDateTime(nowIso())} · AS-IS de {fmtDateTime(w.updatedAt)}
          {sc && ` · TO-BE “${sc.name}” (versão de ${fmtDateTime(sc.updatedAt)})`} · {BRAND.name} v{BRAND.version}
        </p>
        {w.isDemo && <p className="mt-2 rounded border border-amber/50 bg-amber/10 p-2 text-sm font-semibold">EXEMPLO FICTÍCIO — dados ilustrativos, não representam uma empresa real.</p>}
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-ink2">
          Legenda: <BasisTag basis="informado" /> dado fornecido · <BasisTag basis="calculado" /> fórmula sobre dados · <BasisTag basis="estimado" /> depende de premissas · <BasisTag basis="a_validar" /> hipótese · <BasisTag basis="realizado" /> medido após implantação
        </p>
        {errors > 0 && <p className="mt-2 text-sm font-semibold text-bad">Atenção: {errors} erro(s) de dados não corrigidos — indicadores podem estar incompletos.</p>}
      </header>

      <Section n={next()} title="Resumo executivo">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
          <Kpi label="Tempo decorrido" value={m.elapsed.status === 'ok' ? fmtHours(m.elapsed.hours) : 'não calculado'} sub="por execução" b="estimado" />
          <Kpi label={`Esforço por ${per}`} value={m.effortPeriodH.value === null ? 'não calculado' : `${fmtNum(m.effortPeriodH.value)} pessoa-h`} b="estimado" />
          <Kpi label={`Custo por ${per}`} value={m.totalCostPeriod.value === null ? 'não calculado' : fmtBRL(m.totalCostPeriod.value)} b="estimado" />
          <Kpi label="Desperdício (Lean)" value={m.lean.classifiedHours > 0 ? fmtPct(m.lean.pct.W) : 'sem classificação'} sub="do tempo classificado" b="calculado" />
          <Kpi label="Gargalos identificados" value={String(bn.flagged.length)} sub={`regra: ≥ ${w.bottleneck.thresholdPct}%`} b="calculado" />
          <Kpi label="Economia estimada" value={biz?.netBenefitMonth != null ? `${fmtBRL(biz.netBenefitMonth)}/mês` : 'não calculada'} sub={sc ? 'benefício líquido do TO-BE' : 'sem cenário TO-BE'} b="estimado" />
          <Kpi label="Payback" value={biz?.paybackMonths != null ? (biz.paybackMonths === 0 ? 'imediato' : `${fmtNum(biz.paybackMonths, 1)} meses`) : 'não calculado'} b="estimado" />
          <Kpi label={`ROI em ${biz?.horizonMonths ?? 12} meses`} value={biz?.roiPct != null ? fmtPct(biz.roiPct) : 'não calculado'} b="estimado" />
        </div>
        {messages.length > 0 && (
          <div className="avoid-break mt-3 print:mt-2">
            <h3 className="text-[13px] font-semibold">Mensagens-chave</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] print:space-y-0 print:text-[11px]">
              {messages.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        {/* Gargalos e próximos passos lado a lado, num bloco só: cabem inteiros na 1ª página. */}
        <div className="avoid-break mt-3 grid gap-3 sm:grid-cols-2 print:mt-2 print:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-semibold">Principais gargalos</h3>
            {bn.flagged.length ? (
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] print:space-y-0 print:text-[11px]">
                {bn.flagged.slice(0, 3).map((b) => (
                  <li key={b.id}>
                    {name(b.id)} — {fmtPct(b.share, 1)} <span className="text-ink2">({m.graph.byId.get(b.id)?.stage})</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-[12px] text-ink2 print:text-[11px]">{bn.reason ?? 'Nenhuma atividade acima do limiar.'}</p>
            )}
          </div>
          <div>
            <h3 className="text-[13px] font-semibold">Próximos passos</h3>
            {nextSteps.length ? (
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] print:space-y-0 print:text-[11px]">
                {nextSteps.map((a) => (
                  <li key={a.id}>
                    {a.description} <span className="text-ink2">— {a.owner ?? 'responsável pendente'} · {a.due ? fmtDate(a.due) : 'prazo pendente'}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-[12px] text-ink2 print:text-[11px]">Nenhuma ação em aberto no plano.</p>
            )}
          </div>
        </div>
      </Section>

      <Section n={next()} title="Diagnóstico em gráficos" breakBefore>
        <ReportFigure title={`Pareto — participação por atividade (${CRITERION_LABEL[w.bottleneck.criterion].toLowerCase()})`} note={`Em vermelho, gargalos pela regra (≥ ${w.bottleneck.thresholdPct}%, máx. 5). “acum.” = participação acumulada. Mostra concentração; não prova causa-raiz.`}>
          {pr.items.length ? (
            <HBars
              label="Pareto"
              rows={pr.items.slice(0, 8).map((x) => ({ label: name(x.id), value: x.share, display: fmtPct(x.share, 1), sub: `acum. ${fmtPct(x.cumulative)}`, color: flaggedIds.has(x.id) ? RC.lean.W : RC.bar }))}
            />
          ) : (
            <p className="text-[12px] text-ink2">{pr.reason}</p>
          )}
        </ReportFigure>
        <ReportFigure title="Valor × desperdício (Lean) — base: duração classificada" note={m.counts.unclassified ? `${m.counts.unclassified} atividade(s) sem classificação.` : undefined}>
          {m.lean.classifiedHours > 0 ? (
            <ShareBar
              label="Distribuição Lean"
              parts={(['VA', 'NNVA', 'W', 'U'] as const).map((k) => ({ label: LEAN_LABEL[k], value: m.lean.hours[k], color: RC.lean[k] }))}
            />
          ) : (
            <p className="text-[12px] text-ink2">Sem classificação Lean com duração informada.</p>
          )}
        </ReportFigure>
        <ReportFigure title="Tempo por etapa — horas de trabalho ativo, por classe Lean" note="Soma da duração ativa (uma ocorrência por atividade).">
          {m.byStage.some((g) => g.activeH > 0) ? (
            <StackedHBars
              label="Tempo por etapa"
              rows={m.byStage.map((g) => ({ label: g.key, values: g.lean, display: fmtHours(g.activeH) }))}
              parts={(['VA', 'NNVA', 'W', 'U'] as const).map((k) => ({ key: k, label: LEAN_LABEL[k], color: RC.lean[k] }))}
            />
          ) : (
            <p className="text-[12px] text-ink2">Sem duração informada nas atividades.</p>
          )}
        </ReportFigure>
        <ReportFigure title="Esforço por responsável — pessoa-hora por execução" note="Ponderado pela frequência de cada atividade.">
          {ownerEffort.length ? (
            <HBars label="Esforço por responsável" rows={ownerEffort.map((g) => ({ label: g.key, value: g.effortExecH, display: `${fmtNum(g.effortExecH, 2)} pessoa-h` }))} />
          ) : (
            <p className="text-[12px] text-ink2">Sem duração e pessoas informadas por responsável.</p>
          )}
        </ReportFigure>
      </Section>

      {sc && cmp && (
        <Section n={next()} title={`Impacto estimado — AS-IS × TO-BE “${sc.name}”`} breakBefore>
          <ReportFigure title="Comparação AS-IS × TO-BE por indicador" note={`Cada linha tem a própria escala. À direita, a variação do TO-BE em relação ao AS-IS.${cmp.business.volumeDiffers ? ' TO-BE normalizado para o volume do AS-IS.' : ''}`}>
            {pairs.length ? <PairBars label="AS-IS × TO-BE" rows={pairs} /> : <p className="text-[12px] text-ink2">Sem indicadores comparáveis (faltam dados nos dois cenários).</p>}
          </ReportFigure>
          {cases.some((x) => x.netBenefitMonth !== null) && (
            <ReportFigure title="Cenários do business case — benefício líquido por mês" note="Ao lado do nome, o investimento de cada cenário (o payback usa esse valor). Conservador, base e otimista variam a realização do benefício e o investimento. Estimativas, não economia realizada.">
              <HBars
                label="Cenários"
                valueW={250}
                rows={cases.map((x) => ({
                  // Investimento do cenário no rótulo: o payback de cada caso usa o próprio investimento.
                  label: x.investment === null ? CASE_LABEL[x.key] : `${CASE_LABEL[x.key]} — ${fmtBRL(x.investment)}`,
                  value: Math.max(0, x.netBenefitMonth ?? 0),
                  display: x.netBenefitMonth === null ? '—' : `${fmtBRL(x.netBenefitMonth)}/mês`,
                  sub: x.paybackMonths === null ? '· sem payback' : `· payback ${x.paybackMonths === 0 ? 'imediato' : `${fmtNum(x.paybackMonths, 1)} meses`}`,
                  color: RC.toBe,
                }))}
              />
            </ReportFigure>
          )}
        </Section>
      )}

      <Section n={next()} title="Processo e escopo" breakBefore>
        <table className={tbl}>
          <tbody>
            <Row k="Descrição" v={w.asIs.description ?? 'não informada'} />
            <Row k="Área / dono" v={`${w.asIs.area ?? '—'} / ${w.asIs.processOwner ?? '—'}`} />
            <Row k="Volume" v={w.asIs.volume !== undefined ? `${fmtNum(w.asIs.volume)} execuções/${per}` : 'não informado'} b="informado" />
            <Row k="Etapas" v={w.asIs.stageOrder.join(' → ')} />
            <Row k="Origem dos dados" v={w.source.kind === 'import' ? `Planilha ${w.source.fileName} (${fmtDate(w.source.importedAt)})` : w.source.kind === 'demo' ? 'Exemplo fictício' : 'Assistente guiado (informado pelo usuário)'} />
            <Row k="Premissa de conversão" v={`1 dia = ${w.asIs.hoursPerDay} h de trabalho`} b="informado" />
          </tbody>
        </table>
      </Section>

      <Section n={next()} title="Indicadores do processo atual (AS-IS)">
        <table className={tbl}>
          <thead>
            <tr>
              <th className={h}>Indicador</th>
              <th className={h}>Valor e base</th>
            </tr>
          </thead>
          <tbody>
            <Row k="Atividades (tarefas · decisões)" v={`${m.counts.tasks} · ${m.counts.decisions}`} b="informado" />
            <Row k="Soma das durações registradas" v={m.activeSumH.value === null ? 'não calculado (sem durações)' : `${fmtHours(m.activeSumH.value)} (${m.activeSumH.coverage.used}/${m.activeSumH.coverage.total} com duração)`} b="calculado" />
            <Row k="Tempo decorrido estimado" v={m.elapsed.status === 'ok' ? `${fmtHours(m.elapsed.hours)} — ${m.elapsed.basis === 'sequencia_unica' ? 'sequência única' : 'caminho mais longo, sem retrabalho'}` : `não calculado: ${m.elapsed.reasons.join(' ')}`} b="estimado" />
            <Row k="Esforço por execução" v={m.effortExecH.value === null ? 'não calculado (faltam pessoas/duração)' : `${fmtNum(m.effortExecH.value)} pessoa-h`} b="calculado" />
            <Row k={`Esforço por ${per}`} v={m.effortPeriodH.value === null ? `não calculado: ${m.effortPeriodH.reason}` : `${fmtNum(m.effortPeriodH.value)} pessoa-h`} b="estimado" />
            <Row k={`Custo estimado por ${per}`} v={m.totalCostPeriod.value === null ? `não calculado: ${m.totalCostPeriod.reason}` : fmtBRL(m.totalCostPeriod.value)} b="estimado" />
            <Row k="Distribuição Lean (base: duração classificada)" v={m.lean.classifiedHours ? `${LEAN_LABEL.VA} ${fmtPct(m.lean.pct.VA)} · ${LEAN_LABEL.NNVA} ${fmtPct(m.lean.pct.NNVA)} · ${LEAN_LABEL.W} ${fmtPct(m.lean.pct.W)} · ${m.counts.unclassified} não classificada(s)` : 'sem classificação'} b="calculado" />
            <Row k={`Retrabalho por ${per}`} v={m.rework.effortPeriodH === null ? `${m.counts.rework} atividade(s) marcadas; esforço não calculado` : `${fmtNum(m.rework.effortPeriodH)} pessoa-h`} b="estimado" />
          </tbody>
        </table>
        {m.assumptions.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[12px] text-ink2">
            {m.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section n={next()} title="Mapa do processo" breakBefore>
        {svgs === null ? (
          <p className="text-sm text-muted">Desenhando mapas…</p>
        ) : svgs.length === 0 ? (
          <p className="text-sm text-bad">Não foi possível desenhar os mapas neste navegador.</p>
        ) : (
          svgs.map((s, i) => (
            <figure key={i} className="avoid-break mb-4">
              <figcaption className="mb-1 text-sm font-semibold">{s.label}</figcaption>
              {/* Único dangerouslySetInnerHTML do app, mantido de propósito (Fase 2, decisão B).
                  O HTML não vem do usuário: é o DOM do bpmn-js serializado por saveSVG(). Os nomes
                  digitados entram como texto de <tspan> e saem escapados (&lt;script&gt;…), sem
                  <script>, <foreignObject> nem atributos on* — coberto por tests/e2e/security.spec.ts.
                  Inline (e não <img>) para os textos do diagrama seguirem acessíveis a leitores de
                  tela: o relatório não os repete em tabela. Exige style-src 'unsafe-inline' (o SVG
                  usa atributos style=). Ver docs/security-headers.md. */}
              <div className="overflow-hidden rounded border border-line/20 bg-white p-2 [&>svg]:h-auto [&>svg]:max-h-[420px] [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: s.svg.replace(/<\?xml[^>]*>/, '').replace(/<!DOCTYPE[^>]*>/, '') }} />
            </figure>
          ))
        )}
      </Section>

      <Section n={next()} title="Diagnóstico: gargalos e dados" breakBefore>
        <p className="text-[12px] text-ink2">
          Regra de gargalo: participação ≥ {w.bottleneck.thresholdPct}% em “{CRITERION_LABEL[w.bottleneck.criterion]}” (máx. 5). Indica concentração; não prova causa-raiz.
        </p>
        {bn.flagged.length ? (
          <table className={`${tbl} mt-2`}>
            <thead>
              <tr>
                <th className={h}>#</th>
                <th className={h}>Atividade</th>
                <th className={h}>Etapa</th>
                <th className={h}>Participação</th>
              </tr>
            </thead>
            <tbody>
              {bn.flagged.map((b, i) => (
                <tr key={b.id}>
                  <td className={c}>{i + 1}</td>
                  <td className={c}>{m.graph.byId.get(b.id)!.name}</td>
                  <td className={c}>{m.graph.byId.get(b.id)!.stage}</td>
                  <td className={c}>{fmtPct(b.share, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm">{bn.reason ?? 'Nenhuma atividade acima do limiar.'}</p>
        )}
        {gaps.length > 0 && (
          <p className="mt-2 text-[12px] text-ink2">
            Dados faltantes: {gaps.map((g) => `${g.label} (${g.missing}/${g.total})`).join('; ')}.
          </p>
        )}
      </Section>

      <Section n={next()} title="Recomendações avaliadas">
        <p className="text-[12px] text-ink2">Análise automática baseada em dados e regras (sem IA generativa). {rejected} recomendação(ões) rejeitada(s) não constam abaixo.</p>
        {decided.length ? (
          <table className={`${tbl} mt-2`}>
            <thead>
              <tr>
                <th className={h}>Recomendação</th>
                <th className={h}>Grupo</th>
                <th className={h}>Evidência</th>
                <th className={h}>Hipótese (a validar)</th>
                <th className={h}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((r) => (
                <tr key={r.id}>
                  <td className={c}>{r.title}</td>
                  <td className={c}>{GROUP_LABEL[r.group]}</td>
                  <td className={c}>{r.evidence.map((e) => `${e.kind === 'fato' ? 'Fato' : 'Inferência'}: ${e.text}`).join(' ')}</td>
                  <td className={c}>{r.hypothesis}</td>
                  <td className={c}>{w.recDecisions[r.id]?.status === 'accepted' ? 'Aceita' : 'Investigando'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm">Nenhuma recomendação aceita ou em investigação.</p>
        )}
      </Section>

      {sc && cmp && (
        <>
          <Section n={next()} title={`Mudanças propostas — TO-BE “${sc.name}”`} breakBefore>
            {sc.changes.length ? (
              <table className={tbl}>
                <thead>
                  <tr>
                    <th className={h}>Mudança</th>
                    <th className={h}>Justificativa</th>
                    <th className={h}>Hipótese</th>
                  </tr>
                </thead>
                <tbody>
                  {sc.changes.map((ch) => (
                    <tr key={ch.id}>
                      <td className={c}>
                        <strong>{CHANGE_LABEL[ch.kind]}</strong> — {ch.summary}
                      </td>
                      <td className={c}>{ch.justification ?? '—'}</td>
                      <td className={c}>{ch.hypothesis ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm">Nenhuma mudança registrada.</p>
            )}
          </Section>
          <Section n={next()} title="Comparação AS-IS × TO-BE">
            <table className={tbl}>
              <thead>
                <tr>
                  <th className={h}>Indicador</th>
                  <th className={h}>Unidade</th>
                  <th className={h}>AS-IS</th>
                  <th className={h}>TO-BE</th>
                  <th className={h}>Redução</th>
                  <th className={h}>Base</th>
                </tr>
              </thead>
              <tbody>
                {cmp.rows.map((r) => (
                  <tr key={r.key}>
                    <td className={c}>{r.label}</td>
                    <td className={c}>{r.unit}</td>
                    <td className={c}>{r.unit === 'R$/mês' ? fmtBRL(r.asIs) : r.unit === 'horas' ? fmtHours(r.asIs) : fmtNum(r.asIs)}</td>
                    <td className={c}>{r.unit === 'R$/mês' ? fmtBRL(r.toBe) : r.unit === 'horas' ? fmtHours(r.toBe) : fmtNum(r.toBe)}</td>
                    <td className={c}>{r.lowerIsBetter ? fmtPct(r.reductionPct, 1) : '—'}</td>
                    <td className={c}>{r.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cmp.business.volumeDiffers && <p className="mt-1 text-[12px] text-ink2">Volumes diferentes: TO-BE normalizado para o volume do AS-IS.</p>}
          </Section>
          <Section n={next()} title="Business case (estimado)">
            <table className={tbl}>
              <tbody>
                <Row k="Horas potencialmente liberadas" v={cmp.business.freedHoursMonth === null ? `não calculado: ${cmp.business.reasons.freed}` : `${fmtNum(cmp.business.freedHoursMonth)} pessoa-h/mês (capacidade, não caixa)`} b="estimado" />
                <Row k="Benefício financeiro bruto" v={cmp.business.grossBenefitMonth === null ? `não calculado: ${cmp.business.reasons.gross}` : `${fmtBRL(cmp.business.grossBenefitMonth)}/mês`} b="estimado" />
                <Row k="Custo recorrente novo" v={cmp.business.recurringCostPerMonth === null ? 'não informado' : `${fmtBRL(cmp.business.recurringCostPerMonth)}/mês`} b="informado" />
                <Row k="Benefício líquido" v={cmp.business.netBenefitMonth === null ? `não calculado: ${cmp.business.reasons.net}` : `${fmtBRL(cmp.business.netBenefitMonth)}/mês`} b="estimado" />
                <Row k="Investimento inicial" v={cmp.business.investment === null ? 'não informado' : fmtBRL(cmp.business.investment)} b="informado" />
                <Row k="Payback" v={cmp.business.paybackMonths === null ? `não calculado: ${cmp.business.reasons.payback}` : cmp.business.paybackMonths === 0 ? 'imediato' : `${fmtNum(cmp.business.paybackMonths, 1)} meses`} b="estimado" />
                <Row k={`ROI em ${cmp.business.horizonMonths} meses`} v={cmp.business.roiPct === null ? `não calculado: ${cmp.business.reasons.roi}` : fmtPct(cmp.business.roiPct)} b="estimado" />
                <Row k="Confiança qualitativa" v={`${CONFIDENCE_LABEL[cmp.business.confidence.level]} — ${cmp.business.confidence.reasons.join(' ')}`} />
                {sc.approvedTarget && <Row k="Meta aprovada" v={`${sc.approvedTarget.description}${sc.approvedTarget.value !== undefined ? `: ${fmtNum(sc.approvedTarget.value)} ${sc.approvedTarget.unit ?? ''}` : ''} (por ${sc.approvedTarget.approvedBy ?? '—'}, ${fmtDate(sc.approvedTarget.approvedAt)})`} />}
              </tbody>
            </table>
            {/* Bloco indivisível: a tabela de 3 cenários e as fórmulas ficam na mesma página. */}
            <div className="avoid-break">
            <table className={`${tbl} mt-2`}>
              <thead>
                <tr>
                  <th className={h}>Caso</th>
                  <th className={h}>Premissas</th>
                  <th className={h}>Benefício líquido</th>
                  <th className={h}>Payback</th>
                </tr>
              </thead>
              <tbody>
                {businessCases(cmp.business, sc.sensitivity).map((x) => (
                  <tr key={x.key}>
                    <td className={c}>{CASE_LABEL[x.key]}</td>
                    <td className={c}>
                      realização {fmtNum(x.realizationPct)}% · investimento {fmtNum(x.investmentPct)}%{x.investment !== null && ` (${fmtBRL(x.investment)})`}
                    </td>
                    <td className={c}>{x.netBenefitMonth === null ? '—' : `${fmtBRL(x.netBenefitMonth)}/mês`}</td>
                    <td className={c}>{x.paybackMonths === null ? 'sem payback' : x.paybackMonths === 0 ? 'imediato' : `${fmtNum(x.paybackMonths, 1)} meses`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[12px] text-ink2">Fórmulas: benefício bruto = custo comparável AS-IS − TO-BE; líquido = bruto − custo recorrente; payback = investimento do cenário ÷ líquido mensal; ROI = (líquido × horizonte − investimento) ÷ investimento.</p>
            </div>
          </Section>
          <Section n={next()} title="Premissas, riscos e pontos a validar">
            <ul className="list-disc pl-5 text-[12px]">
              {sc.assumptions.map((a) => (
                <li key={a.id}>
                  {a.text} — <em>{a.status === 'a_validar' ? 'a validar' : a.status}</em>
                </li>
              ))}
              {responsibilityChanges(w.asIs, sc.process).map((r) => (
                <li key={r.activityId + r.kind}>
                  Responsabilidade ({r.kind}): {r.activity}
                  {r.from || r.to ? ` — ${r.from ?? '—'} → ${r.to ?? '—'}` : ''}
                </li>
              ))}
              {sc.dependencies && <li>Dependências: {sc.dependencies}</li>}
              {sc.risks && <li>Riscos do cenário: {sc.risks}</li>}
              {w.risks.map((r) => (
                <li key={r.id}>
                  Risco: {r.description} ({r.status}){r.control ? ` — controle: ${r.control}` : ''}
                </li>
              ))}
              {!sc.assumptions.length && !sc.dependencies && !sc.risks && !w.risks.length && <li>Nenhuma premissa ou risco registrado.</li>}
            </ul>
          </Section>
        </>
      )}

      {/* Sempre em página nova: o Safari ignora "não quebrar linha de tabela" e cortava uma ação ao meio. */}
      <Section n={next()} title="Plano de ação" breakBefore>
        {w.actions.length ? (
          <table className={tbl}>
            <thead>
              <tr>
                <th className={h}>Ação</th>
                <th className={h}>Responsável</th>
                <th className={h}>Prazo</th>
                <th className={h}>Situação</th>
                <th className={h}>Indicador de sucesso</th>
              </tr>
            </thead>
            <tbody>
              {w.actions.map((a) => (
                <tr key={a.id}>
                  <td className={c}>
                    {a.description}
                    {relatedProblemOf(a, w) && <span className="block text-[12px] text-ink2">Problema: {relatedProblemOf(a, w)}</span>}
                    {a.status === 'concluida' && a.observedResult && <span className="block text-[12px]">Resultado observado: {a.observedResult}</span>}
                  </td>
                  <td className={c}>{a.owner ?? 'pendente'}</td>
                  <td className={c}>{a.due ? fmtDate(a.due) : 'pendente'}</td>
                  <td className={c}>{ACTION_STATUS[a.status]}</td>
                  <td className={c}>{a.successIndicator ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">Nenhuma ação registrada.</p>
        )}
      </Section>

      <Section n={next()} title="Resultados realizados">
        {w.results.filter((r) => !r.noData).length ? (
          <table className={tbl}>
            <thead>
              <tr>
                <th className={h}>Período</th>
                <th className={h}>Indicador</th>
                <th className={h}>Valor medido</th>
                <th className={h}>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {w.results
                .filter((r) => !r.noData)
                .map((r) => (
                  <tr key={r.id}>
                    <td className={c}>{r.period}</td>
                    <td className={c}>{r.label ?? r.metric}</td>
                    <td className={c}>
                      {fmtNum(r.value)} {r.unit} <Badge tone="ok">Realizado</Badge>
                    </td>
                    <td className={c}>{r.source ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm">Ainda não há resultados medidos. Benefícios acima são estimativas.</p>
        )}
      </Section>

      <footer className="mt-6 border-t border-line/25 pt-2 text-xs text-muted">
        Metodologia: cálculos determinísticos documentados no app (“Como calculamos”). Valores ausentes não são substituídos por zero. Diagramas BPMN gerados automaticamente e renderizados com bpmn-js (bpmn.io). {BRAND.name} não é afiliado ao PMI®.
      </footer>
    </div>
  );
}

function Section({ n, title, children, breakBefore }: { n: number; title: string; children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={`mt-6 print:mt-4 ${breakBefore ? 'print-break' : ''}`}>
      <h2 className="mb-2 text-lg font-bold">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, b }: { label: string; value: string; sub?: string; b?: 'informado' | 'calculado' | 'estimado' }) {
  return (
    // Compacto (selo na linha do rótulo, valor sem quebra): no Safari a 1ª página tem menos
    // altura útil (cabeçalho/rodapé do navegador) e o resumo precisa caber nela.
    <div className="avoid-break rounded-lg border border-line/25 p-2">
      <p className="flex items-start justify-between gap-1 text-[11px] font-medium leading-tight text-ink2">
        <span>{label}</span>
        {b && <BasisTag basis={b} />}
      </p>
      <p className="mt-1 whitespace-nowrap text-[15px] font-bold leading-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-tight text-ink2">{sub}</p>}
    </div>
  );
}

function Row({ k, v, b }: { k: string; v: React.ReactNode; b?: 'informado' | 'calculado' | 'estimado' }) {
  return (
    <tr>
      <th className={`${c} w-1/3 bg-surface2 font-semibold`}>{k}</th>
      <td className={c}>
        {v} {b && <BasisTag basis={b} />}
      </td>
    </tr>
  );
}
