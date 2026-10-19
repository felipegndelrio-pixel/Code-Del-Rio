// Shell do projeto (V4): barra lateral por fase no desktop; barra inferior e
// menu de etapas no celular; breadcrumbs; cabeçalho de etapa com objetivo e
// requisitos reais; salvamento visível; desfazer.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertOctagon, ArrowRight, Check, ChevronRight, CircleDashed, CloudOff, Loader2, Lock, Menu, RotateCcw, Undo2 } from 'lucide-react';
import { Badge, Button, Drawer, Empty, Spinner, useToast } from '../components/ui';
import { MOBILE_TABS, NAV, NAV_ITEMS, STEP_PATH, type NavItem } from '../config/nav';
import { journey, STEP_OBJECTIVE, stepRequirements, type JourneyStep } from '../domain/journey';
import type { Workspace } from '../domain/types';
import { fmtDateTime } from '../domain/units';
import { db } from '../storage/db';
import { useWorkspace, WorkspaceProvider } from '../state/workspace';

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


export default function WorkspacePage() {
  const { id = '' } = useParams();
  const [w, setW] = useState<Workspace | null | undefined>(undefined);
  useEffect(() => {
    db.getWorkspace(id)
      .then((x) => setW(x ?? null))
      .catch(() => setW(null));
  }, [id]);
  if (w === undefined) return <Spinner label="Abrindo projeto…" />;
  if (w === null)
    return (
      <div className="safe-x mx-auto max-w-xl py-10">
        <Empty title="Projeto não encontrado neste aparelho" action={<Link to="/app" className="font-semibold text-accent underline">Ver meus projetos</Link>}>
          Os projetos ficam salvos no navegador onde foram criados. Se você limpou os dados do navegador ou trocou de aparelho, importe o arquivo do projeto ou restaure um backup.
        </Empty>
      </div>
    );
  return (
    <WorkspaceProvider key={w.id} initial={w}>
      <Routes>
        <Route
          path="relatorio"
          element={
            <Suspense fallback={<Spinner />}>
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
  const { save, savedAt, retrySave } = useWorkspace();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status" aria-live="polite" data-testid="save-state">
      {save === 'salvando' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Salvando…
        </>
      ) : save === 'erro' ? (
        <span className="inline-flex items-center gap-1 text-bad">
          <CloudOff className="h-3.5 w-3.5" aria-hidden />
          Falha ao salvar
          <button type="button" onClick={retrySave} className="font-semibold underline">
            Tentar de novo
          </button>
        </span>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> Salvo neste dispositivo
          <span className="hidden sm:inline">{savedAt ? ` · ${fmtDateTime(savedAt)}` : ''}</span>
        </>
      )}
    </span>
  );
}

function StateIcon({ step }: { step?: JourneyStep }) {
  if (!step) return null;
  if (step.state === 'feito') return <Check className="h-4 w-4 text-ok" aria-label="concluída" />;
  if (step.state === 'bloqueado') return <Lock className="h-3.5 w-3.5 text-muted" aria-label="bloqueada" />;
  if (step.state === 'atual') return <span className="h-2 w-2 rounded-full bg-accentStrong" role="img" aria-label="próxima etapa" />;
  return <CircleDashed className="h-3.5 w-3.5 text-muted/70" aria-label="pendente" />;
}

