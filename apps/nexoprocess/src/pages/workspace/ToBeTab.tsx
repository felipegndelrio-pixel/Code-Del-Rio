// Construção assistida do TO-BE. Regras: cópia independente do AS-IS; toda
// mudança mostra antes/depois e pede confirmação; nada reduz tempo/custo
// automaticamente — o usuário informa a hipótese futura.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Copy, GitMerge, Plus, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, BasisTag, Button, Callout, Card, Drawer, Empty, Field, Input, Modal, NumberInput, Select, Table, td, Term, Textarea, th, useConfirm, useToast } from '../../components/ui';
import { newActivity, newScenario, nextActivityId } from '../../domain/factory';
import { sortedActivities } from '../../domain/graph';
import type { Recommendation } from '../../domain/recommendations';
import { addActivity, CHANGE_LABEL, combineActivities, diffActivity, removeActivity, restoreFromAsIs, updateActivity, type ChangeMeta } from '../../domain/tobe';
import type { Activity, AssumptionStatus, ChangeKind, Scenario } from '../../domain/types';
import { fmtDateTime, fmtDuration, nowIso, uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
import { lazyLabels, tr } from '../../i18n';
type Pending = { kind: ChangeKind; activity: Activity; draft: Activity; recId?: string } | { kind: 'remove'; activity: Activity; recId?: string } | null;

const FIELD_LABEL: Partial<Record<keyof Activity, string>> = lazyLabels({
  name: 'd.field.name',
  duration: 'd.field.duration',
  unit: 'd.field.unit',
  wait: 'd.field.wait',
  people: 'd.field.people',
  owner: 'd.field.owner',
  lean: 'd.field.lean',
  rework: 'd.field.rework',
  frequencyPct: 'd.field.frequencyPct',
  costPerHour: 'd.field.costPerHour',
  variableCost: 'd.field.variableCost',
  next: 'd.field.next',
  nextYes: 'd.field.nextYes',
  nextNo: 'd.field.nextNo',
  order: 'd.field.order',
  stage: 'd.field.stage',
  minDuration: 'd.field.minDuration',
  maxDuration: 'd.field.maxDuration',
  notes: 'd.field.notes',
  critical: 'd.field.critical',
  volume: 'd.field.volume',
});
const show = (v: unknown) => (v === undefined || v === null || v === '' ? tr('d.show.empty') : Array.isArray(v) ? v.join(', ') || tr('d.show.empty') : typeof v === 'boolean' ? (v ? tr('d.show.yes') : tr('d.show.no')) : String(v));

export default function ToBeTab() {
  const { t } = useI18n();
  const { w, update, recs } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [newName, setNewName] = useState(t('ws.tobe.001'));
  const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
  const [pending, setPending] = useState<Pending>(null);
  const [meta, setMeta] = useState<ChangeMeta>({});
  const [combine, setCombine] = useState<{ keep: string; merge: string; name: string; duration?: number } | null>(null);
  const [adding, setAdding] = useState<{ act: Activity; after?: string } | null>(null);
  const [assumption, setAssumption] = useState('');

  const setScenario = (fn: (s: Scenario) => Scenario | null, message?: string) => {
    if (!sc) return;
    const next = fn(structuredClone(sc));
    if (!next) {
      toast('info', t('ws.tobe.002'));
      return;
    }
    update(
      (d) => {
        const i = d.scenarios.findIndex((s) => s.id === sc.id);
        d.scenarios[i] = { ...next, updatedAt: nowIso() };
      },
      message ? { area: t('ws.tobe.003', { name: sc.name }), message } : undefined,
    );
  };

  const create = (from?: Scenario) => {
    const s = from ? { ...structuredClone(from), id: uid('s_'), name: t('ws.tobe.004', { name: from.name }), createdAt: nowIso(), updatedAt: nowIso() } : newScenario(w.asIs, newName.trim() || t('ws.tobe.005'));
    update(
      (d) => {
        d.scenarios.push(s);
        d.activeScenarioId = s.id;
      },
      { area: t('ws.tobe.006'), message: from ? t('ws.tobe.007', { name: s.name }) : t('ws.tobe.008', { name: s.name }) },
    );
    toast('ok', from ? t('ws.tobe.009') : t('ws.tobe.010'));
  };

  const removeScenario = async () => {
    if (!sc || !(await confirm({ title: t('ws.tobe.011', { name: sc.name }), body: t('ws.tobe.012'), confirm: t('ws.tobe.013'), danger: true }))) return;
    update(
      (d) => {
        d.scenarios = d.scenarios.filter((s) => s.id !== sc.id);
        d.activeScenarioId = d.scenarios[0]?.id;
      },
      { area: t('ws.tobe.006'), message: t('ws.tobe.015', { name: sc.name }) },
    );
  };

  const accepted = useMemo(() => recs.filter((r) => w.recDecisions[r.id]?.status === 'accepted' && r.activityId && r.changeKind), [recs, w.recDecisions]);

  if (!sc)
    return (
      <Card title={<>{t('ws.tobe.016')}<Term k="tobe" iconOnly /></>} subtitle={t('ws.tobe.006')}>
        <Empty
          title={t('ws.tobe.018')}
          action={
            <div className="flex flex-wrap items-end justify-center gap-2">
              <Field label={t('ws.tobe.019')}>{(f) => <Input {...f} value={newName} onChange={(e) => setNewName(e.target.value)} />}</Field>
              <Button onClick={() => create()}>{t('ws.tobe.020')}</Button>
            </div>
          }
        >{t('ws.tobe.021')}</Empty>
      </Card>
    );

  const acts = sortedActivities(sc.process);
  const asIsById = new Map(w.asIs.activities.map((a) => [a.id, a]));
  const rowState = (a: Activity) => (!asIsById.has(a.id) ? 'nova' : JSON.stringify(asIsById.get(a.id)) !== JSON.stringify(a) ? 'alterada' : '');
  const removed = w.asIs.activities.filter((a) => !sc.process.activities.some((x) => x.id === a.id));

  const startFromRec = (r: Recommendation) => {
    const a = sc.process.activities.find((x) => x.id === r.activityId);
    if (!a) {
      toast('info', t('ws.tobe.022'));
      return;
    }
    setMeta({ recId: r.id, justification: r.problem, hypothesis: r.hypothesis });
    if (r.changeKind === 'remove') setPending({ kind: 'remove', activity: a, recId: r.id });
    else setPending({ kind: r.changeKind!, activity: a, draft: structuredClone(a), recId: r.id });
  };

  const confirmPending = () => {
    if (!pending) return;
    if (!meta.justification?.trim()) {
      toast('bad', t('ws.tobe.023'));
      return;
    }
    try {
      if (pending.kind === 'remove' && !('draft' in pending)) setScenario((s) => removeActivity(s, pending.activity.id, meta), t('ws.tobe.024', { name: pending.activity.name }));
      else if ('draft' in pending) setScenario((s) => updateActivity(s, pending.activity.id, pending.draft, pending.kind, meta), `${CHANGE_LABEL[pending.kind]}: “${pending.activity.name}”`);
      setPending(null);
      setMeta({});
    } catch (e) {
      toast('bad', e instanceof Error ? e.message : t('ws.tobe.025'));
    }
  };

  const diff = pending && 'draft' in pending ? diffActivity(pending.activity, pending.draft) : null;
  const successors = pending && pending.kind === 'remove' ? pending.activity.next.map((n) => sc.process.activities.find((a) => a.id === n)?.name ?? n) : [];

  return (
    <div className="space-y-4">
      <Card title={t('ws.tobe.005')} subtitle={t('ws.tobe.027')}>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('ws.tobe.028')} className="min-w-[min(100%,280px)] flex-1">
            {(f) => (
              <Select {...f} value={sc.id} onChange={(e) => update((d) => void (d.activeScenarioId = e.target.value))}>
                {w.scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('ws.tobe.029')} className="min-w-[200px] flex-1">
            {(f) => <Input {...f} value={sc.name} onChange={(e) => setScenario((s) => ({ ...s, name: e.target.value }))} />}
          </Field>
          <Button variant="secondary" size="sm" onClick={() => create()}>
            <Plus className="h-4 w-4" />{t('ws.tobe.030')}</Button>
          <Button variant="secondary" size="sm" onClick={() => create(sc)}>
            <Copy className="h-4 w-4" />{t('ws.tobe.031')}</Button>
          <Button variant="ghost" size="sm" onClick={() => void removeScenario()} aria-label={t('ws.tobe.032')}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">{t('ws.tobe.033')}{fmtDateTime(sc.createdAt)} · {sc.changes.length}{t('ws.tobe.034')}</p>
      </Card>

      {accepted.length > 0 && (
        <Card title={t('ws.tobe.035')} subtitle={t('ws.tobe.036')}>
          <ul className="space-y-2">
            {accepted.map((r) => {
              const applied = sc.changes.some((c) => c.recId === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line/15 bg-surface2/40 p-3 text-sm">
                  <span className="min-w-0 flex-1 text-ink">{r.title}</span>
                  {applied ? (
                    <Badge tone="ok">{t('ws.tobe.037')}</Badge>
                  ) : (
                    <Button size="sm" onClick={() => startFromRec(r)}>
                      <Wand2 className="h-4 w-4" />{t('ws.tobe.038')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('ws.tobe.039')}</p>
        </Card>
      )}
      {accepted.length === 0 && (
        <Callout tone="info">{t('ws.tobe.040')}<Link className="font-semibold text-brand" to={`/app/p/${w.id}/recomendacoes`}>{t('ws.tobe.041')}</Link>{t('ws.tobe.042')}</Callout>
      )}

      <Card
        title={t('ws.tobe.043', { length: acts.length })}
        subtitle={t('ws.tobe.044')}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setCombine({ keep: '', merge: '', name: '' })}>
              <GitMerge className="h-4 w-4" />{t('ws.tobe.045')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setAdding({ act: newActivity({ id: nextActivityId(sc.process), stage: sc.process.stageOrder[0] ?? '', name: '' }) })}>
              <Plus className="h-4 w-4" />{t('ws.tobe.046')}</Button>
          </div>
        }
      >
        <Table caption={t('ws.tobe.047')}>
          <thead>
            <tr>
              {[t('ws.tobe.048'), t('ws.tobe.049'), t('ws.tobe.050'), t('ws.tobe.051'), t('ws.tobe.052'), t('ws.tobe.053'), ''].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {acts.map((a) => {
              const st = rowState(a);
              const orig = asIsById.get(a.id);
              return (
                <tr key={a.id} className={clsx(st && 'bg-brand/5')}>
                  <td className={clsx(td, 'text-ink')}>
                    {a.type === 'decision' ? '◆ ' : ''}
                    {a.name}
                    <span className="ml-1 font-mono text-xs text-muted">{a.id}</span>
                  </td>
                  <td className={td}>{a.stage}</td>
                  <td className={clsx(td, 'tabular')}>
                    {a.type === 'task' ? fmtDuration(a.duration, a.unit) : '—'}
                    {orig && orig.duration !== a.duration && <span className="block text-xs text-muted line-through">{fmtDuration(orig.duration, orig.unit)}</span>}
                  </td>
                  <td className={clsx(td, 'tabular')}>
                    {fmtDuration(a.wait, a.unit)}
                    {orig && orig.wait !== a.wait && <span className="block text-xs text-muted line-through">{fmtDuration(orig.wait, orig.unit)}</span>}
                  </td>
                  <td className={clsx(td, 'tabular')}>{a.people ?? '—'}</td>
                  <td className={td}>{st ? <Badge tone={st === 'nova' ? 'violet' : 'brand'}>{st}</Badge> : <span className="text-muted">{t('ws.tobe.054')}</span>}</td>
                  <td className={clsx(td, 'whitespace-nowrap')}>
                    {a.type !== 'start' && a.type !== 'end' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setMeta({});
                          setPending({ kind: 'edit', activity: a, draft: structuredClone(a) });
                        }}
                      >{t('ws.tobe.055')}</Button>
                    )}
                    {a.type === 'task' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('ws.tobe.056', { name: a.name })}
                        onClick={() => {
                          setMeta({});
                          setPending({ kind: 'remove', activity: a });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    {st === 'alterada' && (
                      <Button size="sm" variant="ghost" aria-label={t('ws.tobe.057', { name: a.name })} onClick={() => setScenario((s) => restoreFromAsIs(s, w.asIs.activities, a.id, { justification: t('ws.tobe.058') }), t('ws.tobe.059', { name: a.name }))}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {removed.length > 0 && (
          <p className="mt-2 text-sm text-ink2">{t('ws.tobe.060')}{removed.map((a) => a.name).join(', ')}.
          </p>
        )}
      </Card>

      <ScenarioAssumptions sc={sc} setScenario={setScenario} assumption={assumption} setAssumption={setAssumption} asIsVolume={w.asIs.volume} />

      <Card title={t('ws.tobe.061')} subtitle={t('ws.tobe.062')}>
        {sc.changes.length === 0 ? (
          <p className="text-sm text-muted">{t('ws.tobe.063')}</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {[...sc.changes].reverse().map((c) => (
              <li key={c.id} className="rounded-xl border border-line/15 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{CHANGE_LABEL[c.kind]}</Badge>
                  <span className="font-medium text-ink">{c.summary}</span>
                  <span className="text-xs text-muted">{fmtDateTime(c.at)}</span>
                </div>
                {c.before && c.after && (
                  <p className="mt-1 text-xs text-ink2">
                    {Object.keys(c.after).map((k) => `${FIELD_LABEL[k as keyof Activity] ?? k}: ${show((c.before as any)[k])} → ${show((c.after as any)[k])}`).join(' · ')}
                  </p>
                )}
                {c.justification && <p className="mt-1 text-xs text-ink2">{t('ws.tobe.064')}{c.justification}</p>}
                {c.hypothesis && (
                  <p className="text-xs text-ink2">{t('ws.tobe.065')}<BasisTag basis="a_validar" />: {c.hypothesis}
                  </p>
                )}
                {c.validator && <p className="text-xs text-ink2">{t('ws.tobe.066')}{c.validator}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Diálogo de mudança: antes/depois + confirmação */}
      <Drawer
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `${CHANGE_LABEL[pending.kind]}: ${pending.activity.name}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>{t('ws.tobe.067')}</Button>
            <Button onClick={confirmPending} disabled={!!diff && !Object.keys(diff.after).length}>{t('ws.tobe.068')}</Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-4">
            {pending.kind === 'remove' ? (
              <Callout tone="warn" title={t('ws.tobe.069')}>{t('ws.tobe.070')}{pending.activity.name}{t('ws.tobe.071')}{successors.length ? successors.join(', ') : t('ws.tobe.072')}{t('ws.tobe.073')}</Callout>
            ) : (
              'draft' in pending && (
                <>
                  <Field label={t('ws.tobe.074')}>
                    {(f) => (
                      <Select {...f} value={pending.kind} onChange={(e) => setPending({ ...pending, kind: e.target.value as ChangeKind })}>
                        {(['simplify', 'automate', 'reduce_wait', 'reduce_rework', 'reorder', 'edit'] as ChangeKind[]).map((k) => (
                          <option key={k} value={k}>
                            {CHANGE_LABEL[k]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  {pending.kind === 'automate' && (
                    <Callout tone="info">{t('ws.tobe.075')}</Callout>
                  )}
                  <ActivityForm value={pending.draft} onChange={(d) => setPending({ ...pending, draft: d })} all={sc.process.activities} stages={sc.process.stageOrder} />
                  <div className="rounded-xl border border-line/15 bg-surface2/50 p-3 text-sm">
                    <p className="font-semibold text-ink">{t('ws.tobe.076')}</p>
                    {diff && Object.keys(diff.after).length ? (
                      <ul className="mt-1 space-y-0.5 text-ink2">
                        {Object.keys(diff.after).map((k) => (
                          <li key={k}>
                            {FIELD_LABEL[k as keyof Activity] ?? k}: <span className="line-through">{show((diff.before as any)[k])}</span> → <strong className="text-ink">{show((diff.after as any)[k])}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted">{t('ws.tobe.077')}</p>
                    )}
                  </div>
                </>
              )
            )}
            <Field label={t('ws.tobe.078')} required help={t('ws.tobe.079')}>
              {(f) => <Textarea {...f} value={meta.justification ?? ''} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />}
            </Field>
            <Field label={t('ws.tobe.080')} help={t('ws.tobe.081')}>
              {(f) => <Textarea {...f} value={meta.hypothesis ?? ''} onChange={(e) => setMeta({ ...meta, hypothesis: e.target.value })} />}
            </Field>
            <Field label={t('ws.tobe.082')} help={t('ws.tobe.083')}>
              {(f) => <Input {...f} value={meta.validator ?? ''} onChange={(e) => setMeta({ ...meta, validator: e.target.value })} />}
            </Field>
          </div>
        )}
      </Drawer>

      <Modal
        open={!!combine}
        onClose={() => setCombine(null)}
        title={t('ws.tobe.084')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCombine(null)}>{t('ws.tobe.067')}</Button>
            <Button
              disabled={!combine?.keep || !combine?.merge || combine.keep === combine.merge || !combine.name.trim() || !meta.justification?.trim()}
              onClick={() => {
                const c = combine!;
                try {
                  setScenario((s) => combineActivities(s, c.keep, c.merge, { name: c.name.trim(), duration: c.duration }, meta), t('ws.tobe.086', { keep: c.keep, merge: c.merge }));
                  setCombine(null);
                  setMeta({});
                } catch (e) {
                  toast('bad', e instanceof Error ? e.message : t('ws.tobe.087'));
                }
              }}
            >{t('ws.tobe.088')}</Button>
          </>
        }
      >
        {combine && (
          <div className="space-y-3">
            {(['keep', 'merge'] as const).map((k) => (
              <Field key={k} label={k === 'keep' ? t('ws.tobe.089') : t('ws.tobe.090')}>
                {(f) => (
                  <Select {...f} value={combine[k]} onChange={(e) => setCombine({ ...combine, [k]: e.target.value })}>
                    <option value="">{t('ws.tobe.091')}</option>
                    {acts
                      .filter((a) => a.type === 'task')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id} · {a.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
            ))}
            <Field label={t('ws.tobe.092')}>{(f) => <Input {...f} value={combine.name} onChange={(e) => setCombine({ ...combine, name: e.target.value })} />}</Field>
            <Field label={t('ws.tobe.093')} help={t('ws.tobe.094')}>
              {(f) => <NumberInput {...f} value={combine.duration} onChange={(v) => setCombine({ ...combine, duration: v })} />}
            </Field>
            <Field label={t('ws.tobe.078')} required>
              {(f) => <Textarea {...f} value={meta.justification ?? ''} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />}
            </Field>
          </div>
        )}
      </Modal>

      <Drawer
        open={!!adding}
        onClose={() => setAdding(null)}
        title={t('ws.tobe.096')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(null)}>{t('ws.tobe.067')}</Button>
            <Button
              disabled={!adding?.act.name.trim() || !meta.justification?.trim()}
              onClick={() => {
                try {
                  setScenario((s) => addActivity(s, { ...adding!.act, name: adding!.act.name.trim() }, adding!.after, meta), t('ws.tobe.098', { name: adding!.act.name }));
                  setAdding(null);
                  setMeta({});
                } catch (e) {
                  toast('bad', e instanceof Error ? e.message : t('ws.tobe.099'));
                }
              }}
            >{t('ws.tobe.100')}</Button>
          </>
        }
      >
        {adding && (
          <div className="space-y-4">
            <Field label={t('ws.tobe.101')} help={t('ws.tobe.102')}>
              {(f) => (
                <Select {...f} value={adding.after ?? ''} onChange={(e) => setAdding({ ...adding, after: e.target.value || undefined })}>
                  <option value="">{t('ws.tobe.103')}</option>
                  {acts
                    .filter((a) => a.type === 'task' || a.type === 'start')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.id} · {a.name}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
            <ActivityForm value={adding.act} onChange={(a) => setAdding({ ...adding, act: a })} all={sc.process.activities} stages={sc.process.stageOrder} />
            <Field label={t('ws.tobe.078')} required>
              {(f) => <Textarea {...f} value={meta.justification ?? ''} onChange={(e) => setMeta({ ...meta, justification: e.target.value })} />}
            </Field>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function ScenarioAssumptions({ sc, setScenario, assumption, setAssumption, asIsVolume }: { sc: Scenario; setScenario: (fn: (s: Scenario) => Scenario | null, m?: string) => void; assumption: string; setAssumption: (s: string) => void; asIsVolume?: number }) {
  const { t } = useI18n();
  return (
    <Card title={t('ws.tobe.105')} subtitle={t('ws.tobe.106')}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label={t('ws.tobe.107')} help={t('ws.tobe.108')}>
          {(f) => <NumberInput {...f} value={sc.investment} onChange={(v) => setScenario((s) => ({ ...s, investment: v }))} />}
        </Field>
        <Field label={t('ws.tobe.109')} help={t('ws.tobe.110')}>
          {(f) => <NumberInput {...f} value={sc.recurringCostPerMonth} onChange={(v) => setScenario((s) => ({ ...s, recurringCostPerMonth: v }))} />}
        </Field>
        <Field label={t('ws.tobe.111')} help={t('ws.tobe.112')}>
          {(f) => <NumberInput {...f} value={sc.horizonMonths} onChange={(v) => v && v >= 1 && setScenario((s) => ({ ...s, horizonMonths: Math.round(v) }))} />}
        </Field>
        <Field label={t('ws.tobe.113')} help={t('ws.tobe.114', { p0: asIsVolume ?? t('ws.tobe.115') })}>
          {(f) => <NumberInput {...f} value={sc.process.volume} onChange={(v) => setScenario((s) => ({ ...s, process: { ...s.process, volume: v } }))} />}
        </Field>
      </div>
      <div className="mt-4">
        <p className="text-sm font-semibold text-ink">{t('ws.tobe.116')}</p>
        <ul className="mt-2 space-y-2">
          {sc.assumptions.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 text-ink2">{a.text}</span>
              <Select
                aria-label={t('ws.tobe.117')}
                className="w-40"
                value={a.status}
                onChange={(e) => setScenario((s) => ({ ...s, assumptions: s.assumptions.map((x) => (x.id === a.id ? { ...x, status: e.target.value as AssumptionStatus } : x)) }), t('ws.tobe.118', { text: a.text, value: e.target.value }))}
              >
                <option value="a_validar">{t('ws.tobe.119')}</option>
                <option value="validada">{t('ws.tobe.120')}</option>
                <option value="rejeitada">{t('ws.tobe.121')}</option>
              </Select>
              <Button size="sm" variant="ghost" aria-label={t('ws.tobe.122')} onClick={() => setScenario((s) => ({ ...s, assumptions: s.assumptions.filter((x) => x.id !== a.id) }))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input aria-label={t('ws.tobe.123')} placeholder={t('ws.tobe.124')} value={assumption} onChange={(e) => setAssumption(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!assumption.trim()}
            onClick={() => {
              setScenario((s) => ({ ...s, assumptions: [...s.assumptions, { id: uid('as_'), text: assumption.trim(), status: 'a_validar' }] }), t('ws.tobe.125', { p0: assumption.trim() }));
              setAssumption('');
            }}
          >{t('ws.tobe.100')}</Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label={t('ws.tobe.127')}>{(f) => <Textarea {...f} value={sc.dependencies ?? ''} onChange={(e) => setScenario((s) => ({ ...s, dependencies: e.target.value || undefined }))} />}</Field>
        <Field label={t('ws.tobe.128')}>{(f) => <Textarea {...f} value={sc.risks ?? ''} onChange={(e) => setScenario((s) => ({ ...s, risks: e.target.value || undefined }))} />}</Field>
      </div>
    </Card>
  );
}

