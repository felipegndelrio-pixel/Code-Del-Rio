import { Link, NavLink, Outlet } from 'react-router-dom';
import { HelpCircle, LayoutGrid, Moon, Sun } from 'lucide-react';
import clsx from 'clsx';
import { BRAND } from '../config/brand';
import { useTheme } from '../state/theme';
import { Logo } from './Logo';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx('inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line/20 bg-surface2/60 text-ink2 hover:text-ink', className)}
      aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}

export default function AppShell() {
  const link = ({ isActive }: { isActive: boolean }) => clsx('inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold', isActive ? 'bg-surface2 text-ink' : 'text-ink2 hover:text-ink');
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-brandInk">
        Pular para o conteúdo
      </a>
      <header className="no-print safe-top sticky top-0 z-30 border-b border-line/15 bg-bg/85 backdrop-blur">
        <div className="safe-x mx-auto flex h-14 max-w-7xl items-center gap-2">
          <Link to="/app" className="mr-auto flex items-center gap-2 font-bold text-ink" aria-label={`${BRAND.name} — início do app`}>
            <Logo className="h-7 w-7" />
            <span className="hidden sm:inline">{BRAND.name}</span>
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1">
            <NavLink to="/app" end className={link}>
              <LayoutGrid className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Meus processos</span>
            </NavLink>
            <NavLink to="/app/ajuda" className={link}>
              <HelpCircle className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Ajuda</span>
            </NavLink>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <main id="conteudo" className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
