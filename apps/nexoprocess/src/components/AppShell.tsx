import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { HelpCircle, LayoutGrid, Moon, Sun, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import { BRAND } from '../config/brand';
import { useTheme } from '../state/theme';
import { Logo } from './Logo';
import { ErrorBoundary } from './ErrorBoundary';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx('inline-flex h-10 w-10 items-center justify-center rounded-lg text-current opacity-80 hover:bg-white/10 hover:opacity-100', className)}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}

/** Indica conexão: o app funciona offline (dados locais); só o carregamento inicial precisa de rede. */
function Connectivity() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return (
    <span role="status" className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs font-medium" title="Sem internet: tudo continua funcionando, pois os dados ficam neste aparelho. Atualizações do app chegam quando a conexão voltar.">
      <WifiOff className="h-3.5 w-3.5" aria-hidden /> Offline — seus dados continuam disponíveis
    </span>
  );
}

export default function AppShell() {
  const link = ({ isActive }: { isActive: boolean }) => clsx('inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium', isActive ? 'bg-white/10 text-navInk' : 'text-navInk/80 hover:text-navInk');
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-brandInk">
        Pular para o conteúdo
      </a>
      <header className="no-print safe-top sticky top-0 z-40 bg-nav text-navInk">
        <div className="safe-x mx-auto flex h-14 max-w-[1440px] items-center gap-2">
          <Link to="/app" className="mr-auto flex items-center gap-2.5 font-semibold tracking-tight" aria-label={`${BRAND.name} — Meus projetos`}>
            <Logo className="h-7 w-7" />
            <span className="hidden sm:inline">{BRAND.name}</span>
          </Link>
          <Connectivity />
          <nav aria-label="Principal" className="flex items-center gap-1">
            {/* No celular o texto some; o aria-label mantém o nome acessível. */}
            <NavLink to="/app" end className={link} aria-label="Meus projetos">
              <LayoutGrid className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Meus projetos</span>
            </NavLink>
            <NavLink to="/app/ajuda" className={link} aria-label="Ajuda">
              <HelpCircle className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Ajuda</span>
            </NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main id="conteudo" className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
