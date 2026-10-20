// Dicas de boas-vindas (primeira visita): balões que apontam as ações principais.
// Não bloqueia a tela; Esc ou "Pular" encerram e não aparecem de novo neste aparelho.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { Button } from './ui';

export interface TourStep {
  target: string;
  title: string;
  body: string;
}

const seen = (key: string) => {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // sem armazenamento, não insiste a cada visita
  }
};

export function Tour({ storageKey, steps }: { storageKey: string; steps: TourStep[] }) {
  const [i, setI] = useState<number | null>(null);
  const [avail, setAvail] = useState<TourStep[]>([]);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const finish = useCallback(() => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      /* ok */
    }
    setI(null);
  }, [storageKey]);

  useEffect(() => {
    if (seen(storageKey)) return;
    const t = setTimeout(() => {
      const list = steps.filter((s) => document.querySelector(s.target));
      if (!list.length) return;
      setAvail(list);
      setI(0);
    }, 500);
    return () => clearTimeout(t);
  }, [storageKey, steps]);

  const step = i !== null ? avail[i] : undefined;
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step]);
  useEffect(() => {
    if (step) cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }, [step]);
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, finish]);

  if (!step || !rect || i === null) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(320, vw - 24);
  const left = Math.max(12, Math.min(vw - width - 12, rect.left + rect.width / 2 - width / 2));
  const below = rect.bottom + 180 < vh || rect.top < 200;
  const last = i === avail.length - 1;
  return (
    <>
      <div className="no-print pointer-events-none fixed z-[55] rounded-xl ring-4 ring-accent/60 transition-all" style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }} aria-hidden />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-b`}
        data-testid="tour"
        className="np-fade-in no-print fixed z-[56] rounded-2xl border border-accent/40 bg-surface p-4 shadow-card"
        style={below ? { top: rect.bottom + 12, left, width } : { bottom: vh - rect.top + 12, left, width }}
      >
        <div className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p id={`${id}-t`} className="font-semibold text-ink">
              {step.title}
            </p>
            <p id={`${id}-b`} className="mt-1 text-sm text-ink2">
              {step.body}
            </p>
          </div>
          <button type="button" aria-label="Fechar dicas" onClick={finish} className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:text-ink">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-muted">
            Dica {i + 1} de {avail.length}
          </span>
          <span className="flex gap-2">
            {!last && (
              <Button size="sm" variant="ghost" onClick={finish}>
                Pular
              </Button>
            )}
            <Button size="sm" data-autofocus onClick={() => (last ? finish() : setI(i + 1))}>
              {last ? 'Entendi' : 'Próxima'}
            </Button>
          </span>
        </div>
      </div>
    </>
  );
}
