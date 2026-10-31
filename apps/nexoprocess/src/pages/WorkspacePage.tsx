// Shell do projeto (V4): barra lateral por fase no desktop; barra inferior e
// menu de etapas no celular; breadcrumbs; cabeçalho de etapa com objetivo e
// requisitos reais; salvamento visível; desfazer.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertOctagon, ArrowRight, Check, ChevronRight, CircleDashed, CloudOff, Loader2, Lock, Menu, RotateCcw, Undo2 } from 'lucide-react';
import { Badge, Button, Drawer, Empty, PageSkeleton, useToast } from '../components/ui';
import { MOBILE_TABS, navFor, STEP_PATH, type NavItem } from '../config/nav';
import { journey, STEP_OBJECTIVE, stepRequirements, type JourneyStep } from '../domain/journey';
import type { Workspace } from '../domain/types';
import { fmtDateTime } from '../domain/units';
import { db, storageMode } from '../storage/db';
import { useWorkspace, WorkspaceProvider } from '../state/workspace';
import { BackButton } from '../components/BackButton';

import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
const OverviewTab = lazy(() => import('./workspace/OverviewTab'));
const DataTab = lazy(() => import('./workspace/DataTab'));
const ValidateTab = lazy(() => import('./workspace/ValidateTab'));
const MapTab = lazy(() => import('./workspace/MapTab'));
const DiagnosisTab = lazy(() => import('./workspace/DiagnosisTab'));
const RecsTab = lazy(() => import('./workspace/RecsTab'));
const ToBeTab = lazy(() => import('./workspace/ToBeTab'));
const CompareTab = lazy(() => import('./workspace/CompareTab'));
const PlanTab = lazy(() => import('./workspace/PlanTab'));
const ResultsTab = lazy(() => import('./workspace/ResultsTab'));
const RisksTab = lazy(() => import('./workspace/RisksTab'));
const RaciTab = lazy(() => import('./workspace/RaciTab'));
const SimulationTab = lazy(() => import('./workspace/SimulationTab'));
const AutomationTab = lazy(() => import('./workspace/AutomationTab'));
const ExportTab = lazy(() => import('./workspace/ExportTab'));
const ReportPage = lazy(() => import('./workspace/ReportPage'));


/** Navegação do projeto no idioma ativo. */
function useNav() {
  const { locale } = useI18n();
  return useMemo(() => {
    const groups = navFor(locale);
    return { NAV: groups, NAV_ITEMS: groups.flatMap((g) => g.items) };
  }, [locale]);
}

export default function WorkspacePage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const [w, setW] = useState<Workspace | null | undefined>(undefined);
  useEffect(() => {
    db.getWorkspace(id)
      .then((x) => setW(x ?? null))
      .catch(() => setW(null));
  }, [id]);
  if (w === undefined) return <PageSkeleton label={t('ws.shell.001')} />;
  if (w === null)
    return (
      <div className="safe-x mx-auto max-w-xl py-10">
        <Empty title={t('ws.shell.002')} action={<Link to="/app" className="font-semibold text-accent underline">{t('ws.shell.003')}</Link>}>{t('ws.shell.004')}</Empty>
      </div>
    );
  return (
    <WorkspaceProvider key={w.id} initial={w}>
      <Routes>
        <Route
          path="relatorio"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <ReportPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Shell />} />
      </Routes>
    </WorkspaceProvider>
  );
}

function SaveIndicator() {
  const { t } = useI18n();
  const { save, savedAt, retrySave } = useWorkspace();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite" data-testid="save-state">
      {save === 'demo' ? (
        <span className="inline-flex items-center gap-1 text-ink2">
          <CloudOff className="h-3.5 w-3.5 text-amber" aria-hidden />
          <span className="hidden sm:inline">{t('ws.shell.005')}</span>
          <span className="sm:hidden">{t('ws.shell.006')}<span className="sr-only">{t('ws.shell.007')}</span>
          </span>
        </span>
      ) : save === 'salvando' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{t('ws.shell.008')}</>
      ) : save === 'erro' ? (
        <span className="inline-flex items-center gap-1 text-bad">
          <CloudOff className="h-3.5 w-3.5" aria-hidden />{t('ws.shell.009')}<button type="button" onClick={retrySave} className="font-semibold underline">{t('ws.shell.010')}</button>
        </span>
      ) : storageMode() === 'memoria' ? (
        // Banco local bloqueado: os dados estão só na memória desta aba, não no aparelho.
        <span className="inline-flex items-center gap-1 text-amber">
          <CloudOff className="h-3.5 w-3.5" aria-hidden />{t('ws.shell.011')}<span className="sr-only sm:not-sr-only">{t('ws.shell.012')}</span>
        </span>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-ok" aria-hidden />{t('ws.shell.013')}<span className="sr-only sm:not-sr-only">{t('ws.shell.014')}</span>
          <span className="hidden sm:inline">{savedAt ? ` · ${fmtDateTime(savedAt)}` : ''}</span>
        </>
      )}
    </span>
  );
}

