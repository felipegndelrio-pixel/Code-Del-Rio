// Edição do AS-IS: dados do processo, atividades, custos por função,
// restauração do original, cópias de segurança e histórico.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { History, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, Button, Callout, Card, Drawer, Field, Input, NumberInput, Select, Table, td, Term, Textarea, th, useConfirm, useToast } from '../../components/ui';
import { newActivity, nextActivityId, normalizeStages } from '../../domain/factory';
import { sortedActivities } from '../../domain/graph';
import { LEAN_LABEL, TYPE_LABEL, type Activity, type Period } from '../../domain/types';
import { fmtDateTime, fmtDuration, nowIso, uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
export default function DataTab() {
  const { t } = useI18n();
  const { w, update, issues } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const p = w.asIs;
  const [editing, setEditing] = useState<Activity | null>(null);
  const [isNew, setIsNew] = useState(false);
  const acts = useMemo(() => sortedActivities(p), [p]);
  const owners = useMemo(() => [...new Set(p.activities.map((a) => a.owner?.trim()).filter(Boolean) as string[])].sort(), [p.activities]);
  const issueCount = (id: string) => issues.filter((i) => i.activityId === id && i.severity !== 'info').length;

  const setProc = (patch: Partial<typeof p>, msg?: string) =>
    update(
      (d) => {
        Object.assign(d.asIs, patch);
      },
      msg ? { area: t('ws.data.001'), message: msg } : undefined,
    );

  const saveActivity = () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast('bad', t('ws.data.002'));
      return;
    }
    update(
      (d) => {
        const i = d.asIs.activities.findIndex((a) => a.id === editing.id);
        const clean = { ...editing, stage: editing.stage.trim() || t('ws.data.003'), name: editing.name.trim() };
        if (i >= 0) d.asIs.activities[i] = clean;
        else d.asIs.activities.push(clean);
        d.asIs = normalizeStages(d.asIs);
        d.validationAcceptedAt = undefined;
      },
      { area: t('ws.data.004'), message: t('ws.data.005', { p0: isNew ? t('ws.data.006') : t('ws.data.007'), name: editing.name }) },
    );
    setEditing(null);
    toast('ok', t('ws.data.008'));
  };

  const remove = async (a: Activity) => {
    const refs = p.activities.filter((x) => x.next.includes(a.id) || x.nextYes === a.id || x.nextNo === a.id);
    if (!(await confirm({ title: t('ws.data.009', { name: a.name }), body: <>{refs.length ? t('ws.data.010', { length: refs.length }) : t('ws.data.011')}{t('ws.data.012')}</>, confirm: t('ws.data.013'), danger: true }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label: t('ws.data.014', { name: a.name }), process: structuredClone(d.asIs) }].slice(-15);
        d.asIs.activities = d.asIs.activities.filter((x) => x.id !== a.id).map((x) => ({ ...x, next: x.next.filter((n) => n !== a.id), nextYes: x.nextYes === a.id ? undefined : x.nextYes, nextNo: x.nextNo === a.id ? undefined : x.nextNo }));
        d.asIs = normalizeStages(d.asIs);
        d.validationAcceptedAt = undefined;
      },
      { area: t('ws.data.004'), message: t('ws.data.016', { name: a.name }) },
    );
  };

  const restoreBaseline = async () => {
    if (!(await confirm({ title: t('ws.data.017'), body: t('ws.data.018'), confirm: t('ws.data.019') }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label: t('ws.data.020'), process: structuredClone(d.asIs) }].slice(-15);
        d.asIs = structuredClone(d.asIsBaseline);
        d.validationAcceptedAt = undefined;
      },
      { area: t('ws.data.004'), message: t('ws.data.022') },
    );
    toast('ok', t('ws.data.023'));
  };

  const restoreSnapshot = async (id: string) => {
    const s = w.snapshots.find((x) => x.id === id)!;
    if (!(await confirm({ title: t('ws.data.024'), body: t('ws.data.025', { label: s.label, p1: fmtDateTime(s.at) }), confirm: t('ws.data.026') }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: uid('snap_'), at: nowIso(), label: t('ws.data.027'), process: structuredClone(d.asIs) }].slice(-15);
        d.asIs = structuredClone(s.process);
        d.validationAcceptedAt = undefined;
      },
      { area: t('ws.data.004'), message: t('ws.data.029', { label: s.label }) },
    );
  };

  return (
    <div className="space-y-4">
      {w.scenarios.length > 0 && (
        <Callout tone="info">{t('ws.data.030')}</Callout>
      )}
      <Card title={t('ws.data.031')} subtitle={t('ws.data.032')}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t('ws.data.033')} required className="md:col-span-2">
            {(f) => <Input {...f} value={p.name} onChange={(e) => setProc({ name: e.target.value })} />}
          </Field>
          <Field label={t('ws.data.034')}>{(f) => <Input {...f} value={p.area ?? ''} onChange={(e) => setProc({ area: e.target.value || undefined })} />}</Field>
          <Field label={t('ws.data.035')} className="md:col-span-2">
            {(f) => <Textarea {...f} value={p.description ?? ''} onChange={(e) => setProc({ description: e.target.value || undefined })} />}
          </Field>
          <Field label={t('ws.data.036')}>{(f) => <Input {...f} value={p.processOwner ?? ''} onChange={(e) => setProc({ processOwner: e.target.value || undefined })} />}</Field>
          <div className="flex gap-2">
            <Field label={t('ws.data.037')} help={t('ws.data.038')} className="flex-1">
              {(f) => <NumberInput {...f} value={p.volume} onChange={(v) => setProc({ volume: v })} />}
            </Field>
            <Field label={t('ws.data.039')} className="w-28">
              {(f) => (
                <Select {...f} value={p.volumePeriod} onChange={(e) => setProc({ volumePeriod: e.target.value as Period })}>
                  <option value="dia">{t('ws.data.040')}</option>
                  <option value="semana">{t('ws.data.041')}</option>
                  <option value="mes">{t('ws.data.042')}</option>
                  <option value="ano">{t('ws.data.043')}</option>
                </Select>
              )}
            </Field>
          </div>
          {p.volumePeriod === 'dia' && (
            <Field label={t('ws.data.044')} help={t('ws.data.045')}>
              {(f) => <NumberInput {...f} value={p.operatingDaysPerMonth} onChange={(v) => setProc({ operatingDaysPerMonth: v })} />}
            </Field>
          )}
          <Field label={t('ws.data.046')} help={t('ws.data.047')}>
            {(f) => <NumberInput {...f} value={p.hoursPerDay} onChange={(v) => v && v <= 24 && setProc({ hoursPerDay: v })} />}
          </Field>
          <Field label={t('ws.data.048')} help={t('ws.data.049')}>
            {(f) => <NumberInput {...f} value={p.defaultCostPerHour} onChange={(v) => setProc({ defaultCostPerHour: v })} />}
          </Field>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink2 md:col-span-3">
            <input type="checkbox" className="h-4 w-4" checked={!!p.variableCostIncludesLabor} onChange={(e) => setProc({ variableCostIncludesLabor: e.target.checked })} />{t('ws.data.050')}</label>
        </div>
        {owners.length > 0 && (
          <details className="mt-3 rounded-xl border border-line/15 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">{t('ws.data.051')}{Object.keys(p.costPerHourByRole).length}/{owners.length}{t('ws.data.052')}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {owners.map((o) => (
                <Field key={o} label={o}>
                  {(f) => (
                    <NumberInput
                      {...f}
                      value={p.costPerHourByRole[o]}
                      onChange={(v) =>
                        update((d) => {
                          if (v === undefined) delete d.asIs.costPerHourByRole[o];
                          else d.asIs.costPerHourByRole[o] = v;
                        })
                      }
                      placeholder={t('ws.data.053')}
                    />
                  )}
                </Field>
              ))}
            </div>
          </details>
        )}
      </Card>

      <Card
        title={t('ws.data.054', { length: acts.length })}
        subtitle={t('ws.data.055')}
        action={
          <Button
            size="sm"
            onClick={() => {
              setIsNew(true);
              setEditing(newActivity({ id: nextActivityId(p), stage: p.stageOrder[p.stageOrder.length - 1] ?? t('ws.data.056'), name: '', order: Math.max(0, ...p.activities.map((a) => a.order)) + 1 }));
            }}
          >
            <Plus className="h-4 w-4" />{t('ws.data.057')}</Button>
        }
      >
        <div className="hidden md:block">
          <Table caption={t('ws.data.058')}>
            <thead>
              <tr>
                {['#', t('ws.data.059'), t('ws.data.060'), t('ws.data.061'), t('ws.data.062'), t('ws.data.063'), t('ws.data.064'), t('ws.data.065'), t('ws.data.066'), ''].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {acts.map((a) => (
                <tr key={a.id} className="hover:bg-surface2/50">
                  <td className={clsx(td, 'tabular')}>{a.order}</td>
                  <td className={clsx(td, 'font-mono text-xs')}>{a.id}</td>
                  <td className={td}>{a.stage}</td>
                  <td className={clsx(td, 'text-ink')}>
                    <button type="button" className="text-left font-medium hover:text-brand" onClick={() => (setIsNew(false), setEditing(structuredClone(a)))}>
                      {a.name}
                    </button>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {a.rework && <Badge tone="amber">{t('ws.data.067')}</Badge>}
                      {a.critical && <Badge tone="violet">{t('ws.data.068')}</Badge>}
                      {issueCount(a.id) > 0 && <Badge tone="bad">{issueCount(a.id)}{t('ws.data.069')}</Badge>}
                      {a.flowInferred && <Badge tone="muted">{t('ws.data.070')}</Badge>}
                    </div>
                  </td>
                  <td className={td}>{TYPE_LABEL[a.type]}</td>
                  <td className={clsx(td, 'tabular')}>{a.type === 'task' ? fmtDuration(a.duration, a.unit) : '—'}</td>
                  <td className={clsx(td, 'tabular')}>{a.people ?? '—'}</td>
                  <td className={td}>{a.owner ?? '—'}</td>
                  <td className={td}>{a.type === 'task' || a.type === 'decision' ? LEAN_LABEL[a.lean ?? 'U'] : '—'}</td>
                  <td className={clsx(td, 'whitespace-nowrap')}>
                    <Button size="sm" variant="ghost" aria-label={t('ws.data.071', { name: a.name })} onClick={() => (setIsNew(false), setEditing(structuredClone(a)))}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={t('ws.data.072', { name: a.name })} onClick={() => void remove(a)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <ul className="space-y-2 md:hidden">
          {acts.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => (setIsNew(false), setEditing(structuredClone(a)))} className="w-full rounded-xl border border-line/15 bg-surface2/40 p-3 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{a.id}</span>
                  <span className="font-semibold text-ink">{a.name}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-ink2">
                  <span>{a.stage}</span>
                  <span>· {TYPE_LABEL[a.type]}</span>
                  {a.type === 'task' && <span>· {fmtDuration(a.duration, a.unit)}</span>}
                  {a.owner && <span>· {a.owner}</span>}
                  {issueCount(a.id) > 0 && <Badge tone="bad">{issueCount(a.id)}{t('ws.data.069')}</Badge>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('ws.data.074')} subtitle={t('ws.data.075')}>
          <p className="text-sm text-ink2">{t('ws.data.076')}<Term k="asis">{t('ws.data.004')}</Term>{t('ws.data.078')}{w.source.kind === 'import' ? t('ws.data.079', { fileName: w.source.fileName }) : w.source.kind === 'demo' ? t('ws.data.080') : t('ws.data.081')}{t('ws.data.082')}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => void restoreBaseline()}>
            <RotateCcw className="h-4 w-4" />{t('ws.data.083')}</Button>
          {w.snapshots.length > 0 && (
            <ul className="mt-3 divide-y divide-line/10 text-sm">
              {[...w.snapshots].reverse().map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-ink2">
                    {s.label} <span className="text-muted">· {fmtDateTime(s.at)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void restoreSnapshot(s.id)}>{t('ws.data.019')}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('ws.data.085')} subtitle={<span className="inline-flex items-center gap-1"><History className="h-3 w-3" />{t('ws.data.086')}</span>}>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {[...w.history].reverse().slice(0, 60).map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-xs text-muted tabular">{fmtDateTime(h.at)}</span>
                <span className="text-ink2">
                  <strong className="text-ink">{h.area}:</strong> {h.message}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={isNew ? t('ws.data.087') : t('ws.data.088', { p0: editing?.id ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('ws.data.089')}</Button>
            <Button onClick={saveActivity}>{t('ws.data.090')}</Button>
          </>
        }
      >
        {editing && <ActivityForm value={editing} onChange={setEditing} all={p.activities} stages={p.stageOrder} />}
      </Drawer>
    </div>
  );
}
