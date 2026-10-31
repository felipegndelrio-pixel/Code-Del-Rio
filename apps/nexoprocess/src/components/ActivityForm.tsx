// Formulário de atividade com modo básico e campos avançados sob demanda.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { LEAN_REASON_LABEL, type Activity, type DurationUnit, type ElementType, type LeanClass, type LeanReason } from '../domain/types';
import { Field, Input, NumberInput, Select, Term, Textarea } from './ui';

import { useI18n } from '../i18n/I18nProvider';
export function ActivityForm({ value, onChange, all, stages, errors = {} }: { value: Activity; onChange: (a: Activity) => void; all: Activity[]; stages: string[]; errors?: Record<string, string> }) {
  const { t } = useI18n();
  const [adv, setAdv] = useState(false);
  const set = (patch: Partial<Activity>) => onChange({ ...value, ...patch });
  const others = all.filter((a) => a.id !== value.id).sort((a, b) => a.order - b.order);
  const isWork = value.type === 'task' || value.type === 'decision';
  const refSelect = (label: string, v: string | undefined, on: (x: string | undefined) => void, help?: string) => (
    <Field label={label} help={help}>
      {(p) => (
        <Select {...p} value={v ?? ''} onChange={(e) => on(e.target.value || undefined)}>
          <option value="">{t('ws.form.001')}</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} · {a.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ws.form.002')} required error={errors.name} className="sm:col-span-2">
          {(p) => <Input {...p} value={value.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field label={t('ws.form.003')} help={t('ws.form.004')}>
          {(p) => (
            <>
              <Input {...p} list="np-stages" value={value.stage} onChange={(e) => set({ stage: e.target.value })} />
              <datalist id="np-stages">
                {stages.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t('ws.form.005')}>
          {(p) => (
            <Select {...p} value={value.type} onChange={(e) => set({ type: e.target.value as ElementType })}>
              <option value="start">{t('ws.form.006')}</option>
              <option value="task">{t('ws.form.007')}</option>
              <option value="decision">{t('ws.form.008')}</option>
              <option value="end">{t('ws.form.009')}</option>
            </Select>
          )}
        </Field>
        {isWork && (
          <>
            <div className="flex gap-2">
              <Field label={<>{t('ws.form.010')}<Term k="active" iconOnly /></>} help={t('ws.form.011')} className="flex-1">
                {(p) => <NumberInput {...p} value={value.duration} onChange={(v) => set({ duration: v })} />}
              </Field>
              <Field label={t('ws.form.012')} className="w-28">
                {(p) => (
                  <Select {...p} value={value.unit} onChange={(e) => set({ unit: e.target.value as DurationUnit })}>
                    <option value="min">{t('ws.form.013')}</option>
                    <option value="h">{t('ws.form.014')}</option>
                    <option value="d">{t('ws.form.015')}</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label={t('ws.form.016')} help={t('ws.form.017')}>
              {(p) => <NumberInput {...p} value={value.wait} onChange={(v) => set({ wait: v })} />}
            </Field>
            <Field label={t('ws.form.018')}>{(p) => <Input {...p} value={value.owner ?? ''} onChange={(e) => set({ owner: e.target.value || undefined })} />}</Field>
            <Field label={<>{t('ws.form.019')}<Term k="effort" iconOnly /></>}>
              {(p) => <NumberInput {...p} value={value.people} onChange={(v) => set({ people: v })} />}
            </Field>
            <Field label={<>{t('ws.form.020')}<Term k="lean" iconOnly /></>} className="sm:col-span-2">
              {(p) => (
                <Select
                  {...p}
                  value={value.lean ?? ''}
                  onChange={(e) => {
                    const lean = (e.target.value || undefined) as LeanClass | undefined;
                    set(lean === 'NNVA' ? { lean } : { lean, leanReason: undefined, leanReasonNote: undefined });
                  }}
                >
                  <option value="">{t('ws.form.021')}</option>
                  <option value="VA">{t('ws.form.022')}</option>
                  <option value="NNVA">{t('ws.form.023')}</option>
                  <option value="W">{t('ws.form.024')}</option>
                </Select>
              )}
            </Field>
            {value.lean === 'NNVA' && (
              <>
                <Field label={t('ws.form.025')} help={t('ws.form.026')}>
                  {(p) => (
                    <Select {...p} value={value.leanReason ?? ''} onChange={(e) => set({ leanReason: (e.target.value || undefined) as LeanReason | undefined })}>
                      <option value="">{t('ws.form.027')}</option>
                      {Object.entries(LEAN_REASON_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t('ws.form.028')} help={t('ws.form.029')}>
                  {(p) => <Input {...p} value={value.leanReasonNote ?? ''} onChange={(e) => set({ leanReasonNote: e.target.value || undefined })} />}
                </Field>
              </>
            )}
          </>
        )}
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line/15 p-3">
        <legend className="px-1 text-sm font-semibold text-ink">{t('ws.form.030')}</legend>
        {value.type === 'decision' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {refSelect(t('ws.form.031'), value.nextYes, (x) => set({ nextYes: x }))}
            {refSelect(t('ws.form.032'), value.nextNo, (x) => set({ nextNo: x }))}
          </div>
        ) : value.type === 'end' ? (
          <p className="text-sm text-muted">{t('ws.form.033')}</p>
        ) : (
          <>
            {refSelect(t('ws.form.034'), value.next[0], (x) => set({ next: [x, ...value.next.slice(1)].filter(Boolean) as string[], flowInferred: false }))}
            {value.next.length > 1 && <p className="text-xs text-muted">{t('ws.form.035')}{value.next.slice(1).join(', ')}</p>}
            {refSelect(t('ws.form.036'), value.next[1], (x) => set({ next: [value.next[0], x].filter(Boolean) as string[], flowInferred: false }), t('ws.form.037'))}
          </>
        )}
        {value.flowInferred && <p className="text-xs text-amber">{t('ws.form.038')}</p>}
      </fieldset>

      {isWork && (
        <div>
          <button type="button" aria-expanded={adv} onClick={() => setAdv((a) => !a)} className="inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold text-brand">
            <ChevronDown className={`h-4 w-4 transition ${adv ? 'rotate-180' : ''}`} aria-hidden />{t('ws.form.040')}</button>
          {adv && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label={t('ws.form.041')}>{(p) => <NumberInput {...p} value={value.order} onChange={(v) => set({ order: v ?? value.order })} />}</Field>
              <Field label={t('ws.form.042')} help={t('ws.form.043')}>
                {(p) => <NumberInput {...p} value={value.frequencyPct} onChange={(v) => set({ frequencyPct: v })} />}
              </Field>
              <Field label={t('ws.form.044')} help={t('ws.form.045')}>
                {(p) => <NumberInput {...p} value={value.minDuration} onChange={(v) => set({ minDuration: v })} />}
              </Field>
              <Field label={t('ws.form.046')} help={t('ws.form.045')}>
                {(p) => <NumberInput {...p} value={value.maxDuration} onChange={(v) => set({ maxDuration: v })} />}
              </Field>
              <Field label={t('ws.form.048')} help={t('ws.form.049')}>
                {(p) => <NumberInput {...p} value={value.costPerHour} onChange={(v) => set({ costPerHour: v })} />}
              </Field>
              <Field label={t('ws.form.050')}>{(p) => <NumberInput {...p} value={value.variableCost} onChange={(v) => set({ variableCost: v })} />}</Field>
              <Field label={t('ws.form.051')} help={t('ws.form.052')}>
                {(p) => <NumberInput {...p} value={value.volume} onChange={(v) => set({ volume: v })} />}
              </Field>
              <div className="flex flex-col gap-2 pt-6">
                <label className="flex min-h-[32px] items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={!!value.rework} onChange={(e) => set({ rework: e.target.checked || undefined })} />{t('ws.form.053')}<Term k="rework" iconOnly />
                </label>
                <label className="flex min-h-[32px] items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4" checked={!!value.critical} onChange={(e) => set({ critical: e.target.checked || undefined })} />{t('ws.form.054')}</label>
              </div>
              <Field label={t('ws.form.055')} className="sm:col-span-2">
                {(p) => <Textarea {...p} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />}
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
