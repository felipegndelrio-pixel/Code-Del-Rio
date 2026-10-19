/** Marca textual/ícone próprios (troque junto com config/brand.ts). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="np-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#0b1630" />
      <circle cx="16" cy="32" r="6" fill="none" stroke="url(#np-g)" strokeWidth="4" />
      <path d="M22 32h8" stroke="url(#np-g)" strokeWidth="4" strokeLinecap="round" />
      <path d="M38 22l10 10-10 10-10-10z" fill="none" stroke="url(#np-g)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M48 32h4" stroke="url(#np-g)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
