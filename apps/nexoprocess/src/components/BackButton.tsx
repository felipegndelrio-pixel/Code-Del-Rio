import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { hasAppHistory } from '../state/backNav';

/** "← Voltar" das telas internas: volta à tela anterior do app ou, sem histórico, ao destino padrão. */
export function BackButton({ fallback = '/app', label = 'Voltar', className }: { fallback?: string; label?: string; className?: string }) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      onClick={() => (hasAppHistory() ? nav(-1) : nav(fallback))}
      className={clsx('no-print -ml-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-ink2 hover:bg-surface2 hover:text-ink', className)}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
