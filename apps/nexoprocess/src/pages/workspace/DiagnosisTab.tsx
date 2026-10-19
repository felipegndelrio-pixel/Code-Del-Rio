import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { LeanBar, ParetoChart, SimpleBars, StackedLoad } from '../../components/charts';
import { Badge, Callout, Card, Field, HowCalc, NumberInput, Select, Stat, Term } from '../../components/ui';
import { bottlenecks, CRITERION_LABEL, dataGaps, pareto } from '../../domain/metrics';
import { PERIOD_LABEL, type BottleneckCriterion } from '../../domain/types';
import { fmtBRL, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

const UNIT_OF: Record<BottleneckCriterion, string> = {
  duration: 'horas de trabalho ativo por ocorrência',
  effort: 'pessoa-hora',
  cost: 'R$ no período',
  wait: 'horas de espera',
  rework: 'pessoa-hora em retrabalho',
};

export default function DiagnosisTab() {
  const { w, update, metrics: m } = useWorkspace();
  const p = w.asIs;
  const per = PERIOD_LABEL[p.volumePeriod];
  useEffect(() => {
    if (!w.visited.diagnosis) update((d) => void (d.visited.diagnosis = nowIso()));
  }, [w.visited.diagnosis, update]);

  const crit = w.bottleneck.criterion;
  const bn = useMemo(() => bottlenecks(p, m, crit, w.bottleneck.thresholdPct), [p, m, crit, w.bottleneck.thresholdPct]);
  const pr = useMemo(() => pareto(p, m, crit), [p, m, crit]);
  const gaps = useMemo(() => dataGaps(p, m), [p, m]);
  const name = (id: string) => m.graph.byId.get(id)?.name ?? id;

  const stageLoad = m.byStage.map((g) => ({ key: g.key, ...g.lean }));
  const ownerEffort = m.byOwner.filter((g) => g.effortExecH > 0).map((g) => ({ key: g.key, value: g.effortExecH }));

  return (
    <div className="space-y-4">
      <Card title="Resumo do processo atual" subtitle="Diagnóstico — tudo calculado a partir dos seus dados">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Atividades identificadas" value={m.counts.tasks + m.counts.decisions} sub={`${m.counts.tasks} tarefas · ${m.counts.decisions} decisões`} basis="informado" />
          <Stat label="Classificadas (Lean)" value={`${m.counts.classified}/${m.counts.classified + m.counts.unclassified}`} sub={m.counts.unclassified ? `${m.counts.unclassified} sem classificação` : 'todas classificadas'} basis="informado" term="lean" />
          <Stat
            label="Soma das durações registradas"
            value={fmtHours(m.activeSumH.value)}
            sub={`${m.activeSumH.coverage.used}/${m.activeSumH.coverage.total} atividades com duração · não é tempo decorrido`}
            basis="calculado"
            missing={m.activeSumH.value === null ? 'Adicione a duração das atividades para calcular.' : undefined}
            term="active"
          />
          <Stat
            label="Tempo decorrido estimado"
            value={m.elapsed.status === 'ok' ? fmtHours(m.elapsed.hours) : ''}
            sub={m.elapsed.status === 'ok' ? (m.elapsed.basis === 'sequencia_unica' ? 'sequência única, inclui esperas informadas' : 'caminho mais longo, sem retrabalho; inclui esperas informadas') : undefined}
            basis="estimado"
            missing={m.elapsed.status !== 'ok' ? `Não calculado com os dados atuais: ${m.elapsed.reasons.join(' ')}` : undefined}
            term="lead"
          />
          <Stat
            label="Esforço por execução"
            value={m.effortExecH.value !== null ? `${fmtNum(m.effortExecH.value)} pessoa-h` : ''}
            sub={m.effortExecH.coverage.missing.length ? `parcial: ${m.effortExecH.coverage.missing.length} atividade(s) sem pessoas/duração` : 'ponderado pela frequência'}
            basis="calculado"
            missing={m.effortExecH.value === null ? 'Adicione duração e quantidade de pessoas para calcular.' : undefined}
            term="effort"
          />
          <Stat label={`Esforço por ${per}`} value={m.effortPeriodH.value !== null ? `${fmtNum(m.effortPeriodH.value)} pessoa-h` : ''} sub={p.volume !== undefined ? `volume: ${fmtNum(p.volume)} execuções/${per}` : undefined} basis="estimado" missing={m.effortPeriodH.value === null ? m.effortPeriodH.reason : undefined} />
          <Stat label={`Custo estimado por ${per}`} value={fmtBRL(m.totalCostPeriod.value)} sub={m.totalCostPeriod.overlapNote ?? (m.laborCostPeriod.coverage.missing.length ? 'parcial: há atividades sem custo-hora' : 'mão de obra alocada + custos variáveis')} basis="estimado" missing={m.totalCostPeriod.value === null ? (m.totalCostPeriod.reason ?? 'Adicione custo-hora para calcular.') : undefined} />
          <Stat
            label={`Retrabalho por ${per}`}
            value={m.rework.effortPeriodH !== null ? `${fmtNum(m.rework.effortPeriodH)} pessoa-h` : ''}
            sub={`${m.counts.rework} atividade(s) de retrabalho · ${m.counts.loops} retorno(s) no fluxo`}
            basis="estimado"
            missing={
              m.rework.effortPeriodH === null ? (m.counts.rework ? (m.rework.missingFrequency.length ? 'Informe a frequência (%) das atividades de retrabalho.' : 'Informe volume, duração e pessoas.') : 'Nenhuma atividade marcada como retrabalho.') : undefined
            }
            term="rework"
          />
        </div>
        <HowCalc>
          <p>
            <strong>Soma das durações</strong> = soma do tempo ativo de cada atividade, uma vez cada. Não considera paralelos nem caminhos alternativos — por isso não é o tempo decorrido.
          </p>
          <p>
            <strong>Tempo decorrido</strong> = caminho mais longo do início ao fim (trabalho + esperas informadas), ignorando retornos de retrabalho. Com decisões, é o pior caso entre os caminhos; com paralelos, o ramo mais demorado.
          </p>
          <p>
            <strong>Esforço</strong> = duração em horas × pessoas simultâneas. Por execução, cada atividade é ponderada pela frequência informada (sem frequência = 100%). Por período = esforço × execuções no período.
          </p>
          <p>
            <strong>Custo</strong> = esforço no período × custo-hora (atividade › função › padrão) + custo variável × execuções. Sem custo-hora, nenhum valor em R$ é mostrado.
          </p>
          <p>
            Conversão: 1 dia = {p.hoursPerDay} h (premissa editável em Dados). Arredondamos só na exibição.
          </p>
        </HowCalc>
      </Card>

      {m.assumptions.length > 0 && (
        <Callout tone="warn" title="Premissas aplicadas nestes números">
          <ul className="list-disc pl-4">
            {m.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Callout>
      )}

      <Card title={<>Gargalos identificados <Term k="bottleneck" iconOnly /></>} subtitle="Regra transparente e configurável">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Critério">
            {(f) => (
              <Select {...f} value={crit} onChange={(e) => update((d) => void (d.bottleneck.criterion = e.target.value as BottleneckCriterion))}>
                {(Object.keys(CRITERION_LABEL) as BottleneckCriterion[]).map((k) => (
                  <option key={k} value={k}>
                    {CRITERION_LABEL[k]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Limiar de participação (%)" help="Destaca a partir deste percentual.">
            {(f) => <NumberInput {...f} value={w.bottleneck.thresholdPct} onChange={(v) => v !== undefined && v > 0 && v <= 100 && update((d) => void (d.bottleneck.thresholdPct = v))} />}
          </Field>
        </div>
        {pr.total === null ? (
          <Callout tone="info">{pr.reason}</Callout>
        ) : bn.flagged.length === 0 ? (
          <Callout tone="ok">Nenhuma atividade ultrapassa {w.bottleneck.thresholdPct}% em “{CRITERION_LABEL[crit]}”. A carga está distribuída por esse critério.</Callout>
        ) : (
          <ol className="space-y-2">
            {bn.flagged.map((b, i) => {
              const a = m.graph.byId.get(b.id)!;
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-bad/30 bg-bad/5 p-3 text-sm">
                  <Badge tone="bad">#{i + 1}</Badge>
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span className="text-ink2">
                    {a.stage} · {fmtPct(b.share, 1)} do total ({fmtNum(b.value)} {UNIT_OF[crit]})
                  </span>
                  {a.owner && <span className="text-muted">· {a.owner}</span>}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">Regra: participação ≥ {w.bottleneck.thresholdPct}% no critério escolhido, até 5 atividades. Concentração não prova causa-raiz — confirme observando o processo.</p>
        {pr.items.length > 0 && (
          <div className="mt-4">
            <ParetoChart data={pr.items.map((x) => ({ name: name(x.id), share: x.share, cumulative: x.cumulative, value: x.value }))} unitLabel={UNIT_OF[crit]} />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<>Valor × desperdício <Term k="lean" iconOnly /></>} subtitle="Lean">
          {m.lean.classifiedHours > 0 ? <LeanBar hours={m.lean.hours} pct={m.lean.pct} /> : <Callout tone="info">Classifique as atividades (agrega valor, necessário, desperdício) e informe a duração para ver a distribuição.</Callout>}
          <p className="mt-3 text-xs text-muted">
            Atividades: {m.lean.counts.VA} agregam valor · {m.lean.counts.NNVA} necessárias · {m.lean.counts.W} desperdício · {m.lean.counts.U} não classificadas.
          </p>
        </Card>
        <Card title={<>Tempo por etapa <Term k="yamazumi" iconOnly /></>} subtitle="Carga por etapa">
          {m.activeSumH.value ? <StackedLoad title="Horas de trabalho ativo por etapa, por classe Lean" data={stageLoad} unit="h" note="Soma da duração ativa (uma ocorrência por atividade)." /> : <Callout tone="info">Adicione a duração das atividades para ver o tempo por etapa.</Callout>}
        </Card>
      </div>

      <Card title="Quem carrega o processo?" subtitle="Esforço por responsável">
        {ownerEffort.length ? (
          <SimpleBars title="Pessoa-hora por execução, por responsável" data={ownerEffort} unit="pessoa-h/execução" note="Esforço ponderado pela frequência. Volume e custo por responsável aparecem quando há volume e custo-hora." />
        ) : (
          <Callout tone="info">Informe responsável, duração e pessoas para ver a carga por responsável.</Callout>
        )}
      </Card>

      {gaps.length > 0 && (
        <Card title="Dados que faltam para desbloquear análises" subtitle="Qualidade de dados">
          <ul className="space-y-1 text-sm">
            {gaps.map((g) => (
              <li key={g.field}>
                <Badge tone="accent">
                  {g.missing}/{g.total}
                </Badge>{' '}
                <span className="text-ink">{g.label}</span> <span className="text-ink2">→ {g.unlocks}</span>
              </li>
            ))}
          </ul>
          <Link to={`/app/p/${w.id}/dados`} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">
            Completar dados
          </Link>
        </Card>
      )}
    </div>
  );
}
