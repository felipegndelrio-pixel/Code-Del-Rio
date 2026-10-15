import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';

export function Card({ title, subtitle, action, children, className, tone = 'default' }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'alert';
}) {
  return (
    <section
      className={clsx(
        'rounded-2xl border bg-navy-850/80 p-4 sm:p-5',
        tone === 'alert' ? 'border-red-500/50' : 'border-teal-brand/25 shadow-glow',
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {subtitle && <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-brand/80">{subtitle}</p>}
            {title && <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ variant = 'primary', loading, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-teal-brand text-navy-950 hover:bg-cyan-300',
        variant === 'secondary' && 'border border-teal-brand/40 bg-navy-800 text-teal-100 hover:bg-navy-700',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
        variant === 'ghost' && 'text-slate-300 hover:bg-navy-800 hover:text-white',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const TONES: Record<string, string> = {
  green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
  teal: 'bg-teal-400/15 text-teal-200 ring-teal-300/30',
  cyan: 'bg-cyan-400/15 text-cyan-200 ring-cyan-300/30',
  amber: 'bg-amber-400/15 text-amber-200 ring-amber-300/30',
  orange: 'bg-orange-500/15 text-orange-300 ring-orange-400/30',
  red: 'bg-red-500/15 text-red-300 ring-red-400/40',
  slate: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
};
export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES | string; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1', TONES[tone] ?? TONES.slate)}>{children}</span>;
}

export const STATUS_TONE: Record<string, string> = {
  planejado: 'cyan', em_andamento: 'teal', suspenso: 'amber', concluido: 'green', cancelado: 'slate',
  nao_iniciada: 'slate', bloqueada: 'red', concluida: 'green', cancelada: 'slate',
  baixa: 'slate', media: 'cyan', alta: 'orange', critica: 'red',
  aberto: 'orange', em_tratamento: 'amber', fechado: 'green', materializado: 'red',
  em_analise: 'amber', resolvido: 'green', pendente: 'amber', aprovada: 'green', rejeitada: 'red', adiada: 'slate',
  submetida: 'cyan', implementada: 'green', atingido: 'green',
  verde: 'green', amarelo: 'amber', vermelho: 'red',
};

export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-slate-300">
        {label} {required && <span className="text-orange-400">*</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

export const inputCls =
  'w-full min-h-[40px] rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand disabled:opacity-60';

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-slate-300">
      <Loader2 className="h-5 w-5 animate-spin text-teal-brand" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
      <span className="flex-1">{error}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-600 p-8 text-center text-sm text-slate-400">
      <p className="font-semibold text-slate-200">{title}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-teal-brand/30 bg-navy-900 p-4 shadow-2xl outline-none sm:rounded-2xl sm:p-6',
          wide ? 'sm:max-w-4xl' : 'sm:max-w-2xl',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-navy-800 hover:text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirmar', danger, onConfirm, onCancel, busy }: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="space-y-4 text-sm text-slate-300">
        <div>{message}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; badge?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
      <div className="flex min-w-max gap-1 border-b border-navy-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={clsx(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
              value === t.id ? 'border-teal-brand text-teal-200' : 'border-transparent text-slate-400 hover:text-white',
            )}
          >
            {t.label}
            {t.badge ? <span className="ml-1.5 rounded-full bg-red-500/80 px-1.5 text-[10px] text-white">{t.badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'teal', big }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'teal' | 'red' | 'orange' | 'cyan' | 'white'; big?: boolean }) {
  const color = { teal: 'text-teal-brand', red: 'text-red-400', orange: 'text-orange-400', cyan: 'text-cyan-brand', white: 'text-white' }[tone];
  return (
    <div className="rounded-xl border border-navy-600 bg-navy-900/70 p-3 sm:p-4">
      <div className={clsx('font-extrabold tabular-nums leading-none', color, big ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl')}>{value}</div>
      <div className="mt-1.5 text-xs font-semibold text-slate-200">{label}</div>
      {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

export function ProgressBar({ value, planned }: { value: number | null; planned?: number | null }) {
  const v = value === null ? 0 : Math.round(value * 100);
  const p = planned === null || planned === undefined ? null : Math.round(planned * 100);
  const late = p !== null && p - v > 10;
  return (
    <div className="w-full">
      <div className="relative h-2 rounded-full bg-navy-700" aria-label={`Avanço ${v}%${p !== null ? `, planejado ${p}%` : ''}`}>
        <div className={clsx('h-2 rounded-full', late ? 'bg-orange-500' : 'bg-teal-brand')} style={{ width: `${v}%` }} />
        {p !== null && <div className="absolute -top-1 h-4 w-0.5 bg-white/80" style={{ left: `${p}%` }} title={`Planejado ${p}%`} />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>{value === null ? 'Sem dados' : `${v}% real`}</span>
        {p !== null && <span>{p}% plan.</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { id: number; kind: 'ok' | 'error'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, kind, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={clsx(
              'pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-xl',
              t.kind === 'ok' ? 'border-teal-brand/40 bg-navy-800 text-teal-100' : 'border-red-500/50 bg-red-950 text-red-100',
            )}
          >
            {t.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  if (s.length > 10) return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return `${m[3]}/${m[2]}/${m[1]}`;
}
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
export function fmtPct(x: number | null | undefined, digits = 0): string {
  return x === null || x === undefined ? '—' : `${(x * 100).toFixed(digits)}%`;
}
