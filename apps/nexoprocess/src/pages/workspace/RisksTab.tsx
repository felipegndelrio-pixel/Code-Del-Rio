import { useState } from 'react';
import clsx from 'clsx';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Drawer, Empty, Field, HowCalc, Input, NumberInput, Select, Table, td, Term, Textarea, th, useConfirm } from '../../components/ui';
import { fmeaPriority, riskLevel, riskScore, rpn } from '../../domain/advanced';
import type { Risk, RiskStatus } from '../../domain/types';
import { uid } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
const STATUS: Record<RiskStatus, string> = { aberto: 'Aberto', mitigando: 'Mitigando', fechado: 'Fechado' };
const clampInt = (v: number | undefined, max: number) => (v === undefined ? undefined : Math.min(max, Math.max(1, Math.round(v))));

export default function RisksTab() {
  const { t } = useI18n();
  const { w, update } = useWorkspace();
  const confirm = useConfirm();
  const [edit, setEdit] = useState<Risk | null>(null);
  const tasks = w.asIs.activities.filter((a) => a.type === 'task' || a.type === 'decision');
  const critNoRisk = w.asIs.activities.filter((a) => a.critical && !w.risks.some((r) => r.activityId === a.id));

  const save = () => {
    if (!edit?.description.trim()) return;
    update(
      (d) => {
        const i = d.risks.findIndex((r) => r.id === edit.id);
        if (i >= 0) d.risks[i] = edit;
        else d.risks.push(edit);
      },
      { area: 'Riscos', message: t('ws.risk.001', { description: edit.description }) },
    );
    setEdit(null);
  };
  const sorted = [...w.risks].sort((a, b) => (rpn(b) ?? -1) - (rpn(a) ?? -1) || (riskScore(b) ?? -1) - (riskScore(a) ?? -1));

  return (
    <div className="space-y-4">
      <Card
        title={t('ws.risk.002')}
        subtitle={t('ws.risk.003')}
        action={
          <Button size="sm" onClick={() => setEdit({ id: uid('r_'), description: '', status: 'aberto' })}>
            <Plus className="h-4 w-4" />{t('ws.risk.004')}</Button>
        }
      >
        {critNoRisk.length > 0 && (
          <p className="mb-3 text-sm text-ink2">{t('ws.risk.005')}{' '}
            {critNoRisk.map((a) => (
              <button key={a.id} type="button" className="mr-2 font-semibold text-brand hover:underline" onClick={() => setEdit({ id: uid('r_'), description: t('ws.risk.006', { name: a.name }), activityId: a.id, status: 'aberto' })}>
                {a.name}
              </button>
            ))}
          </p>
        )}
        {!w.risks.length ? (
          <Empty title={t('ws.risk.007')}>{t('ws.risk.008')}</Empty>
        ) : (
          <Table caption={t('ws.risk.009')}>
            <thead>
              <tr>
                {['Risco', 'Atividade', 'P × I', 'FMEA (RPN)', t('ws.risk.012'), t('ws.risk.013'), t('ws.risk.014'), ''].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const sc = riskScore(r);
                const lvl = riskLevel(sc);
                const v = rpn(r);
                const fp = fmeaPriority(r);
                return (
                  <tr key={r.id}>
                    <td className={clsx(td, 'text-ink')}>{r.description}</td>
                    <td className={td}>{w.asIs.activities.find((a) => a.id === r.activityId)?.name ?? '—'}</td>
                    <td className={td}>{sc === null ? <span className="text-muted">{t('ws.risk.015')}</span> : <Badge tone={lvl === 'alto' ? 'bad' : lvl === 'médio' ? 'amber' : 'ok'}>{sc} · {lvl}</Badge>}</td>
                    <td className={td}>{v === null ? <span className="text-muted">—</span> : <Badge tone={fp === 'alta' ? 'bad' : 'muted'}>{v}{fp === 'alta' ? t('ws.risk.016') : ''}</Badge>}</td>
                    <td className={td}>{r.control ?? '—'}</td>
                    <td className={td}>{r.owner ?? '—'}</td>
                    <td className={td}>{STATUS[r.status]}</td>
                    <td className={clsx(td, 'whitespace-nowrap')}>
                      <Button size="sm" variant="ghost" aria-label={t('ws.risk.017')} onClick={() => setEdit(structuredClone(r))}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={t('ws.risk.018')} onClick={async () => (await confirm({ title: t('ws.risk.019'), body: r.description, confirm: t('ws.risk.020'), danger: true })) && update((d) => void (d.risks = d.risks.filter((x) => x.id !== r.id)), { area: 'Riscos', message: t('ws.risk.021', { description: r.description }) })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <HowCalc>
          <p>{t('ws.risk.022')}</p>
          <p>
            <Term k="fmea">FMEA</Term>{t('ws.risk.024')}</p>
        </HowCalc>
      </Card>

      <Drawer
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit && w.risks.some((r) => r.id === edit.id) ? t('ws.risk.025') : t('ws.risk.026')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)}>{t('ws.risk.027')}</Button>
            <Button onClick={save} disabled={!edit?.description.trim()}>{t('ws.risk.028')}</Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label={t('ws.risk.029')} required>{(f) => <Textarea {...f} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
            <Field label={t('ws.risk.030')}>
              {(f) => (
                <Select {...f} value={edit.activityId ?? ''} onChange={(e) => setEdit({ ...edit, activityId: e.target.value || undefined })}>
                  <option value="">{t('ws.risk.031')}</option>
                  {tasks.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('ws.risk.032')}>{(f) => <NumberInput {...f} value={edit.probability} onChange={(v) => setEdit({ ...edit, probability: clampInt(v, 5) })} />}</Field>
              <Field label={t('ws.risk.033')}>{(f) => <NumberInput {...f} value={edit.impact} onChange={(v) => setEdit({ ...edit, impact: clampInt(v, 5) })} />}</Field>
            </div>
            <Field label={t('ws.risk.034')}>{(f) => <Textarea {...f} value={edit.control ?? ''} onChange={(e) => setEdit({ ...edit, control: e.target.value || undefined })} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('ws.risk.035')}>{(f) => <Input {...f} value={edit.owner ?? ''} onChange={(e) => setEdit({ ...edit, owner: e.target.value || undefined })} />}</Field>
              <Field label={t('ws.risk.036')}>
                {(f) => (
                  <Select {...f} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as RiskStatus })}>
                    {Object.entries(STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <details className="rounded-xl border border-line/15 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-ink">{t('ws.risk.037')}</summary>
              <div className="mt-3 space-y-3">
                <Field label={t('ws.risk.038')}>{(f) => <Input {...f} value={edit.failureMode ?? ''} onChange={(e) => setEdit({ ...edit, failureMode: e.target.value || undefined })} />}</Field>
                <Field label={t('ws.risk.039')}>{(f) => <Input {...f} value={edit.effect ?? ''} onChange={(e) => setEdit({ ...edit, effect: e.target.value || undefined })} />}</Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label={t('ws.risk.040')}>{(f) => <NumberInput {...f} value={edit.severity} onChange={(v) => setEdit({ ...edit, severity: clampInt(v, 10) })} />}</Field>
                  <Field label={t('ws.risk.041')}>{(f) => <NumberInput {...f} value={edit.occurrence} onChange={(v) => setEdit({ ...edit, occurrence: clampInt(v, 10) })} />}</Field>
                  <Field label={t('ws.risk.042')} help={t('ws.risk.043')}>{(f) => <NumberInput {...f} value={edit.detection} onChange={(v) => setEdit({ ...edit, detection: clampInt(v, 10) })} />}</Field>
                </div>
              </div>
            </details>
          </div>
        )}
      </Drawer>
    </div>
  );
}
