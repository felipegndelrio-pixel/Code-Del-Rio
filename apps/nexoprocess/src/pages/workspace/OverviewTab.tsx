// Visão geral do projeto: onde está, o que falta, próxima ação — só com
// números reais e com a origem de cada um.
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowRight, Check, CircleDashed, Lock, Share2 } from 'lucide-react';
import { BasisTag, Button, Card, Stat, useToast } from '../../components/ui';
import { compareScenarios } from '../../domain/compare';
import { journey } from '../../domain/journey';
import { bottlenecks, dataGaps } from '../../domain/metrics';
import { PERIOD_LABEL } from '../../domain/types';
import { fmtBRL, fmtDateTime, fmtHours, fmtNum, fmtPct } from '../../domain/units';
import { shareProject } from '../../state/actions';
import { useWorkspace } from '../../state/workspace';
import { STEP_PATH } from '../../config/nav';
import { demoBlocked } from '../../license/demo';

import { useI18n } from '../../i18n/I18nProvider';
export default function OverviewTab() {
  const { t } = useI18n();
  const { w, metrics: m, issues } = useWorkspace();
  const nav = useNavigate();
  const toast = useToast();
  const j = useMemo(() => journey(w), [w]);
  const base = `/app/p/${w.id}`;
  const p = w.asIs;
  const per = PERIOD_LABEL[p.volumePeriod];
  const sc = w.scenarios.find((s) => s.id === w.activeScenarioId) ?? w.scenarios[0];
  const cmp = useMemo(() => (sc ? compareScenarios(p, sc) : null), [p, sc]);
  const bn = bottlenecks(p, m, w.bottleneck.criterion, w.bottleneck.thresholdPct);
  const gaps = dataGaps(p, m);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const done = j.steps.filter((s) => s.state === 'feito').length;
  const actionsDone = w.actions.filter((a) => a.status === 'concluida').length;
  const top = bn.flagged[0];

  const share = async () => {
    if (demoBlocked('exportar')) return;
    try {
      const how = await shareProject(w);
      toast('ok', how === 'shared' ? t('ws.ov.001') : t('ws.ov.002'));
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast('bad', t('ws.ov.003'));
    }
  };

  return (
    <div className="space-y-5">
      {j.next && (
        <section className="rounded-2xl border border-brand/25 bg-brand/[0.04] p-4 sm:p-6" aria-labelledby="next-h">
          <p className="eyebrow">{t('ws.ov.004')}</p>
          <h3 id="next-h" className="mt-1 text-lg font-semibold">
            {j.next.label}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink2">{j.next.why}</p>
          <Button className="mt-4" onClick={() => nav(`${base}/${STEP_PATH[j.next!.key]}`)}>{t('ws.ov.005')}{j.next.short} <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card title={t('ws.ov.006')} subtitle={t('ws.ov.007', { done, length: j.steps.length })}>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label={t('ws.ov.008')} aria-valuenow={done} aria-valuemin={0} aria-valuemax={j.steps.length}>
            <div className="h-full rounded-full bg-accentStrong transition-all" style={{ width: `${(done / j.steps.length) * 100}%` }} />
          </div>
          <ol className="space-y-1">
            {j.steps.map((s) => (
              <li key={s.key}>
                <Link
                  to={`${base}/${STEP_PATH[s.key]}`}
                  className={clsx('flex min-h-[44px] items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface2', s.state === 'atual' && 'bg-accent/5')}
                >
                  <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', s.state === 'feito' ? 'bg-ok/15 text-ok' : s.state === 'atual' ? 'bg-accentStrong text-white' : 'bg-surface2 text-muted')}>
                    {s.state === 'feito' ? <Check className="h-3.5 w-3.5" aria-hidden /> : s.state === 'bloqueado' ? <Lock className="h-3 w-3" aria-hidden /> : s.n}
                  </span>
                  <span className={clsx('flex-1', s.state === 'feito' ? 'text-ink2' : 'text-ink')}>{s.label}</span>
                  <span className="text-xs text-muted">{s.state === 'feito' ? t('ws.ov.012') : s.state === 'atual' ? t('ws.ov.013') : s.state === 'bloqueado' ? t('ws.ov.059') : ''}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-5">
          <Card title={t('ws.ov.014')} subtitle={t('ws.ov.015')}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t('ws.ov.016')} value={`${p.stageOrder.length} · ${m.counts.tasks}`} sub={m.counts.decisions ? t('ws.ov.017', { decisions: m.counts.decisions }) : undefined} basis="informado" />
              <Stat label={t('ws.ov.018')} value={m.elapsed.status === 'ok' ? fmtHours(m.elapsed.hours) : ''} sub={t('ws.ov.019')} basis="estimado" missing={m.elapsed.status !== 'ok' ? t('ws.ov.020') : undefined} />
              <Stat label={t('ws.ov.021', { per })} value={m.effortPeriodH.value !== null ? t('ws.ov.022', { p0: fmtNum(m.effortPeriodH.value) }) : ''} basis="estimado" missing={m.effortPeriodH.value === null ? t('ws.ov.023') : undefined} />
              <Stat label={t('ws.ov.024')} value={top ? fmtPct(top.share) : ''} sub={top ? m.graph.byId.get(top.id)?.name : undefined} basis="calculado" missing={!top ? t('ws.ov.025') : undefined} />
            </div>
          </Card>

          <Card title={t('ws.ov.026')} subtitle={t('ws.ov.027')}>
            <ul className="space-y-2 text-sm">
              <PendItem ok={errors === 0} text={errors ? t('ws.ov.028', { errors }) : t('ws.ov.029')} to={`${base}/validar`} />
              <PendItem ok={warnings === 0} soft text={warnings ? t('ws.ov.030', { warnings }) : t('ws.ov.031')} to={`${base}/validar`} />
              {gaps.slice(0, 4).map((g) => (
                <PendItem key={g.field} ok={false} soft text={t('ws.ov.032', { label: g.label, missing: g.missing, total: g.total, unlocks: g.unlocks })} to={`${base}/dados`} />
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title={t('ws.ov.033')} subtitle={sc ? sc.name : t('ws.ov.034')}>
          {sc && cmp ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink2">{t('ws.ov.035')}</span>
                <span className="font-semibold tabular">
                  {cmp.business.freedHoursMonth !== null ? t('ws.ov.036', { p0: fmtNum(cmp.business.freedHoursMonth) }) : '—'} <BasisTag basis="estimado" />
                </span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink2">{t('ws.ov.037')}</span>
                <span className="font-semibold tabular">
                  {cmp.business.netBenefitMonth !== null ? t('ws.ov.038', { p0: fmtBRL(cmp.business.netBenefitMonth) }) : '—'} <BasisTag basis="estimado" />
                </span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-ink2">{t('ws.ov.039')}</span>
                <span className="font-semibold tabular">{cmp.business.paybackMonths === null ? '—' : cmp.business.paybackMonths === 0 ? 'imediato' : t('ws.ov.040', { p0: fmtNum(cmp.business.paybackMonths, 1) })}</span>
              </div>
              <p className="text-xs text-muted">{t('ws.ov.041')}</p>
              <Link to={`${base}/comparar`} className="inline-flex min-h-[32px] items-center gap-1 text-sm font-semibold text-accent hover:underline">{t('ws.ov.042')}<ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-ink2">{t('ws.ov.043')}{' '}
              <Link to={`${base}/tobe`} className="font-semibold text-accent hover:underline">{t('ws.ov.044')}</Link>
            </p>
          )}
        </Card>
        <Card title={t('ws.ov.045')} subtitle={t('ws.ov.046')}>
          <div className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink2">{t('ws.ov.047')}</span>
              <span className="font-semibold tabular">
                {actionsDone}{t('ws.ov.048')}{w.actions.length}
              </span>
            </div>
            {w.actions.length > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-label={t('ws.ov.049')} aria-valuenow={actionsDone} aria-valuemin={0} aria-valuemax={w.actions.length}>
                <div className="h-full rounded-full bg-ok" style={{ width: `${(actionsDone / w.actions.length) * 100}%` }} />
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink2">{t('ws.ov.050')}</span>
              <span className="font-semibold tabular">{w.results.filter((r) => !r.noData).length}</span>
            </div>
            <Link to={`${base}/plano`} className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-accent hover:underline">{t('ws.ov.051')}<ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Card>
      </div>

      <Card title={t('ws.ov.052')} subtitle={t('ws.ov.053')}>
        <p className="max-w-2xl text-sm text-ink2">{t('ws.ov.054')}<strong>{t('ws.ov.055')}</strong>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void share()}>
            <Share2 className="h-4 w-4" aria-hidden />{t('ws.ov.056')}</Button>
          <span className="text-xs text-muted">{t('ws.ov.057')}{fmtDateTime(w.createdAt)}{t('ws.ov.058')}{fmtDateTime(w.updatedAt)}</span>
        </div>
      </Card>
    </div>
  );
}

function PendItem({ ok, text, to, soft }: { ok: boolean; text: string; to: string; soft?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden /> : <CircleDashed className={clsx('mt-0.5 h-4 w-4 shrink-0', soft ? 'text-amber' : 'text-bad')} aria-hidden />}
      {ok ? (
        <span className="text-ink2">{text}</span>
      ) : (
        <Link to={to} className="text-ink2 underline-offset-2 hover:text-ink hover:underline">
          {text}
        </Link>
      )}
    </li>
  );
}
