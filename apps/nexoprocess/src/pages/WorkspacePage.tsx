import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertOctagon, ArrowRight, Check, CloudOff, FileText, Loader2, Lock, MoreHorizontal } from 'lucide-react';
import { Badge, Button, Empty, Spinner } from '../components/ui';
import { journey, type StepKey } from '../domain/journey';
import type { Workspace } from '../domain/types';
import { fmtDateTime } from '../domain/units';
import { db } from '../storage/db';
import { useWorkspace, WorkspaceProvider } from '../state/workspace';

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

export const STEP_PATH: Record<StepKey, string> = {
  iniciar: '',
  asis: 'dados',
  validar: 'validar',
  mapa: 'mapa',
  diagnostico: 'diagnostico',
  recomendacoes: 'recomendacoes',
  tobe: 'tobe',
  comparar: 'comparar',
  plano: 'plano',
  resultados: 'resultados',
};

const MORE = [
  { path: 'riscos', label: 'Riscos' },
  { path: 'responsabilidades', label: 'Responsabilidades (RACI)' },
  { path: 'simulacao', label: 'Simulação de prazo' },
  { path: 'automacao', label: 'Automação e IA' },
  { path: 'exportar', label: 'Exportar e relatório' },
];

export default function WorkspacePage() {
  const { id = '' } = useParams();
  const [w, setW] = useState<Workspace | null | undefined>(undefined);
  useEffect(() => {
    db.getWorkspace(id)
      .then((x) => setW(x ?? null))
      .catch(() => setW(null));
  }, [id]);
  if (w === undefined) return <Spinner label="Abrindo processo…" />;
  if (w === null)
    return (
      <div className="safe-x mx-auto max-w-xl py-10">
        <Empty title="Processo não encontrado neste aparelho" action={<Link to="/app" className="font-semibold text-brand underline">Ver meus processos</Link>}>
          Os dados ficam salvos no navegador onde foram criados. Se você limpou os dados do navegador ou trocou de aparelho, restaure um backup.
        </Empty>
      </div>
    );
  return (
    <WorkspaceProvider key={w.id} initial={w}>
      <Routes>
        <Route path="relatorio" element={<Suspense fallback={<Spinner />}><ReportPage /></Suspense>} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </WorkspaceProvider>
  );
}

function SaveIndicator() {
  const { save, savedAt } = useWorkspace();
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" role="status" aria-live="polite" data-testid="save-state">
      {save === 'salvando' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Salvando…
        </>
      ) : save === 'erro' ? (
        <span className="text-bad">
          <CloudOff className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          Falha ao salvar — faça um backup
        </span>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> Salvo neste dispositivo {savedAt ? `· ${fmtDateTime(savedAt)}` : ''}
        </>
      )}
    </span>
  );
}

function Shell() {
  const { w } = useWorkspace();
  const nav = useNavigate();
  const loc = useLocation();
  const j = useMemo(() => journey(w), [w]);
  const base = `/app/p/${w.id}`;
  const active = loc.pathname.replace(base, '').replace(/^\//, '').split('/')[0];
  const [moreOpen, setMoreOpen] = useState(false);
  const activeStep = j.steps.find((s) => STEP_PATH[s.key] === active);

  return (
    <div className="safe-x mx-auto max-w-7xl py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 truncate text-xl font-bold sm:text-2xl">{w.asIs.name}</h1>
        {w.isDemo && (
          <Badge tone="amber" className="text-xs">
            Exemplo fictício — dados ilustrativos
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-2">
          <SaveIndicator />
          <Button size="sm" variant="secondary" onClick={() => nav(`${base}/relatorio`)}>
            <FileText className="h-4 w-4" aria-hidden /> Relatório
          </Button>
        </span>
      </div>

      <nav aria-label="Jornada do processo" className="no-print">
        <ol className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-2">
          {j.steps.map((s) => {
            const to = s.key === 'iniciar' ? '/app' : `${base}/${STEP_PATH[s.key]}`;
            const isActive = STEP_PATH[s.key] === active && s.key !== 'iniciar';
            return (
              <li key={s.key} className="shrink-0">
                <Link
                  to={to}
                  aria-current={isActive ? 'step' : undefined}
                  title={s.why}
                  className={clsx(
                    'flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition',
                    isActive ? 'border-brand bg-brand/15 text-ink' : 'border-line/15 bg-surface text-ink2 hover:text-ink',
                    s.state === 'bloqueado' && 'opacity-60',
                  )}
                >
                  <span
                    className={clsx(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px]',
                      s.state === 'feito' ? 'bg-ok text-white' : s.state === 'atual' ? 'bg-brand text-brandInk' : 'bg-surface2 text-muted',
                    )}
                    aria-hidden
                  >
                    {s.state === 'feito' ? <Check className="h-3.5 w-3.5" /> : s.state === 'bloqueado' ? <Lock className="h-3 w-3" /> : s.n}
                  </span>
                  {s.short}
                  <span className="sr-only">({s.state})</span>
                </Link>
              </li>
            );
          })}
          <li className="relative shrink-0">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
              className={clsx('flex min-h-[44px] items-center gap-1 rounded-xl border px-3 text-sm font-semibold', MORE.some((m) => m.path === active) ? 'border-brand bg-brand/15 text-ink' : 'border-line/15 bg-surface text-ink2')}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden /> Mais análises
            </button>
          </li>
        </ol>
        {moreOpen && (
          <ul className="mb-2 flex flex-wrap gap-1">
            {MORE.map((m) => (
              <li key={m.path}>
                <NavLink
                  to={`${base}/${m.path}`}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => clsx('inline-flex min-h-[40px] items-center rounded-xl border px-3 text-sm font-semibold', isActive ? 'border-brand bg-brand/15 text-ink' : 'border-line/15 bg-surface text-ink2 hover:text-ink')}
                >
                  {m.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </nav>

      {j.blocked && active !== 'validar' && active !== 'dados' && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm" role="alert">
          <AlertOctagon className="h-5 w-5 text-bad" aria-hidden />
          <span className="flex-1 text-ink2">Há erros nos dados que impedem uma análise confiável. Os números abaixo podem estar incompletos.</span>
          <Button size="sm" variant="secondary" onClick={() => nav(`${base}/validar`)}>
            Corrigir agora
          </Button>
        </div>
      )}
      {j.next && activeStep?.key !== j.next.key && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 p-3 text-sm">
          <span className="flex-1 text-ink2">
            <strong className="text-ink">Próximo passo recomendado:</strong> {j.next.label}. <span className="text-muted">{j.next.why}</span>
          </span>
          <Button size="sm" onClick={() => nav(j.next!.key === 'iniciar' ? '/app' : `${base}/${STEP_PATH[j.next!.key]}`)}>
            Ir para {j.next.short} <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}

      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route index element={<Navigate to={j.next && j.next.key !== 'iniciar' ? STEP_PATH[j.next.key] : 'mapa'} replace />} />
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
          <Route path="*" element={<Navigate to="mapa" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