function StateIcon({ step }: { step?: JourneyStep }) {
  const { t } = useI18n();
  if (!step) return null;
  if (step.state === 'feito') return <Check className="h-4 w-4 text-ok" aria-label={t('ws.shell.015')} />;
  if (step.state === 'bloqueado') return <Lock className="h-3.5 w-3.5 text-muted" aria-label={t('ws.shell.016')} />;
  if (step.state === 'atual') return <span className="h-2 w-2 rounded-full bg-accentStrong" role="img" aria-label={t('ws.shell.017')} />;
  return <CircleDashed className="h-3.5 w-3.5 text-muted/70" aria-label={t('ws.shell.018')} />;
}

function ProjectNav({ base, active, steps, onNavigate }: { base: string; active: string; steps: JourneyStep[]; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { NAV } = useNav();
  const byKey = new Map(steps.map((s) => [s.key, s]));
  return (
    <nav aria-label={t('ws.shell.019')} className="space-y-5">
      {NAV.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const st = it.step ? byKey.get(it.step) : undefined;
              const isActive = active === it.path;
              const Icon = it.icon;
              return (
                <li key={it.path}>
                  <NavLink
                    to={`${base}/${it.path}`}
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={clsx(
                      'group flex min-h-[40px] items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors',
                      isActive ? 'bg-brand/10 font-semibold text-ink' : 'text-ink2 hover:bg-surface2 hover:text-ink',
                    )}
                  >
                    <span className={clsx('h-5 w-0.5 rounded-full', isActive ? 'bg-accentStrong' : 'bg-transparent')} aria-hidden />
                    <Icon className={clsx('h-4 w-4 shrink-0', isActive ? 'text-brand' : 'text-muted group-hover:text-ink2')} aria-hidden />
                    <span className="min-w-0 flex-1 break-words leading-tight">{it.label}</span>
                    <StateIcon step={st} />
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function StepHeader({ item, step, base }: { item: NavItem; step?: JourneyStep; base: string }) {
  const { t } = useI18n();
  const { w } = useWorkspace();
  const [open, setOpen] = useState(false);
  const reqs = step ? stepRequirements(step.key, w) : [];
  const missingRequired = reqs.filter((r) => r.kind === 'obrigatório' && !r.ok);
  const objective = step ? STEP_OBJECTIVE[step.key] : item.objective;
  return (
    <header className="no-print mb-3 sm:mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold text-ink sm:text-2xl">{item.label}</h2>
        {step && (
          <Badge tone={step.state === 'feito' ? 'ok' : step.state === 'atual' ? 'accent' : 'muted'}>
            {step.state === 'feito' ? t('ws.shell.020') : step.state === 'bloqueado' ? t('ws.shell.021') : step.state === 'atual' ? t('ws.shell.022') : 'Pendente'}
          </Badge>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink2">{objective}</p>
      {reqs.length > 0 && (
        <div className="mt-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold text-accent hover:underline">
            <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
            {missingRequired.length ? t('ws.shell.023', { length: missingRequired.length }) : t('ws.shell.024')} · {reqs.filter((r) => r.ok).length}/{reqs.length}{t('ws.shell.025')}</button>
          {open && (
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2" data-testid="step-requirements">
              {reqs.map((r) => (
                <li key={r.label} className="flex items-start gap-2">
                  {r.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label={t('ws.shell.026')} /> : <CircleDashed className={clsx('mt-0.5 h-4 w-4 shrink-0', r.kind === 'obrigatório' ? 'text-bad' : 'text-muted')} aria-label={t('ws.shell.027')} />}
                  <span className="text-ink2">
                    <span className="text-ink">{r.label}</span>{' '}
                    <span className="text-xs text-muted">
                      ({t(`ws.shell.req.${r.kind}` as MessageKey)}
                      {r.detail ? ` · ${r.detail}` : ''})
                    </span>
                  </span>
                </li>
              ))}
              {reqs.some((r) => !r.ok && r.kind !== 'opcional') && (
                <li className="sm:col-span-2">
                  <Link to={`${base}/dados`} className="inline-flex min-h-[32px] items-center text-xs font-semibold text-accent hover:underline">{t('ws.shell.028')}</Link>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </header>
  );
}

function Shell() {
  const { t } = useI18n();
  const { NAV_ITEMS } = useNav();
  const { w, undo, undoLabel } = useWorkspace();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const j = useMemo(() => journey(w), [w]);
  const base = `/app/p/${w.id}`;
  const active = loc.pathname.replace(base, '').replace(/^\//, '').split('/')[0] || 'visao-geral';
  const [menuOpen, setMenuOpen] = useState(false);
  const item = NAV_ITEMS.find((i) => i.path === active);
  const step = item?.step ? j.steps.find((s) => s.key === item.step) : undefined;
  const showNext = !!(j.next && step && step.key !== j.next.key && step.state !== 'atual');

  const doUndo = () => {
    const label = undo();
    if (label) toast('info', t('ws.shell.029', { label }));
  };
  // Ctrl/⌘+Z fora de campos de texto desfaz a última alteração do projeto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      const label = undo();
      if (label) toast('info', t('ws.shell.030', { label }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, toast, t]);

  return (
    // print:block: na impressão o menu lateral some; sem isso o conteúdo cairia na coluna de 264 px.
    <div className="mx-auto w-full max-w-[1440px] lg:grid lg:grid-cols-[264px_minmax(0,1fr)] print:block">
      {/* Barra lateral (desktop) */}
      <aside className="no-print hidden border-r border-line/10 lg:block">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-3 py-5">
          <ProjectNav base={base} active={active} steps={j.steps} />
        </div>
      </aside>

      <div className="safe-x min-w-0 pb-28 pt-4 lg:px-8 lg:pb-12 print:p-0">
        {/* Cabeçalho do projeto. Celular: uma linha (voltar · nome · salvo · desfazer), para o
            conteúdo da etapa aparecer na primeira tela. Desktop: voltar + trilha, depois o nome. */}
        <nav aria-label={t('ws.shell.031')} className="no-print mb-2 hidden min-w-0 items-center gap-1 text-xs text-muted sm:flex">
          <BackButton className="mr-2" />
          <Link to="/app" className="inline-flex min-h-[28px] shrink-0 items-center hover:text-ink">{t('ws.shell.032')}</Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <Link to={`${base}/visao-geral`} className="min-w-0 truncate py-1.5 hover:text-ink">
            {w.asIs.name}
          </Link>
          {item && item.path !== 'visao-geral' && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
              <span className="shrink-0 text-ink2">{item.short}</span>
            </>
          )}
        </nav>
        <div className="no-print mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line/10 pb-2 sm:mb-4 sm:gap-x-3 sm:gap-y-2 sm:pb-4">
          <BackButton compact className="sm:hidden" />
          <h1 className="line-clamp-2 min-w-0 flex-1 break-words text-base font-semibold leading-snug sm:text-xl" title={w.asIs.name}>
            {w.asIs.name}
          </h1>
          {w.isDemo && (
            // No celular o selo vai para a linha de baixo: o nome do projeto não quebra no meio da palavra.
            <div className="order-last w-full sm:order-none sm:w-auto">
              <Badge tone="amber" className="text-xs">{t('ws.shell.033')}<span className="sr-only sm:not-sr-only">{t('ws.shell.034')}</span>
              </Badge>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <SaveIndicator />
            <Button size="sm" variant="ghost" onClick={doUndo} disabled={!undoLabel} title={undoLabel ? t('ws.shell.035', { undoLabel }) : t('ws.shell.036')} aria-label={undoLabel ? t('ws.shell.037', { undoLabel }) : t('ws.shell.038')}>
              <Undo2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{t('ws.shell.039')}</span>
            </Button>
          </div>
        </div>

        {j.blocked && active !== 'validar' && active !== 'dados' && (
          <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-bad/40 bg-bad/5 p-3 text-sm" role="alert">
            <AlertOctagon className="h-5 w-5 text-bad" aria-hidden />
            <span className="flex-1 text-ink2">{t('ws.shell.040')}</span>
            <Button size="sm" variant="secondary" onClick={() => nav(`${base}/validar`)}>{t('ws.shell.041')}</Button>
          </div>
        )}

        {item && <StepHeader item={item} step={step} base={base} />}
        {showNext && (
          <div className="no-print -mt-2 mb-4 hidden flex-wrap items-center gap-2 text-sm text-ink2 lg:flex">
            <span>{t('ws.shell.042')}<strong className="text-ink">{j.next!.label}</strong>
            </span>
            <Link to={`${base}/${STEP_PATH[j.next!.key]}`} className="inline-flex min-h-[32px] items-center gap-1 font-semibold text-accent hover:underline">{t('ws.shell.043')}{j.next!.short} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        <Suspense fallback={<PageSkeleton variant="tab" />}>
          <Routes>
            <Route index element={<Navigate to="visao-geral" replace />} />
            <Route path="visao-geral" element={<OverviewTab />} />
            <Route path="dados" element={<DataTab />} />
            <Route path="validar" element={<ValidateTab />} />
            <Route path="mapa" element={<MapTab />} />
            <Route path="diagnostico" element={<DiagnosisTab />} />
            <Route path="recomendacoes" element={<RecsTab />} />
            <Route path="tobe" element={<ToBeTab />} />
            <Route path="comparar" element={<CompareTab />} />
            <Route path="plano" element={<PlanTab />} />
            <Route path="resultados" element={<ResultsTab />} />
            <Route path="riscos" element={<RisksTab />} />
            <Route path="responsabilidades" element={<RaciTab />} />
            <Route path="simulacao" element={<SimulationTab />} />
            <Route path="automacao" element={<AutomationTab />} />
            <Route path="exportar" element={<ExportTab />} />
            <Route path="*" element={<Navigate to="visao-geral" replace />} />
          </Routes>
        </Suspense>
        {/* Celular/tablet: o próximo passo vem depois do conteúdo, como um botão de continuar. */}
        {showNext && (
          <Link
            to={`${base}/${STEP_PATH[j.next!.key]}`}
            className="no-print mt-6 flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand/5 px-4 py-3 lg:hidden"
            data-testid="next-step"
          >
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wide text-accent">{t('ws.shell.044')}</span>
              <span className="block font-semibold text-ink">{j.next!.label}</span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-brand" aria-hidden />
          </Link>
        )}
      </div>

      {/* Barra inferior (celular/tablet) */}
      <nav aria-label={t('ws.shell.045')} className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line/15 bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {MOBILE_TABS.map((p) => {
            const it = NAV_ITEMS.find((i) => i.path === p)!;
            const Icon = it.icon;
            const isActive = active === p;
            return (
              <li key={p} className="min-w-0">
                <Link to={`${base}/${p}`} aria-current={isActive ? 'page' : undefined} className={clsx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-brand' : 'text-muted')}>
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="max-w-full truncate px-0.5 text-[11px] tracking-tight sm:text-xs">{p === 'visao-geral' ? t('ws.shell.046') : it.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" className={clsx('flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs font-medium', !MOBILE_TABS.includes(active) ? 'text-brand' : 'text-muted')}>
              <Menu className="h-5 w-5" aria-hidden />{t('ws.shell.047')}</button>
          </li>
        </ul>
      </nav>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title={t('ws.shell.048')}>
        <ProjectNav base={base} active={active} steps={j.steps} onNavigate={() => setMenuOpen(false)} />
        <Link to="/app" onClick={() => setMenuOpen(false)} className="mt-6 inline-flex min-h-[44px] items-center gap-2 px-3 text-sm font-semibold text-accent">
          <RotateCcw className="h-4 w-4" aria-hidden />{t('ws.shell.049')}</Link>
      </Drawer>
    </div>
  );
}
