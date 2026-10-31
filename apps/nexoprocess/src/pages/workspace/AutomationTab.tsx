// Oportunidades de automação e IA: avaliação por critérios explícitos,
// checklist de prontidão e acompanhamento por etapas. A ferramenta sugere;
// uma pessoa valida.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Badge, Callout, Card, Field, Input, Select, Textarea } from '../../components/ui';
import { AI_STAGES, automationScore, automationVerdict, CHECKLIST, CRITERIA } from '../../domain/advanced';
import { LEAN_LABEL, PERIOD_LABEL, type AiStage, type AutomationAssessment } from '../../domain/types';
import { fmtHours, fmtNum, fmtPct } from '../../domain/units';
import { useWorkspace } from '../../state/workspace';

import { useI18n } from '../../i18n/I18nProvider';
const blank = (activityId: string): AutomationAssessment => ({ activityId, answers: {}, checklist: {}, stage: 'descoberta' });

export default function AutomationTab() {
  const { t } = useI18n();
  const { w, update, metrics } = useWorkspace();
  const per = PERIOD_LABEL[w.asIs.volumePeriod];
  // Candidatas ordenadas por evidência observável: esforço no período (ou por execução).
  const candidates = useMemo(
    () =>
      metrics.workItems
        .filter((a) => a.type === 'task')
        .map((a) => ({ a, m: metrics.per.get(a.id)! }))
        .sort((x, y) => (y.m.effortPeriodH ?? y.m.effortH ?? 0) - (x.m.effortPeriodH ?? x.m.effortH ?? 0)),
    [metrics],
  );
  const [sel, setSel] = useState<string>(Object.keys(w.automation)[0] ?? candidates[0]?.a.id ?? '');
  const cur = w.automation[sel] ?? blank(sel);
  const act = candidates.find((c) => c.a.id === sel);
  const score = automationScore(cur);
  const set = (patch: Partial<AutomationAssessment>, msg?: string) =>
    update(
      (d) => {
        d.automation[sel] = { ...(d.automation[sel] ?? blank(sel)), ...patch };
      },
      msg ? { area: t('ws.auto.001'), message: msg } : undefined,
    );
  const totalEffort = metrics.effortPeriodH.value;

  return (
    <div className="space-y-4">
      <Callout tone="info" title={t('ws.auto.002')}>{t('ws.auto.003')}</Callout>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title={t('ws.auto.004')} subtitle={t('ws.auto.005')}>
          <ul className="max-h-[520px] space-y-1 overflow-y-auto">
            {candidates.map(({ a, m }) => {
              const s = w.automation[a.id] ? automationScore(w.automation[a.id]).score : null;
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => setSel(a.id)} aria-pressed={sel === a.id} className={clsx('w-full rounded-xl border px-3 py-2 text-left text-sm', sel === a.id ? 'border-brand bg-brand/10' : 'border-line/15 hover:border-brand/40')}>
                    <span className="block font-medium text-ink">{a.name}</span>
                    <span className="text-xs text-muted">
                      {m.effortPeriodH !== null ? t('ws.auto.006', { p0: fmtNum(m.effortPeriodH), per }) : m.effortH !== null ? t('ws.auto.007', { p0: fmtNum(m.effortH) }) : t('ws.auto.008')} · {LEAN_LABEL[a.lean ?? 'U']}
                      {s !== null && t('ws.auto.009', { p0: fmtNum(s, 0) })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {act ? (
          <div className="space-y-4">
            <Card title={act.a.name} subtitle={t('ws.auto.010')}>
              <ul className="grid gap-2 text-sm text-ink2 sm:grid-cols-2">
                <li>{t('ws.auto.011')}{fmtHours(act.m.activeH)}{t('ws.auto.012')}</li>
                <li>{t('ws.auto.013')}{act.a.people ?? t('ws.auto.014')}</li>
                <li>{t('ws.auto.015')}{act.m.execPerPeriod !== null ? `${fmtNum(act.m.execPerPeriod)}/${per}` : t('ws.auto.016')}</li>
                <li>{t('ws.auto.017')}{act.m.effortPeriodH !== null ? t('ws.auto.018', { p0: fmtNum(act.m.effortPeriodH) }) : '—'}
                  {act.m.effortPeriodH !== null && totalEffort ? t('ws.auto.019', { p0: fmtPct((act.m.effortPeriodH / totalEffort) * 100) }) : ''}
                </li>
                <li>{t('ws.auto.020')}{LEAN_LABEL[act.a.lean ?? 'U']}</li>
                <li>{act.a.rework ? t('ws.auto.021') : t('ws.auto.022')}{act.a.critical ? t('ws.auto.023') : ''}</li>
              </ul>
              <p className="mt-3 text-sm text-ink2">
                <strong className="text-ink">{t('ws.auto.024')}</strong>{' '}
                {act.m.effortPeriodH !== null ? t('ws.auto.025', { p0: fmtNum(act.m.effortPeriodH), per }) : t('ws.auto.026')}
              </p>
            </Card>

            <Card title={t('ws.auto.027')} subtitle={t('ws.auto.028')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {CRITERIA.map((c) => (
                  <Field key={c.key} label={c.label} help={c.help}>
                    {(f) => (
                      <Select {...f} value={cur.answers[c.key] ?? ''} onChange={(e) => set({ answers: { ...cur.answers, [c.key]: e.target.value ? Number(e.target.value) : undefined } })}>
                        <option value="">{t('ws.auto.029')}</option>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-line/15 bg-surface2/50 p-3 text-sm">
                <p>
                  <strong className="text-ink">{t('ws.auto.030')}</strong> {score.score === null ? t('ws.auto.031', { answered: score.answered }) : t('ws.auto.032', { p0: fmtNum(score.score, 0) })}
                </p>
                <p className="text-ink2">{automationVerdict(score.score, cur.answers.julgamento)}</p>
                <p className="mt-1 text-xs text-muted">{t('ws.auto.033')}</p>
              </div>
            </Card>

            <Card title={t('ws.auto.034')} subtitle={t('ws.auto.035')}>
              <ul className="space-y-1">
                {CHECKLIST.map((c) => (
                  <li key={c.key}>
                    <label className="flex min-h-[36px] items-center gap-2 text-sm text-ink2">
                      <input type="checkbox" className="h-4 w-4" checked={!!cur.checklist[c.key]} onChange={(e) => set({ checklist: { ...cur.checklist, [c.key]: e.target.checked } })} />
                      {c.label}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                {Object.values(cur.checklist).filter(Boolean).length}/{CHECKLIST.length}{t('ws.auto.036')}</p>
            </Card>

            <Card title={t('ws.auto.037')} subtitle={t('ws.auto.038')}>
              <ol className="flex flex-wrap gap-2">
                {AI_STAGES.map((s) => (
                  <li key={s.key}>
                    <button type="button" aria-pressed={cur.stage === s.key} onClick={() => set({ stage: s.key as AiStage }, t('ws.auto.039', { name: act.a.name, label: s.label }))} className={clsx('min-h-[40px] rounded-xl border px-3 text-sm font-semibold', cur.stage === s.key ? 'border-brand bg-brand/15 text-ink' : 'border-line/15 text-ink2')}>
                      {s.label}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label={t('ws.auto.040')} help={t('ws.auto.041')}>
                  {(f) => <Input {...f} value={cur.nextTest ?? ''} onChange={(e) => set({ nextTest: e.target.value || undefined })} />}
                </Field>
                <Field label={t('ws.auto.042')}>{(f) => <Textarea {...f} value={cur.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />}</Field>
              </div>
              {cur.stage === 'descontinuada' && <Badge tone="muted">{t('ws.auto.043')}</Badge>}
            </Card>
          </div>
        ) : (
          <Callout tone="info">{t('ws.auto.044')}</Callout>
        )}
      </div>
    </div>
  );
}
