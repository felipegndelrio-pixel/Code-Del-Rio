import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Wand2 } from 'lucide-react';
import { ActivityForm } from '../../components/ActivityForm';
import { Badge, Button, Callout, Card, Drawer, useConfirm, useToast } from '../../components/ui';
import { normalizeStages } from '../../domain/factory';
import { dataGaps } from '../../domain/metrics';
import type { Activity } from '../../domain/types';
import { fmtDateTime, nowIso } from '../../domain/units';
import type { Issue } from '../../domain/validation';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
export default function ValidateTab() {
  const { t } = useI18n();
  const { w, update, issues, metrics } = useWorkspace();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Activity | null>(null);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');
  const gaps = dataGaps(w.asIs, metrics);

  const applyFix = async (i: Issue) => {
    if (!i.autofix) return;
    if (!(await confirm({ title: t('ws.val.001'), body: <><p><strong>{t('ws.val.002')}</strong> {i.message}</p><p><strong>{t('ws.val.003')}</strong> {i.autofix.label}.</p><p>{t('ws.val.004')}</p></>, confirm: t('ws.val.005') }))) return;
    update(
      (d) => {
        d.snapshots = [...d.snapshots, { id: `snap_${Date.now()}`, at: nowIso(), label: t('ws.val.006', { label: i.autofix!.label }), process: structuredClone(d.asIs) }].slice(-15);
        d.asIs = i.autofix!.apply(d.asIs);
      },
      { area: t('ws.val.007'), message: t('ws.val.008', { label: i.autofix.label }) },
    );
    toast('ok', t('ws.val.009'));
  };

  const accept = () => {
    update((d) => void (d.validationAcceptedAt = nowIso()), { area: t('ws.val.010'), message: t('ws.val.011', { length: warnings.length }) });
    nav(`/app/p/${w.id}/mapa`);
  };

  const row = (i: Issue) => (
    <li key={i.id} className="rounded-xl border border-line/15 bg-surface2/40 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={i.severity === 'error' ? 'bad' : i.severity === 'warning' ? 'amber' : 'accent'}>{i.severity === 'error' ? t('ws.val.012') : i.severity === 'warning' ? 'Alerta' : t('ws.val.013')}</Badge>
        <p className="min-w-0 flex-1 font-medium text-ink">{i.message}</p>
      </div>
      <p className="mt-1 text-sm text-ink2">
        <strong>{t('ws.val.014')}</strong> {i.why}
      </p>
      <p className="text-sm text-ink2">
        <strong>{t('ws.val.015')}</strong> {i.fix}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {i.activityId && w.asIs.activities.some((a) => a.id === i.activityId) && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(structuredClone(w.asIs.activities.find((a) => a.id === i.activityId)!))}>{t('ws.val.016')}</Button>
        )}
        {i.autofix && (
          <Button size="sm" variant="secondary" onClick={() => void applyFix(i)}>
            <Wand2 className="h-4 w-4" />{t('ws.val.017')}{i.autofix.label}
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile n={errors.length} label={t('ws.val.018')} tone="bad" />
        <Tile n={warnings.length} label={t('ws.val.019')} tone="amber" />
        <Tile n={gaps.length} label={t('ws.val.020')} tone="accent" />
      </div>

      {errors.length === 0 ? (
        <Callout
          tone="ok"
          title={warnings.length ? t('ws.val.021') : t('ws.val.022')}
          action={
            <Button onClick={accept}>
              <CheckCircle2 className="h-4 w-4" /> {warnings.length ? t('ws.val.023', { length: warnings.length }) : t('ws.val.024')}
            </Button>
          }
        >
          {w.validationAcceptedAt ? t('ws.val.025', { p0: fmtDateTime(w.validationAcceptedAt) }) : t('ws.val.026')}
        </Callout>
      ) : (
        <Callout tone="bad" title={t('ws.val.027', { length: errors.length })}>{t('ws.val.028')}</Callout>
      )}

      {errors.length > 0 && (
        <Card title={t('ws.val.029')} tone="bad">
          <ul className="space-y-2">{errors.map(row)}</ul>
        </Card>
      )}
      {warnings.length > 0 && (
        <Card title={t('ws.val.030')}>
          <ul className="space-y-2">{warnings.map(row)}</ul>
        </Card>
      )}
      {gaps.length > 0 && (
        <Card title={t('ws.val.031')} subtitle={t('ws.val.032')}>
          <ul className="space-y-2 text-sm">
            {gaps.map((g) => (
              <li key={g.field} className="flex flex-wrap items-baseline gap-2">
                <Badge tone="accent">
                  {g.missing}/{g.total}
                </Badge>
                <span className="text-ink">{g.label}</span>
                <span className="text-ink2">{t('ws.val.033')}{g.unlocks}.</span>
              </li>
            ))}
          </ul>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => nav(`/app/p/${w.id}/dados`)}>{t('ws.val.034')}</Button>
        </Card>
      )}
      {infos.length > 0 && (
        <Card title={t('ws.val.035')}>
          <ul className="space-y-2">{infos.map(row)}</ul>
        </Card>
      )}

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t('ws.val.036', { p0: editing?.id ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('ws.val.037')}</Button>
            <Button
              onClick={() => {
                update(
                  (d) => {
                    const i = d.asIs.activities.findIndex((a) => a.id === editing!.id);
                    d.asIs.activities[i] = editing!;
                    d.asIs = normalizeStages(d.asIs);
                  },
                  { area: t('ws.val.038'), message: t('ws.val.039', { name: editing!.name }) },
                );
                setEditing(null);
              }}
            >{t('ws.val.040')}</Button>
          </>
        }
      >
        {editing && <ActivityForm value={editing} onChange={setEditing} all={w.asIs.activities} stages={w.asIs.stageOrder} />}
      </Drawer>
    </div>
  );
}

function Tile({ n, label, tone }: { n: number; label: string; tone: 'bad' | 'amber' | 'accent' }) {
  return (
    <div className="rounded-xl border border-line/15 bg-surface p-3 shadow-card">
      <p className={`text-2xl font-bold ${n === 0 ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'amber' ? 'text-amber' : 'text-accent'}`}>{n}</p>
      <p className="text-xs text-ink2">{label}</p>
    </div>
  );
}
