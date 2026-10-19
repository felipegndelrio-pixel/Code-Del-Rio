/** Símbolo próprio do NexoProcess: início → ligação → decisão (troque junto com config/brand.ts). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect x="2" y="2" width="60" height="60" rx="12" fill="#173263" />
      <circle cx="17" cy="32" r="6.5" fill="none" stroke="#ffffff" strokeWidth="4" />
      <path d="M23.5 32h7" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      <path d="M41 21l11 11-11 11-11-11z" fill="#00A8BC" />
    </svg>
  );
}
