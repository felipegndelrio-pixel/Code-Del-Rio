import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, HelpCircle, Info, Loader2, X } from 'lucide-react';
import { GLOSSARY, type GlossaryKey } from '../config/glossary';
import type { Basis } from '../domain/compare';

export function Card({ title, subtitle, action, children, className, id, tone = 'default' }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  tone?: 'default' | 'warn' | 'bad' | 'brand';
}) {
  return (
    <section
      id={id}
      className={clsx(
        'avoid-break rounded-2xl border bg-surface p-4 shadow-card sm:p-6',
        tone === 'default' && 'border-line/15',
        tone === 'warn' && 'border-warn/50',
        tone === 'bad' && 'border-bad/50',
        tone === 'brand' && 'border-brand/40',
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {subtitle && <p className="eyebrow">{subtitle}</p>}
            {title && <h2 className="mt-0.5 text-base font-semibold text-ink sm:text-lg">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ variant = 'primary', loading, size = 'md', className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'min-h-[36px] px-3 text-xs',
        size === 'md' && 'min-h-[44px] px-4 text-sm',
        size === 'lg' && 'min-h-[52px] px-5 text-base',
        variant === 'primary' && 'bg-brand text-brandInk shadow-glow hover:bg-brand/90 active:bg-brand/80',
        variant === 'secondary' && 'border border-line/20 bg-surface text-ink hover:border-line/40 hover:bg-surface2',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        variant === 'ghost' && 'text-ink2 hover:bg-surface2 hover:text-ink',
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const TONES = {
  brand: 'bg-brand/15 text-brand ring-brand/30',
  accent: 'bg-accent/15 text-accent ring-accent/30',
  violet: 'bg-violet/15 text-violet ring-violet/30',
  amber: 'bg-amber/15 text-amber ring-amber/30',
  ok: 'bg-ok/15 text-ok ring-ok/30',
  bad: 'bg-bad/15 text-bad ring-bad/30',
  muted: 'bg-surface2 text-ink2 ring-line/20',
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1', TONES[tone], className)}>{children}</span>;
}

const BASIS: Record<Basis, { label: string; tone: Tone; help: string }> = {
  informado: { label: 'Informado', tone: 'accent', help: 'Dado fornecido por você ou por fonte identificada.' },
  calculado: { label: 'Calculado', tone: 'brand', help: 'Resultado de fórmula sobre dados informados.' },
  estimado: { label: 'Estimado', tone: 'violet', help: 'Resultado condicionado a premissas.' },
  a_validar: { label: 'A validar', tone: 'amber', help: 'Hipótese ainda não confirmada.' },
  realizado: { label: 'Realizado', tone: 'ok', help: 'Resultado medido após a implantação e registrado.' },
};
export function BasisTag({ basis }: { basis: Basis }) {
  const b = BASIS[basis];
  return (
    <span title={b.help}>
      <Badge tone={b.tone}>{b.label}</Badge>
    </span>
  );
}

export function Stat({ label, value, sub, basis, missing, term, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; basis?: Basis; missing?: string; term?: GlossaryKey; tone?: 'bad' | 'ok' | 'amber' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line/15 bg-surface2/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 text-xs font-medium text-ink2">
          {label}
          {term && <Term k={term} iconOnly />}
        </span>
        {basis && !missing && <BasisTag basis={basis} />}
      </div>
      {missing ? (
        <p className="text-sm text-muted">{missing}</p>
      ) : (
        <p className={clsx('break-words text-xl font-bold tracking-tight sm:text-2xl', tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : tone === 'amber' ? 'text-amber' : 'text-ink')}>{value}</p>
      )}
      {sub && !missing && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Explicação de termo técnico sob demanda. */
export function Term({ k, children, iconOnly }: { k: GlossaryKey; children?: ReactNode; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const g = GLOSSARY[k];
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={clsx('inline-flex items-center gap-0.5 align-baseline', iconOnly ? 'relative ml-1 text-muted before:absolute before:-inset-[6px] before:content-[""] hover:text-brand' : 'border-b border-dotted border-brand/70 text-inherit hover:text-brand')}
        aria-label={iconOnly ? `O que é ${g.term}?` : undefined}
      >
        {!iconOnly && (children ?? g.term)}
        {iconOnly && <HelpCircle className="h-3.5 w-3.5" aria-hidden />}
      </button>
      {open && (
        <span id={id} role="note" className="absolute left-0 top-full z-40 mt-1 block w-72 max-w-[80vw] rounded-xl border border-line/20 bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink2 shadow-card">
          <strong className="mb-1 block text-ink">{g.term}</strong>
          {g.text}
        </span>
      )}
    </span>
  );
}

export function HowCalc({ children, title = 'Como calculamos' }: { children: ReactNode; title?: string }) {
  return (
    <details className="group mt-3 rounded-xl border border-line/15 bg-surface2/50 text-sm">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 px-3 py-2 font-semibold text-ink2 hover:text-ink">
        <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        {title}
      </summary>
      <div className="space-y-2 px-3 pb-3 text-ink2">{children}</div>
    </details>
  );
}

export function Callout({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={clsx(
        'flex gap-3 rounded-xl border p-3 text-sm',
        tone === 'info' && 'border-accent/30 bg-accent/10',
        tone === 'warn' && 'border-warn/40 bg-warn/10',
        tone === 'bad' && 'border-bad/40 bg-bad/10',
        tone === 'ok' && 'border-ok/40 bg-ok/10',
      )}
    >
      <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', tone === 'info' && 'text-accent', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad', tone === 'ok' && 'text-ok')} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1 text-ink2">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children}
        {action && <div className="pt-1">{action}</div>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line/25 p-6 text-center">
      {icon && <div className="text-brand">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink2">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- formulários
const inputCls =
  'w-full min-h-[44px] rounded-xl border border-line/25 bg-surface2/70 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 aria-[invalid=true]:border-bad';

export function Field({ label, help, error, children, required, className }: { label: ReactNode; help?: ReactNode; error?: string; required?: boolean; children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode; className?: string }) {
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedby = [help ? helpId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-bad" aria-hidden>*</span>}
      </label>
      {children({ id, 'aria-describedby': describedby, 'aria-invalid': error ? true : undefined })}
      {help && !error && (
        <p id={helpId} className="text-xs text-muted">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}
/** Seta própria (np-select): a nativa ocupa o padding e, no Safari, muda altura e espaçamento. */
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx(inputCls, 'np-select appearance-none pr-9 leading-5', props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx(inputCls, 'min-h-[80px]', props.className)} />;
}

/** Campo numérico que aceita vazio (= não informado) e vírgula decimal. */
export function NumberInput({ value, onChange, min = 0, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | undefined; onChange: (v: number | undefined) => void; min?: number }) {
  const [text, setText] = useState(value === undefined ? '' : String(value).replace('.', ','));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(value === undefined ? '' : String(value).replace('.', ','));
      last.current = value;
    }
  }, [value]);
  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const s = t.trim().replace(/\./g, '').replace(',', '.');
        if (s === '') {
          last.current = undefined;
          onChange(undefined);
          return;
        }
        const n = Number(s);
        if (Number.isFinite(n) && n >= min) {
          last.current = n;
          onChange(n);
        }
      }}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line/20 bg-surface2/60 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('min-h-[36px] rounded-lg px-3 text-xs font-semibold transition', value === o.value ? 'bg-brand text-brandInk' : 'text-ink2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- diálogos
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute('disabled'));
    setTimeout(() => (el?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useFocusTrap(open, onClose);
  const id = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className={clsx('safe-bottom flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line/20 bg-surface shadow-card sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between gap-2 border-b border-line/15 px-4 py-3">
          <h2 id={id} className="text-base font-bold text-ink">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line/15 px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Painel lateral no desktop; folha inferior no celular. */
export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useFocusTrap(open, onClose);
  const id = useId();
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/45" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="safe-bottom absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl border border-line/20 bg-surface shadow-card md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-2xl"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line/30 md:hidden" aria-hidden />
        <header className="flex items-center justify-between gap-2 border-b border-line/15 px-4 py-3">
          <h2 id={id} className="min-w-0 truncate text-base font-bold text-ink">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar painel">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line/15 px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOpts = { title: string; body: ReactNode; confirm?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

type ToastT = { id: number; tone: 'ok' | 'bad' | 'info'; text: string };
const ToastCtx = createContext<(tone: ToastT['tone'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastT[]>([]);
  const [confirm, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const push = useCallback((tone: ToastT['tone'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 8000 : 4000);
  }, []);
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const close = (v: boolean) => {
    confirm?.resolve(v);
    setConfirm(null);
  };
  return (
    <ToastCtx.Provider value={push}>
      <ConfirmCtx.Provider value={ask}>
        {children}
        <Modal
          open={!!confirm}
          onClose={() => close(false)}
          title={confirm?.title}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button variant={confirm?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
                {confirm?.confirm ?? 'Confirmar'}
              </Button>
            </>
          }
        >
          <div className="space-y-2 text-sm text-ink2">{confirm?.body}</div>
        </Modal>
        <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-4">
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tone === 'bad' ? 'alert' : 'status'}
              className={clsx('pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-card', t.tone === 'ok' && 'border-ok/40 bg-surface text-ink', t.tone === 'bad' && 'border-bad/50 bg-surface text-ink', t.tone === 'info' && 'border-accent/40 bg-surface text-ink')}
            >
              {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : t.tone === 'bad' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
              <span>{t.text}</span>
            </div>
          ))}
        </div>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 p-6 text-sm text-ink2">
      <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-surface2', className)} aria-hidden />;
}

/**
 * Tabela com rolagem horizontal própria. `minWidth` (px) evita colunas espremidas:
 * abaixo dele a tabela rola dentro do cartão em vez de encolher. Selects nunca ficam
 * mais estreitos que a opção escolhida (sem "Em and…").
 */
export function Table({ children, caption, minWidth = 560 }: { children: ReactNode; caption?: string; minWidth?: number }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-separate border-spacing-0 text-sm [&_select]:min-w-max" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}
export const th = 'sticky top-0 border-b border-line/20 bg-surface px-2 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-muted';
export const td = 'border-b border-line/10 px-2 py-2 align-top text-ink2';
