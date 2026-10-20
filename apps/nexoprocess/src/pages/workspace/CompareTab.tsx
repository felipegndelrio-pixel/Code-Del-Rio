// "Impacto da melhoria": AS-IS × TO-BE lado a lado e business case.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CompareBars } from '../../components/charts';
import { Badge, BasisTag, Button, Callout, Card, Empty, Field, HowCalc, Input, NumberInput, Select, Stat, Table, td, Term, th } from '../../components/ui';
import { businessCases, CASE_LABEL, compareScenarios, DEFAULT_SENSITIVITY, responsibilityChanges, roleLoads, type CompareRow } from '../../domain/compare';
import type { Scenario, SensitivityCase } from '../../domain/types';
import { fmtBRL, fmtDateTime, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

function fmtVal(r: Pick<CompareRow, 'unit'>, v: number | null) {
  if (v === null) return '—';
  if (r.unit === 'R$/mês') return fmtBRL(v);
  if (r.unit === 'horas') return fmtHours(v);
  return fmtNum(v);
}

export default function CompareTab() {
  const { w, update } = useWorkspace();
  const [sid, setSid] = useState(w.activeScenarioId ?? w.scenarios[0]?.id);
  const sc = w.scenarios.find((s) => s.id === sid) ?? w.scenarios[0];
  const cmp = useMemo(() => (sc ? compareScenarios(w.asIs, sc) : null), [w.asIs, sc]);
  const all = useMemo(() => w.scenarios.map((s) => ({ s, c: compareScenarios(w.asIs, s) })), [w.asIs, w.scenarios]);
  const [target, setTarget] = useState({ description: '', value: undefined as number | undefined, unit: 'pessoa-h/mês', approvedBy: '' });
  useEffect(() => {
    if (sc && !w.visited.compare) update((d) => void (d.visited.compare = nowIso()));
  }, [sc, w.visited.compare, update]);

  if (!sc || !cmp)
    return (
      <Empty title="Para comparar, vamos criar o cenário futuro (TO-BE) primeiro" action={<Link to={`/app/p/${w.id}/tobe`} className="font-semibold text-brand underline">Ir para TO-BE</Link>}>
        A comparação mostra o que muda em tempo, esforço, custo e capacidade entre o processo atual e o futuro.
      </Empty>
    );
  const b = cmp.business;
  const rowsHours = cmp.rows.filter((r) => ['active', 'wait', 'elapsed'].includes(r.key));

  return (
    <div className="space-y-4">
      <Card title="Impacto da melhoria" subtitle="AS-IS × TO-BE">
        <div className="flex flex-wrap items-end gap-3">
          {w.scenarios.length > 1 && (
            <Field label="Cenário TO-BE" className="min-w-[220px]">
              {(f) => (
                <Select {...f} value={sc.id} onChange={(e) => setSid(e.target.value)}>
                  {w.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <p className="text-sm text-ink2">
            <strong className="text-ink">{sc.name}</strong> · versão de {fmtDateTime(sc.updatedAt)} · {sc.changes.length} mudança(s) · confiança qualitativa:{' '}
            <Badge tone={b.confidence.level === 'alta' ? 'ok' : b.confidence.level === 'média' ? 'amber' : 'bad'}>{b.confidence.level}</Badge>
          </p>
        </div>
        <ul className="mt-2 list-disc pl-5 text-xs text-muted">
          {b.confidence.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {b.volumeDiffers && (
          <div className="mt-3">
            <Callout tone="warn" title="Volumes diferentes entre os cenários">
              Para comparar bases iguais, esforço e custo do TO-BE foram recalculados no volume do AS-IS (normalização). Os valores no volume próprio do TO-BE aparecem na tabela por execução.
            </Callout>
          </div>
        )}
        <div className="mt-4">
          <Table caption="Comparação AS-IS × TO-BE">
            <thead>
              <tr>
                {['Indicador', 'Unidade', 'AS-IS (hoje)', 'TO-BE', 'Diferença', 'Redução', 'Base'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cmp.rows.map((r) => {
                const better = r.diff !== null && r.diff !== 0 && (r.lowerIsBetter ? r.diff < 0 : r.diff > 0);
                const worse = r.diff !== null && r.diff !== 0 && !better;
                return (
                  <tr key={r.key}>
                    <td className={clsx(td, 'text-ink')}>
                      {r.label}
                      {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                    </td>
                    <td className={td}>{r.unit}</td>
                    <td className={clsx(td, 'tabular')}>{fmtVal(r, r.asIs)}</td>
                    <td className={clsx(td, 'tabular')}>{fmtVal(r, r.toBe)}</td>
                    <td className={clsx(td, 'tabular', better && 'text-ok', worse && r.lowerIsBetter && 'text-bad')}>{r.diff === null ? '—' : `${r.diff > 0 ? '+' : ''}${fmtVal(r, r.diff)}`}</td>
                    <td className={clsx(td, 'tabular')}>{r.lowerIsBetter ? fmtPct(r.reductionPct, 1) : '—'}</td>
                    <td className={td}>
                      <BasisTag basis={r.basis} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">“—” = não calculável com os dados atuais (nunca substituímos por zero). Valores do TO-BE são estimativas condicionadas às premissas do cenário.</p>
        </div>
      </Card>

      <Card title="Business case" subtitle="Estimativas — não são economia realizada">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={<>Horas potencialmente liberadas <Term k="capacity" iconOnly /></>} value={`${fmtNum(b.freedHoursMonth)} pessoa-h/mês`} sub={b.freedHoursMonth !== null ? `${fmtNum(b.freedHoursMonth * 12)} pessoa-h/ano · capacidade, não caixa` : undefined} basis="estimado" missing={b.freedHoursMonth === null ? b.reasons.freed : undefined} />
          <Stat label="Capacidade adicional possível" value={`${fmtNum(b.capacityExtraExecMonth)} execuções/mês`} sub="se as horas liberadas forem usadas no próprio processo" basis="estimado" missing={b.capacityExtraExecMonth === null ? 'Requer horas liberadas positivas e esforço por execução no TO-BE.' : undefined} />
          <Stat label="Benefício financeiro bruto" value={`${fmtBRL(b.grossBenefitMonth)}/mês`} sub={b.grossBenefitMonth !== null ? `${fmtBRL(b.grossBenefitMonth * 12)}/ano · custo comparável AS-IS − TO-BE` : undefined} basis="estimado" missing={b.grossBenefitMonth === null ? b.reasons.gross : undefined} />
          <Stat label="Benefício líquido" value={`${fmtBRL(b.netBenefitMonth)}/mês`} sub={b.netBenefitMonth !== null ? `bruto − custo recorrente (${fmtBRL(b.recurringCostPerMonth)}/mês)` : undefined} basis="estimado" missing={b.netBenefitMonth === null ? b.reasons.net : undefined} tone={b.netBenefitMonth !== null && b.netBenefitMonth < 0 ? 'bad' : undefined} />
          <Stat label="Investimento inicial" value={fmtBRL(b.investment)} basis="informado" missing={b.investment === null ? 'Informe no TO-BE (pode ser 0).' : undefined} />
          <Stat label={<>Payback <Term k="payback" iconOnly /></>} value={b.paybackMonths === 0 ? 'imediato' : `${fmtNum(b.paybackMonths, 1)} meses`} basis="estimado" missing={b.paybackMonths === null ? b.reasons.payback : undefined} />
          <Stat label={<>ROI em {b.horizonMonths} meses <Term k="roi" iconOnly /></>} value={fmtPct(b.roiPct)} basis="estimado" missing={b.roiPct === null ? b.reasons.roi : undefined} />
          <Stat
            label="Faixa de esforço TO-BE"
            value={b.range ? `${fmtNum(b.range.optimisticEffortMonthH)}–${fmtNum(b.range.pessimisticEffortMonthH)}` : ''}
            sub="pessoa-h/mês, com mínimos e máximos informados"
            basis="estimado"
            missing={!b.range || b.range.optimisticEffortMonthH === null ? 'Informe duração mínima e máxima no TO-BE para ver a faixa otimista–pessimista.' : undefined}
          />
        </div>
        <Callout tone="info" title="Leitura correta">
          Horas liberadas são capacidade. Elas só viram economia de caixa se a capacidade for realocada ou o custo for efetivamente reduzido — registre isso depois em Resultados.
        </Callout>
        <HowCalc>
          <p>Esforço por mês = Σ (duração em horas × pessoas × frequência) × volume mensal. Custo = esforço × custo-hora + custo variável × execuções (sem dupla contagem quando o custo variável já inclui mão de obra).</p>
          <p>Horas liberadas = esforço AS-IS − esforço TO-BE (mesmo volume). Benefício bruto = custo comparável AS-IS − custo TO-BE. Benefício líquido = bruto − custo recorrente novo.</p>
          <p>Payback = investimento ÷ benefício líquido mensal (só se positivo). ROI = (benefício líquido mensal × horizonte − investimento) ÷ investimento × 100, horizonte de {b.horizonMonths} meses.</p>
          <p>Redução % = (AS-IS − TO-BE) ÷ AS-IS × 100, somente quando AS-IS &gt; 0. Fonte de todos os dados: informados por você neste processo.</p>
        </HowCalc>
      </Card>

      <CasesCard sc={sc} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tempo por execução" subtitle="Horas">
          <CompareBars title="AS-IS × TO-BE (horas por execução)" data={rowsHours.map((r) => ({ key: r.label.replace(' por execução', '').replace(' (caminho mais longo)', ''), asIs: r.asIs, toBe: r.toBe }))} unit="h" />
        </Card>
        <Card title="Esforço mensal" subtitle="Pessoa-hora/mês">
          {cmp.rows.find((r) => r.key === 'effortMonth')!.asIs !== null ? (
            <CompareBars title="AS-IS × TO-BE (pessoa-hora/mês)" data={cmp.rows.filter((r) => ['effortMonth', 'reworkMonth'].includes(r.key)).map((r) => ({ key: r.label.replace(' por mês', ''), asIs: r.asIs, toBe: r.toBe }))} unit="pessoa-h/mês" />
          ) : (
            <Callout tone="info">Informe o volume de execuções para comparar esforço por mês.</Callout>
          )}
        </Card>
      </div>

      <Card title="O que muda no fluxo" subtitle={`${cmp.changedActivities.length} atividade(s)`}>
        {cmp.changedActivities.length ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {cmp.changedActivities.map((c) => (
              <li key={c.id}>
                <Badge tone={c.kind === 'removida' ? 'bad' : c.kind === 'nova' ? 'violet' : 'brand'}>{c.kind}</Badge> <span className="text-ink2">{c.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">O TO-BE ainda é idêntico ao AS-IS.</p>
        )}
        {(sc.dependencies || sc.risks || sc.assumptions.length > 0) && (
          <div className="mt-3 grid gap-2 text-sm text-ink2 md:grid-cols-3">
            {sc.assumptions.length > 0 && (
              <div>
                <p className="font-semibold text-ink">Premissas</p>
                <ul className="list-disc pl-4">
                  {sc.assumptions.map((a) => (
                    <li key={a.id}>
                      {a.text} <Badge tone={a.status === 'validada' ? 'ok' : a.status === 'rejeitada' ? 'muted' : 'amber'}>{a.status === 'a_validar' ? 'a validar' : a.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sc.dependencies && (
              <p>
                <strong className="text-ink">Dependências:</strong> {sc.dependencies}
              </p>
            )}
            {sc.risks && (
              <p>
                <strong className="text-ink">Riscos:</strong> {sc.risks}
              </p>
            )}
          </div>
        )}
      </Card>

      <ResponsibilitiesCard sc={sc} />

      <Card title="Meta aprovada" subtitle="Potencial → aprovado → realizado">
        {sc.approvedTarget ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="ok">Aprovada</Badge>
            <span className="text-ink">
              {sc.approvedTarget.description}
              {sc.approvedTarget.value !== undefined && `: ${fmtNum(sc.approvedTarget.value)} ${sc.approvedTarget.unit ?? ''}`}
            </span>
            <span className="text-muted">
              por {sc.approvedTarget.approvedBy || 'não informado'} em {fmtDateTime(sc.approvedTarget.approvedAt)}
            </span>
            <Button size="sm" variant="ghost" onClick={() => update((d) => void (d.scenarios.find((s) => s.id === sc.id)!.approvedTarget = undefined), { area: 'Benefícios', message: 'Meta aprovada removida' })}>
              Remover
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto] md:items-end">
            <Field label="Meta (descrição)">{(f) => <Input {...f} value={target.description} placeholder="Ex.: reduzir esforço mensal do processo" onChange={(e) => setTarget({ ...target, description: e.target.value })} />}</Field>
            <Field label="Valor">{(f) => <NumberInput {...f} value={target.value} onChange={(v) => setTarget({ ...target, value: v })} />}</Field>
            <Field label="Unidade">{(f) => <Input {...f} value={target.unit} onChange={(e) => setTarget({ ...target, unit: e.target.value })} />}</Field>
            <Field label="Aprovado por">{(f) => <Input {...f} value={target.approvedBy} onChange={(e) => setTarget({ ...target, approvedBy: e.target.value })} />}</Field>
            <Button
              disabled={!target.description.trim()}
              onClick={() =>
                update(
                  (d) => {
                    d.scenarios.find((s) => s.id === sc.id)!.approvedTarget = { description: target.description.trim(), value: target.value, unit: target.unit, approvedBy: target.approvedBy.trim() || undefined, approvedAt: nowIso() };
                  },
                  { area: 'Benefícios', message: `Meta aprovada: ${target.description}` },
                )
              }
            >
              Registrar meta
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">A meta aprovada é uma decisão de gestão, separada do potencial calculado e do resultado realizado.</p>
      </Card>

      {all.length > 1 && (
        <Card title="Cenários lado a lado" subtitle="Alternativas TO-BE">
          <Table caption="Comparação entre cenários">
            <thead>
              <tr>
                {['Cenário', 'Esforço/mês', 'Horas liberadas/mês', 'Benefício líquido/mês', 'Payback'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {all.map(({ s, c }) => (
                <tr key={s.id}>
                  <td className={clsx(td, 'text-ink')}>{s.name}</td>
                  <td className={clsx(td, 'tabular')}>{fmtNum(c.rows.find((r) => r.key === 'effortMonth')!.toBe)}</td>
                  <td className={clsx(td, 'tabular')}>{fmtNum(c.business.freedHoursMonth)}</td>
                  <td className={clsx(td, 'tabular')}>{fmtBRL(c.business.netBenefitMonth)}</td>
                  <td className={clsx(td, 'tabular')}>{c.business.paybackMonths === null ? '—' : `${fmtNum(c.business.paybackMonths, 1)} meses`}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}


/** Conservador / base / otimista a partir de premissas editáveis do cenário. */
function CasesCard({ sc }: { sc: Scenario }) {
  const { w, update } = useWorkspace();
  const cmp = useMemo(() => compareScenarios(w.asIs, sc), [w.asIs, sc]);
  const sens = sc.sensitivity ?? DEFAULT_SENSITIVITY;
  const cases = businessCases(cmp.business, sens);
  const setCase = (k: 'conservative' | 'optimistic', patch: Partial<SensitivityCase>) =>
    update(
      (d) => {
        const x = d.scenarios.find((y) => y.id === sc.id)!;
        const cur = x.sensitivity ?? structuredClone(DEFAULT_SENSITIVITY);
        cur[k] = { ...cur[k], ...patch };
        x.sensitivity = cur;
      },
      { area: 'Comparação', message: `Premissa do caso ${CASE_LABEL[k].toLowerCase()} alterada` },
    );
  const money = (v: number | null) => (v === null ? '—' : `${fmtBRL(v)}/mês`);
  return (
    <Card title="Cenários de resultado" subtitle={`Conservador · base · otimista — ${sc.name}`}>
      <p className="mb-3 max-w-3xl text-sm text-ink2">
        O caso base usa as estimativas do TO-BE como estão. Os outros aplicam premissas editáveis sobre quanto do ganho se realiza e quanto do investimento se gasta. Todos são estimativas.
      </p>
      <div className="grid gap-3 md:grid-cols-3" data-testid="business-cases">
        {cases.map((c) => (
          <section key={c.key} aria-label={`Caso ${CASE_LABEL[c.key]}`} className={clsx('rounded-lg border p-3', c.key === 'base' ? 'border-brand/40 bg-brand/[0.03]' : 'border-line/15')}>
            <h4 className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
              {CASE_LABEL[c.key]} <BasisTag basis="estimado" />
            </h4>
            {c.key === 'base' ? (
              <p className="mt-2 text-xs text-muted">Realização 100% · investimento 100%</p>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Realização do ganho (%)">{(f) => <NumberInput {...f} value={c.realizationPct} onChange={(v) => v !== undefined && v >= 0 && setCase(c.key as 'conservative', { realizationPct: v })} />}</Field>
                <Field label="Investimento (%)">{(f) => <NumberInput {...f} value={c.investmentPct} onChange={(v) => v !== undefined && v >= 0 && setCase(c.key as 'conservative', { investmentPct: v })} />}</Field>
              </div>
            )}
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k="Horas liberadas" v={c.freedHoursMonth === null ? '—' : `${fmtNum(c.freedHoursMonth)} pessoa-h/mês`} />
              <Row k="Benefício bruto" v={money(c.grossBenefitMonth)} />
              <Row k="Benefício líquido" v={money(c.netBenefitMonth)} bad={c.netBenefitMonth !== null && c.netBenefitMonth <= 0} />
              <Row k="Investimento" v={c.investment === null ? '—' : fmtBRL(c.investment)} />
              <Row k="Payback" v={c.paybackMonths === null ? 'sem payback' : c.paybackMonths === 0 ? 'imediato' : `${fmtNum(c.paybackMonths, 1)} meses`} />
              <Row k={`ROI em ${cmp.business.horizonMonths} meses`} v={c.roiPct === null ? '—' : fmtPct(c.roiPct)} />
            </dl>
            {c.reason && <p className="mt-2 text-xs text-muted">{c.reason}</p>}
          </section>
        ))}
      </div>
      <HowCalc>
        <p>Horas e benefício bruto do caso = valor base × realização %. Benefício líquido = bruto do caso − custo recorrente. Investimento do caso = investimento × investimento %.</p>
        <p>Payback = investimento do caso ÷ benefício líquido do caso, calculado somente quando o benefício líquido é positivo. ROI = (líquido × horizonte − investimento) ÷ investimento × 100.</p>
      </HowCalc>
    </Card>
  );
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink2">{k}</dt>
      <dd className={clsx('text-right font-semibold tabular', bad ? 'text-bad' : 'text-ink')}>{v}</dd>
    </div>
  );
}

const RESP_LABEL = { transferida: 'Transferida', removida: 'Deixa de existir', nova: 'Nova atividade', definida: 'Responsável definido' } as const;

/** Quem passa a fazer o quê no TO-BE e como muda a carga por responsável. */
function ResponsibilitiesCard({ sc }: { sc: Scenario }) {
  const { w } = useWorkspace();
  const data = useMemo(() => {
    const cmp = compareScenarios(w.asIs, sc);
    return { changes: responsibilityChanges(w.asIs, sc.process), loads: roleLoads(cmp.asIs, cmp.toBe).filter((l) => l.diffMonthH === null || Math.abs(l.diffMonthH) > 0.05) };
  }, [w.asIs, sc]);
  return (
    <Card title="Responsabilidades alteradas" subtitle="Quem faz o quê no cenário futuro">
      {!data.changes.length ? (
        <p className="text-sm text-muted">Nenhuma atividade muda de responsável neste cenário.</p>
      ) : (
        <ul className="space-y-2 text-sm" data-testid="responsibility-changes">
          {data.changes.map((c) => (
            <li key={c.activityId + c.kind} className="flex flex-wrap items-baseline gap-2">
              <Badge tone={c.kind === 'removida' ? 'bad' : c.kind === 'nova' ? 'violet' : 'brand'}>{RESP_LABEL[c.kind]}</Badge>
              <span className="text-ink">{c.activity}</span>
              <span className="text-ink2">
                {c.kind === 'transferida' && `${c.from} → ${c.to ?? 'sem responsável'}`}
                {c.kind === 'definida' && `→ ${c.to}`}
                {c.kind === 'removida' && `${c.from} deixa de executar`}
                {c.kind === 'nova' && (c.to ? `atribuída a ${c.to}` : 'responsável pendente')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.loads.length > 0 && (
        <div className="mt-4">
          <Table caption="Carga mensal por responsável (pessoa-hora/mês, estimada)">
            <thead>
              <tr>
                {['Responsável', 'AS-IS', 'TO-BE', 'Diferença'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.loads.map((l) => (
                <tr key={l.role}>
                  <td className={clsx(td, 'text-ink')}>{l.role}</td>
                  <td className={clsx(td, 'tabular')}>{l.asIsMonthH === null ? '—' : fmtNum(l.asIsMonthH)}</td>
                  <td className={clsx(td, 'tabular')}>{l.toBeMonthH === null ? '—' : fmtNum(l.toBeMonthH)}</td>
                  <td className={clsx(td, 'tabular font-semibold', l.diffMonthH !== null && l.diffMonthH < 0 ? 'text-ok' : l.diffMonthH !== null && l.diffMonthH > 0 ? 'text-amber' : '')}>
                    {l.diffMonthH === null ? 'não calculável' : `${l.diffMonthH > 0 ? '+' : ''}${fmtNum(l.diffMonthH)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">Aumento de carga para um responsável pode exigir capacitação ou realocação — trate como dependência no plano.</p>
        </div>
      )}
    </Card>
  );
}
