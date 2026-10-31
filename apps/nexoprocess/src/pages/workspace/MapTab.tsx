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

import { useI18n } from '../../i18n/I18nProvider';
type Mode = 'gargalos' | 'lean' | 'nenhum';

export default function MapTab() {
  const { t } = useI18n();
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
          d.badges.push({ text: t('ws.map.001', { p0: rank.get(a.id) }), tone: 'bad' });
        }
        if (a.rework) {
          d.classes.push('np-rework');
          d.badges.push({ text: t('ws.map.002'), tone: 'amber' });
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
        if (nb) d.badges.push({ text: t('ws.map.003', { nb, p1: nb > 1 ? 's' : '' }), tone: 'bad' });
        if (nr) d.badges.push({ text: t('ws.map.004', { nr }), tone: 'amber' });
        m.set(`stage:${s}`, d);
      }
    return m;
  }, [p, bn, mode, t]);

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
            <>{t('ws.map.005')}<strong className="text-ink">{stage}</strong>{t('ws.map.006')}<Term k="bpmn">{t('ws.map.007')}</Term>{t('ws.map.008')}</>
          ) : (
            <>{t('ws.map.009')}</>
          )}
        </p>
        <Segmented<Mode>
          label={t('ws.map.010')}
          value={mode}
          onChange={setMode}
          options={[
            // Rótulos curtos no celular: as três opções cabem numa linha só.
            { value: 'gargalos', label: <>{t('ws.map.011')}<span className="hidden sm:inline">{t('ws.map.012')}</span></> },
            { value: 'lean', label: <><span className="hidden sm:inline">{t('ws.map.013')}</span>{t('ws.map.014')}</> },
            { value: 'nenhum', label: t('ws.map.015') },
          ]}
        />
      </div>

      <nav aria-label={t('ws.map.016')} className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" onClick={() => setStage(null)} aria-pressed={stage === null} className={clsx('shrink-0 rounded-xl border px-3 py-2 text-left text-sm', stage === null ? 'border-brand bg-brand/15' : 'border-line/15 bg-surface')}>
          <span className="block font-semibold text-ink">{t('ws.map.017')}</span>
          <span className="text-xs text-muted">{p.stageOrder.length}{t('ws.map.018')}</span>
        </button>
        {metrics.byStage.map((g) => (
          <button key={g.key} type="button" onClick={() => setStage(g.key)} aria-pressed={stage === g.key} className={clsx('shrink-0 rounded-xl border px-3 py-2 text-left text-sm', stage === g.key ? 'border-brand bg-brand/15' : 'border-line/15 bg-surface')}>
            <span className="block font-semibold text-ink">{g.key}</span>
            <span className="text-xs text-muted">
              {g.count}{t('ws.map.019')}{fmtHours(g.activeH)}{t('ws.map.020')}</span>
          </button>
        ))}
      </nav>

      <BpmnCanvas build={build} theme={theme} stage={stage} onStageChange={setStage} selected={selected} onSelect={setSelected} decorations={decorations} />

      <Card title={t('ws.map.021')} subtitle={t('ws.map.022')}>
        <ul className="grid gap-2 text-sm text-ink2 sm:grid-cols-2">
          <li>
            <span className="mr-2 inline-block h-3 w-6 rounded border-[3px] border-bad align-middle" /> <strong className="text-ink">{t('ws.map.023')}</strong>{t('ws.map.024')}{w.bottleneck.thresholdPct}{t('ws.map.025')}{CRITERION_LABEL[w.bottleneck.criterion]}{t('ws.map.026')}<Term k="bottleneck" iconOnly />
          </li>
          <li>
            <span className="mr-2 inline-block h-3 w-6 rounded border-2 border-dashed border-amber align-middle" /> <strong className="text-ink">{t('ws.map.027')}</strong>{t('ws.map.028')}</li>
          <li>
            <span className="mr-2 inline-block h-3 w-6 rounded border-2 border-violet align-middle" /> <strong className="text-ink">{t('ws.map.029')}</strong>{t('ws.map.030')}</li>
          <li>
            <span className="mr-2 inline-block w-6 border-t-2 border-dotted border-ink2 align-middle" /> <strong className="text-ink">{t('ws.map.031')}</strong>{t('ws.map.032')}{inferred ? ` (${inferred})` : ''}{t('ws.map.033')}</li>
          {mode === 'lean' && (
            <li className="sm:col-span-2">{t('ws.map.034')}<Badge tone="ok">{LEAN_LABEL.VA}</Badge> <Badge tone="amber">{LEAN_LABEL.NNVA}</Badge> <Badge tone="bad">{LEAN_LABEL.W}</Badge>{t('ws.map.035')}</li>
          )}
        </ul>
        <p className="mt-2 text-xs text-muted">{t('ws.map.036')}{w.source.kind === 'import' ? t('ws.map.037', { fileName: w.source.fileName }) : w.source.kind === 'demo' ? t('ws.map.038') : t('ws.map.039')}{t('ws.map.040')}</p>
      </Card>

      {stage && (
        <Card title={t('ws.map.041', { stage })} subtitle={t('ws.map.042')}>
          <Table caption={t('ws.map.043', { stage })}>
            <thead>
              <tr>
                {['Atividade', t('ws.map.044'), 'Pessoas', t('ws.map.045'), 'Espera', t('ws.map.046'), 'Lean'].map((h) => (
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
                        {bn.flagged.some((b) => b.id === a.id) && <Badge tone="bad">{t('ws.map.047')}</Badge>}
                        {a.rework && <Badge tone="amber">{t('ws.map.048')}</Badge>}
                      </div>
                    </td>
                    <td className={td}>{a.owner ?? '—'}</td>
                    <td className={clsx(td, 'tabular')}>{a.people ?? '—'}</td>
                    <td className={clsx(td, 'tabular')}>{a.type === 'task' ? fmtDuration(a.duration, a.unit) : '—'}</td>
                    <td className={clsx(td, 'tabular')}>{fmtDuration(a.wait, a.unit)}</td>
                    <td className={clsx(td, 'tabular')}>{m.effortH !== null ? t('ws.map.049', { p0: fmtNum(m.effortH) }) : '—'}</td>
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
            <Button variant="secondary" onClick={() => setEditing(structuredClone(sel))}>{t('ws.map.050')}</Button>
          )
        }
      >
        {sel && selM && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1">
              {selRank >= 0 && <Badge tone="bad">{t('ws.map.051')}{selRank + 1}</Badge>}
              {sel.rework && <Badge tone="amber">{t('ws.map.052')}</Badge>}
              {sel.critical && <Badge tone="violet">{t('ws.map.053')}</Badge>}
              {sel.flowInferred && <Badge tone="muted">{t('ws.map.054')}</Badge>}
            </div>
            {selRank >= 0 && (
              <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-ink2">
                <strong className="text-ink">{t('ws.map.055')}</strong>{t('ws.map.056')}{fmtPct(bn.flagged[selRank].share)}{t('ws.map.057')}{CRITERION_LABEL[w.bottleneck.criterion]}{t('ws.map.058')}{w.bottleneck.thresholdPct}{t('ws.map.059')}</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Dt k="Etapa" v={sel.stage} />
              <Dt k="Código" v={sel.id} />
              <Dt k="Responsável" v={sel.owner ?? t('ws.map.060')} />
              <Dt k="Pessoas" v={sel.people ?? t('ws.map.061')} />
              <Dt k="Duração ativa" v={sel.type === 'task' ? fmtDuration(sel.duration, sel.unit) : '—'} />
              <Dt k="Espera antes" v={fmtDuration(sel.wait, sel.unit)} />
              <Dt k="Esforço por ocorrência" v={selM.effortH !== null ? t('ws.map.062', { p0: fmtNum(selM.effortH) }) : t('ws.map.063')} />
              <Dt k="Esforço no período" v={selM.effortPeriodH !== null ? t('ws.map.064', { p0: fmtNum(selM.effortPeriodH) }) : t('ws.map.065')} />
              <Dt k="Frequência" v={sel.frequencyPct !== undefined ? fmtPct(sel.frequencyPct) : t('ws.map.066')} />
              <Dt k="Classificação Lean" v={sel.type === 'task' || sel.type === 'decision' ? LEAN_LABEL[sel.lean ?? 'U'] : '—'} />
            </dl>
            {sel.notes && (
              <p className="text-ink2">
                <strong className="text-ink">{t('ws.map.067')}</strong> {sel.notes}
              </p>
            )}
          </div>
        )}
      </Drawer>
      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('ws.map.068', { p0: editing?.id ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('ws.map.069')}</Button>
            <Button
              onClick={() => {
                update(
                  (d) => {
                    const i = d.asIs.activities.findIndex((a) => a.id === editing!.id);
                    d.asIs.activities[i] = editing!;
                    d.asIs = normalizeStages(d.asIs);
                  },
                  { area: 'AS-IS', message: t('ws.map.070', { name: editing!.name }) },
                );
                setEditing(null);
              }}
            >{t('ws.map.071')}</Button>
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
