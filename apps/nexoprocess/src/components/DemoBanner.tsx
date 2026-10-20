// Faixa fixa do modo de demonstração + aviso quando algo seria salvo/exportado.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, X } from 'lucide-react';
import { LICENSE } from '../license/config';
import { DEMO_EVENT, DEMO_MESSAGE, endDemo, isDemo } from '../license/demo';

function BuyLinks({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  return (
    <span className="flex flex-wrap items-center gap-2">
      {LICENSE.checkoutUrl && (
        <a href={LICENSE.checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center rounded-lg bg-brand px-3 text-sm font-semibold text-brandInk hover:opacity-90">
          Comprar acesso
        </a>
      )}
      <button
        type="button"
        className="inline-flex min-h-[32px] items-center rounded-lg px-2 text-sm font-semibold text-ink underline-offset-2 hover:underline"
        onClick={() => {
          endDemo();
          nav('/entrar');
        }}
      >
        {compact ? 'Já comprei' : 'Já comprei — entrar'}
      </button>
    </span>
  );
}

export default function DemoBanner() {
  const [blocked, setBlocked] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setBlocked(true);
    window.addEventListener(DEMO_EVENT, on);
    return () => window.removeEventListener(DEMO_EVENT, on);
  }, []);
  useEffect(() => {
    if (blocked) ref.current?.focus();
  }, [blocked]);
  if (!isDemo()) return null;
  return (
    <>
      <div className="no-print border-b border-amber/40 bg-amber/10">
        <p className="safe-x mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm text-ink">
          <span className="mr-auto">
            <strong>Versão de demonstração.</strong> Explore à vontade; nada é salvo nem exportado.
          </span>
          <BuyLinks compact />
        </p>
      </div>
      {blocked && (
        <div
          ref={ref}
          tabIndex={-1}
          role="alert"
          data-testid="demo-blocked"
          className="no-print fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[65] mx-auto max-w-lg rounded-2xl border border-amber/50 bg-surface p-4 shadow-card outline-none lg:bottom-6"
        >
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-semibold text-ink">{DEMO_MESSAGE}</p>
              <p className="text-sm text-ink2">Com o acesso, seus processos ficam salvos neste aparelho e você exporta PDF, planilhas e BPMN.</p>
              <BuyLinks />
            </div>
            <button type="button" aria-label="Fechar aviso" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted hover:text-ink" onClick={() => setBlocked(false)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