function ProjectNav({ base, active, steps, onNavigate }: { base: string; active: string; steps: JourneyStep[]; onNavigate?: () => void }) {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  return (
    <nav aria-label="Etapas do projeto" className="space-y-5">
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
                      'group flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                      isActive ? 'bg-brand/10 font-semibold text-ink' : 'text-ink2 hover:bg-surface2 hover:text-ink',
                    )}
                  >
                    <span className={clsx('h-5 w-0.5 rounded-full', isActive ? 'bg-accentStrong' : 'bg-transparent')} aria-hidden />
                    <Icon className={clsx('h-4 w-4 shrink-0', isActive ? 'text-brand' : 'text-muted group-hover:text-ink2')} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
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
  const { w } = useWorkspace();
  const [open, setOpen] = useState(false);
  const reqs = step ? stepRequirements(step.key, w) : [];
  const missingRequired = reqs.filter((r) => r.kind === 'obrigatório' && !r.ok);
  const objective = step ? STEP_OBJECTIVE[step.key] : item.objective;
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold text-ink sm:text-2xl">{item.label}</h2>
        {step && (
          <Badge tone={step.state === 'feito' ? 'ok' : step.state === 'atual' ? 'accent' : 'muted'}>
            {step.state === 'feito' ? 'Concluída' : step.state === 'bloqueado' ? 'Bloqueada por erros' : step.state === 'atual' ? 'Próxima etapa' : 'Pendente'}
          </Badge>
        )}
      </div>
      <p className="mt-1 max-w-3xl text-sm text-ink2">{objective}</p>
      {reqs.length > 0 && (
        <div className="mt-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-accent hover:underline">
            <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} aria-hidden />
            {missingRequired.length ? `Falta ${missingRequired.length} item obrigatório` : 'O que esta etapa usa'} · {reqs.filter((r) => r.ok).length}/{reqs.length} disponíveis
          </button>
          {open && (
            <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2" data-testid="step-requirements">
              {reqs.map((r) => (
                <li key={r.label} className="flex items-start gap-2">
                  {r.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="disponível" /> : <CircleDashed className={clsx('mt-0.5 h-4 w-4 shrink-0', r.kind === 'obrigatório' ? 'text-bad' : 'text-muted')} aria-label="faltando" />}
                  <span className="text-ink2">
                    <span className="text-ink">{r.label}</span>{' '}
                    <span className="text-xs text-muted">
                      ({r.kind}
                      {r.detail ? ` · ${r.detail}` : ''})
                    </span>
                  </span>
                </li>
              ))}
              {reqs.some((r) => !r.ok && r.kind !== 'opcional') && (
                <li className="sm:col-span-2">
                  <Link to={`${base}/dados`} className="text-xs font-semibold text-accent hover:underline">
                    Completar dados do processo
                  </Link>
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

  const doUndo = () => {
    const label = undo();
    if (label) toast('info', `Desfeito: ${label}`);
  };
  // Ctrl/⌘+Z fora de campos de texto desfaz a última alteração do projeto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      const label = undo();
      if (label) toast('info', `Desfeito: ${label}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, toast]);

  return (
    <div className="mx-auto w-full max-w-[1440px] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Barra lateral (desktop) */}
      <aside className="no-print hidden border-r border-line/10 lg:block">
        <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto px-3 py-5">
          <ProjectNav base={base} active={active} steps={j.steps} />
        </div>
      </aside>

      <div className="safe-x min-w-0 pb-28 pt-4 lg:px-8 lg:pb-12">
        {/* Breadcrumbs + projeto */}
        <nav aria-label="Você está em" className="no-print mb-2 flex min-w-0 items-center gap-1 text-xs text-muted">
          <Link to="/app" className="shrink-0 hover:text-ink">
            Meus projetos
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
          <Link to={`${base}/visao-geral`} className="min-w-0 truncate hover:text-ink">
            {w.asIs.name}
          </Link>
          {item && item.path !== 'visao-geral' && (
            <>
              <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
              <span className="shrink-0 text-ink2">{item.short}</span>
            </>
          )}
        </nav>
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/10 pb-4">
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold sm:text-xl">{w.asIs.name}</h1>
          {w.isDemo && (
            <Badge tone="amber" className="text-xs">
              Exemplo fictício — dados ilustrativos
            </Badge>
          )}
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto">
            <SaveIndicator />
            <Button size="sm" variant="ghost" onClick={doUndo} disabled={!undoLabel} title={undoLabel ? `Desfazer: ${undoLabel} (Ctrl+Z)` : 'Nada para desfazer'} aria-label={undoLabel ? `Desfazer: ${undoLabel}` : 'Nada para desfazer'}>
              <Undo2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Desfazer</span>
            </Button>
          </div>
        </div>

        {j.blocked && active !== 'validar' && active !== 'dados' && (
          <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-bad/40 bg-bad/5 p-3 text-sm" role="alert">
            <AlertOctagon className="h-5 w-5 text-bad" aria-hidden />
            <span className="flex-1 text-ink2">Há erros nos dados que impedem uma análise confiável. Os números podem estar incompletos.</span>
            <Button size="sm" variant="secondary" onClick={() => nav(`${base}/validar`)}>
              Corrigir agora
            </Button>
          </div>
        )}

        {item && <StepHeader item={item} step={step} base={base} />}
        {j.next && step && step.key !== j.next.key && step.state !== 'atual' && (
          <div className="no-print -mt-2 mb-4 flex flex-wrap items-center gap-2 text-sm text-ink2">
            <span>
              Próxima etapa recomendada: <strong className="text-ink">{j.next.label}</strong>
            </span>
            <Link to={`${base}/${STEP_PATH[j.next.key]}`} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
              Ir para {j.next.short} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        )}

        <Suspense fallback={<Spinner />}>
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
      </div>

      {/* Barra inferior (celular/tablet) */}
      <nav aria-label="Atalhos do projeto" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line/15 bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {MOBILE_TABS.map((p) => {
            const it = NAV_ITEMS.find((i) => i.path === p)!;
            const Icon = it.icon;
            const isActive = active === p;
            return (
              <li key={p} className="min-w-0">
                <Link to={`${base}/${p}`} aria-current={isActive ? 'page' : undefined} className={clsx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-brand' : 'text-muted')}>
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="max-w-full truncate px-0.5">{p === 'visao-geral' ? 'Início' : it.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button type="button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" className={clsx('flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs font-medium', !MOBILE_TABS.includes(active) ? 'text-brand' : 'text-muted')}>
              <Menu className="h-5 w-5" aria-hidden />
              Etapas
            </button>
          </li>
        </ul>
      </nav>
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Etapas do projeto">
        <ProjectNav base={base} active={active} steps={j.steps} onNavigate={() => setMenuOpen(false)} />
        <Link to="/app" onClick={() => setMenuOpen(false)} className="mt-6 inline-flex min-h-[44px] items-center gap-2 px-3 text-sm font-semibold text-accent">
          <RotateCcw className="h-4 w-4" aria-hidden /> Voltar a Meus projetos
        </Link>
      </Drawer>
    </div>
  );
}
