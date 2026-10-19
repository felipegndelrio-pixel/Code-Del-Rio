import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import BpmnCanvas, { type Decoration } from '../../bpmn/BpmnCanvas';
import { buildBpmn } from '../../bpmn/model';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, Button, Card, Drawer, Segmented, Table, td, Term, th } from '../../components/ui';
import { bottlenecks, CRITERION_LABEL } from '../../domain/metrics';
import { LEAN_LABEL, TYPE_LABEL, type Activity } from '../../domain/types';
import { fmtDuration, fmtHours, fmtNum, fmtPct, nowIso } from '../../domain/units';
import { useTheme } from '../../state/theme';
import { useWorkspace } from '../../state/workspace';
import { normalizeStages } from '../../domain/factory';

type Mode = 'gargalos' | 'lean' | 'nenhum';

export default function MapTab() {
  const { w, update, metrics } = useWorkspace();
  const { theme } = useTheme();
  const p = w.asIs;
  const [stage, setStage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('gargalos');
  const [editing, setEditing] = useState<Activity | null>(null);
  const build = useMemo(() => buildBpmn(p), [p]);
  const bn = useMemo(() => bottlenecks(p, metrics, w.bottleneck.criterion, w.bottleneck.thresholdPct), [p, metrics, w.bottleneck]);

  useEffect(() => {
    if (!w.visited.map) update((d) => void (d.visited.map = nowIso()));
  }, [w.visited.map, update]);

  const decorations = useMemo(() => {
    const m = new Map<string, Decoration>();
    const rank = new Map(bn.flagged.map((b, i) => [b.id, i + 1]));
    for (const a of p.activities) {
      const d: Decoration = { classes: [], badges: [] };
      if (mode === 'gargalos') {
        if (rank.has(a.id)) {
          d.classes.push('np-bottleneck');
          d.badges.push({ text: `Gargalo #${rank.get(a.id)}`, tone: 'bad' });
        }
        if (a.rework) {
          d.classes.push('np-rework');
          d.badges.push({ text: 'Retrabalho', tone: 'amber' });
        }
        if (a.critical && !rank.has(a.id)) d.classes.push('np-critical');
      } else if (mode === 'lean' && a.lean) d.classes.push(`np-lean-${a.lean}`);
      m.set(a.id, d);
    }
    if (mode === 'gargalos')
      for (const s of p.stageOrder) {
        const inStage = p.activities.filter((a) => a.stage === s);
        const nb = inStage.filter((a) => rank.has(a.id)).length;
        const nr = inStage.filter((a) => a.rework).length;
        const d: Decoration = { classes: nb ? ['np-bottleneck'] : [], badges: [] };
        if (nb) d.badges.push({ text: `${nb} gargalo${nb > 1 ? 's' : ''}`, tone: 'bad' });
        if (nr) d.badges.push({ text: `${nr} retrabalho`, tone: 'amber' });
        m.set(`stage:${s}`, d);
      }
    return m;
  }, [p, bn, mode]);

  const sel = selected ? p.activities.find((a) => a.id === selected) : undefined;
  const selM = sel ? metrics.per.get(sel.id) : undefined;
  const selRank = sel ? bn.flagged.findIndex((b) => b.id === sel.id) : -1;
  const stageActs = stage ? p.activities.filter((a) => a.stage === stage && (a.type === 'task' || a.type === 'decision')).sort((a, b) => a.order - b.order) : [];
  const inferred = p.activities.filter((a) => a.flowInferred).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink2">
          {stage ? (
            <>
              Etapa <strong className="text-ink">{stage}</strong>: atividades, <Term k="bpmn">decisões</Term> e retrabalho. Clique em uma atividade para ver detalhes.
            </>
          ) : (
            <>Visão macro. Clique em uma etapa para abrir as atividades dela.</>
          )}
        </p>
        <Segmented<Mode>
          label="Destacar no mapa"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'gargalos', label: 'Gargalos e retrabalho' },
            { value: 'lean', label: 'Classificação Lean' },
            { value: 'nenhum', label: 'Sem destaque' },
          ]}
        />
      </div>

      <nav aria-label="Etapas do processo" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" onClick={() => setStage(null)} aria-pressed={stage === null} className={clsx('shrink-0 rounded-xl border px-3 py-2 text-left text-sm', stage === null ? 'border-brand bg-brand/15' : 'border-line/15 bg-surface')}>
          <span className="block font-semibold text-ink">Visão macro</span>
          <span className="text-xs text-muted">{p.stageOrder.length} etapas</span>
        </button>
        {metrics.byStage.map((g) => (
          <button key={g.key} type="button" onClick={() => setStage(g.key)} aria-pressed={stage === g.key} className={clsx('shrink-0 rounded-xl border px-3 py-2 text-left text-sm', stage === g.key ? 'border-brand bg-brand/15' : 'border-line/15 bg-surface')}>
            <span className="block font-semibold text-ink">{g.key}</span>
            <span className="text-xs text-muted">
              {g.count} itens · {fmtHours(g.activeH)} ativo
            </span>
          </button>
        ))}
      </nav>

      <BpmnCanvas build={build} theme={theme} stage={stage} onStageChange={setStage} selected={selected} onSelect={setSelected} decorations={decorations} />

      <Card title="Legenda e critérios" subtitle="Por que algo está destacado">
        <ul className="grid gap-2 text-sm text-ink2 sm:grid-cols-2">
          <li>
            <span className="mr-2 inline-block h-3 w-6 rounded border-[3px] border-bad align-middle" /> <strong className="text-ink">Gargalo</strong>: participação ≥ {w.bottleneck.thresholdPct}% em “{CRITERION_LABEL[w.bottleneck.criterion]}” (máx. 5). Ajuste o critério no Diagnóstico. <Term k="bottleneck" iconOnly />
          </li>
          <li>
            <span className="mr-2 inline-block h-3 w-6 rounded border-2 border-dashed border-amber align-middle" /> <strong className="text-ink">Retrabalho</strong>: atividade marcada como retrabalho; setas tracejadas âmbar = retorno no fluxo.
          </li>
          <li>
            <span className="mr-2 inline-block h-3 w-6 rounded border-2 border-violet align-middle" /> <strong className="text-ink">Crítica</strong>: marcada como crítica nos dados.
          </li>
          <li>
            <span className="mr-2 inline-block w-6 border-t-2 border-dotted border-ink2 align-middle" /> <strong className="text-ink">Ligação inferida</strong>: criada pela ordem das linhas{inferred ? ` (${inferred})` : ''} — revise.
          </li>
          {mode === 'lean' && (
            <li className="sm:col-span-2">
              Cores Lean: <Badge tone="ok">{LEAN_LABEL.VA}</Badge> <Badge tone="amber">{LEAN_LABEL.NNVA}</Badge> <Badge tone="bad">{LEAN_LABEL.W}</Badge> — sem cor = não classificado.
            </li>
          )}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Origem: {w.source.kind === 'import' ? `planilha ${w.source.fileName}` : w.source.kind === 'demo' ? 'exemplo fictício' : 'assistente guiado'}. Diagrama BPMN gerado automaticamente; início/fim implícitos são adicionados quando não informados.
        </p>
      </Card>

      {stage && (
        <Card title={`Atividades de “${stage}”`} subtitle="Tempo e pessoas por atividade">
          <Table caption={`Atividades da etapa ${stage}`}>
            <thead>
              <tr>
                {['Atividade', 'Responsável', 'Pessoas', 'Duração', 'Espera', 'Esforço', 'Lean'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stageActs.map((a) => {
                const m = metrics.per.get(a.id)!;
                return (
                  <tr key={a.id} className={clsx('cursor-pointer hover:bg-surface2/60', selected === a.id && 'bg-brand/10')} onClick={() => setSelected(a.id)}>
                    <td className={clsx(td, 'text-ink')}>
                      <button type="button" className="text-left font-medium hover:text-brand" onClick={() => setSelected(a.id)}>
                        {a.type === 'decision' ? '◆ ' : ''}
                        {a.name}
                      </button>
                      <div className="mt-0.5 flex gap-1">
                        {bn.flagged.some((b) => b.id === a.id) && <Badge tone="bad">gargalo</Badge>}
                        {a.rework && <Badge tone="amber">retrabalho</Badge>}
                      </div>
                    </td>
                    <td className={td}>{a.owner ?? '—'}</td>
                    <td className={clsx(td, 'tabular')}>{a.people ?? '—'}</td>
                    <td className={clsx(td, 'tabular')}>{a.type === 'task' ? fmtDuration(a.duration, a.unit) : '—'}</td>
                    <td className={clsx(td, 'tabular')}>{fmtDuration(a.wait, a.unit)}</td>
                    <td className={clsx(td, 'tabular')}>{m.effortH !== null ? `${fmtNum(m.effortH)} pessoa-h` : '—'}</td>
                    <td className={td}>{a.type === 'task' || a.type === 'decision' ? LEAN_LABEL[a.lean ?? 'U'] : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Drawer
        open={!!sel && !editing}
        onClose={() => setSelected(null)}
        title={sel ? `${TYPE_LABEL[sel.type]}: ${sel.name}` : ''}
        footer={
          sel && (
            <Button variant="secondary" onClick={() => setEditing(structuredClone(sel))}>
              Editar dados
            </Button>
          )
        }
      >
        {sel && selM && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1">
              {selRank >= 0 && <Badge tone="bad">Gargalo #{selRank + 1}</Badge>}
              {sel.rework && <Badge tone="amber">Retrabalho</Badge>}
              {sel.critical && <Badge tone="violet">Crítica</Badge>}
              {sel.flowInferred && <Badge tone="muted">Ligação inferida</Badge>}
            </div>
            {selRank >= 0 && (
              <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-ink2">
                <strong className="text-ink">Por que é gargalo:</strong> responde por {fmtPct(bn.flagged[selRank].share)} do total de “{CRITERION_LABEL[w.bottleneck.criterion]}” (limiar {w.bottleneck.thresholdPct}%). Isso mostra concentração — a causa precisa ser confirmada.
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Dt k="Etapa" v={sel.stage} />
              <Dt k="Código" v={sel.id} />
              <Dt k="Responsável" v={sel.owner ?? 'não informado'} />
              <Dt k="Pessoas" v={sel.people ?? 'não informado'} />
              <Dt k="Duração ativa" v={sel.type === 'task' ? fmtDuration(sel.duration, sel.unit) : '—'} />
              <Dt k="Espera antes" v={fmtDuration(sel.wait, sel.unit)} />
              <Dt k="Esforço por ocorrência" v={selM.effortH !== null ? `${fmtNum(selM.effortH)} pessoa-h` : 'informe pessoas'} />
              <Dt k="Esforço no período" v={selM.effortPeriodH !== null ? `${fmtNum(selM.effortPeriodH)} pessoa-h` : 'informe volume'} />
              <Dt k="Frequência" v={sel.frequencyPct !== undefined ? fmtPct(sel.frequencyPct) : 'não informada (considerada 100%)'} />
              <Dt k="Classificação Lean" v={sel.type === 'task' || sel.type === 'decision' ? LEAN_LABEL[sel.lean ?? 'U'] : '—'} />
            </dl>
            {sel.notes && (
              <p className="text-ink2">
                <strong className="text-ink">Observações:</strong> {sel.notes}
              </p>
            )}
          </div>
        )}
      </Drawer>
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar ${editing?.id ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                update(
                  (d) => {
                    const i = d.asIs.activities.findIndex((a) => a.id === editing!.id);
                    d.asIs.activities[i] = editing!;
                    d.asIs = normalizeStages(d.asIs);
                  },
                  { area: 'AS-IS', message: `Editada “${editing!.name}” pelo mapa` },
                );
                setEditing(null);
              }}
            >
              Salvar
            </Button>
          </>
        }
      >
        {editing && <ActivityForm value={editing} onChange={setEditing} all={p.activities} stages={p.stageOrder} />}
      </Drawer>
    </div>
  );
}

function Dt({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="text-ink">{v}</dd>
    </div>
  );
}
