import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { hasAppHistory } from '../state/backNav';

/** "← Voltar" das telas internas: volta à tela anterior do app ou, sem histórico, ao destino padrão. */
export function BackButton({ fallback = '/app', label = 'Voltar', compact, className }: { fallback?: string; label?: string; compact?: boolean; className?: string }) {
  const nav = useNavigate();
  return (
    <button
      type="button"
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      onClick={() => (hasAppHistory() ? nav(-1) : nav(fallback))}
      className={clsx(
        'no-print inline-flex shrink-0 items-center rounded-lg font-semibold text-ink2 hover:bg-surface2 hover:text-ink',
        compact ? '-ml-2 h-10 w-10 justify-center' : '-ml-2 min-h-[36px] gap-1.5 px-2 text-sm',
        className,
      )}
    >
      <ArrowLeft className={compact ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden /> {!compact && label}
    </button>
  );
}
