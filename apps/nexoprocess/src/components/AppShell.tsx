import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type MouseEvent } from 'react';
import { HelpCircle, LayoutGrid, LogOut, Moon, Sun, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import { BRAND } from '../config/brand';
import { useTheme } from '../state/theme';
import { useI18n } from '../i18n/I18nProvider';
import { LICENSE, loadToken } from '../license/config';
import { signOut } from '../license/session';
import { Logo } from './Logo';
import { ErrorBoundary } from './ErrorBoundary';
import DemoBanner from './DemoBanner';
import { useConfirm } from './ui';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggle}
      className={clsx('inline-flex h-10 w-10 items-center justify-center rounded-lg text-current opacity-80 hover:bg-white/10 hover:opacity-100', className)}
      aria-label={theme === 'dark' ? t('shell.theme.toLight') : t('shell.theme.toDark')}
      title={theme === 'dark' ? t('shell.theme.lightTitle') : t('shell.theme.darkTitle')}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}

/** Indica conexão: o app funciona offline (dados locais); só o carregamento inicial precisa de rede. */
function Connectivity() {
  const { t } = useI18n();
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
    <span role="status" className="inline-flex items-center gap-1 rounded-md bg-white/10 px-1.5 py-1 text-xs font-medium sm:px-2" title={t('shell.offline.title')}>
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      {/* No celular, só o ícone: o cabeçalho precisa caber em 320 px com os três atalhos. */}
      <span className="sr-only sm:not-sr-only">{t('shell.offline.label')}</span>
    </span>
  );
}

/** Atalho do cabeçalho: no celular, ícone com rótulo curto embaixo; a partir de sm, em linha. */
const navItem = (active: boolean) =>
  clsx(
    'inline-flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 text-[11px] font-medium leading-none sm:min-h-[40px] sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm',
    active ? 'bg-white/15 text-navInk shadow-[inset_0_-2px_0_currentColor]' : 'text-navInk/80 hover:bg-white/10 hover:text-navInk',
  );

/** Sai deste aparelho (não revoga a compra). Sem internet, avisa antes: entrar de novo exige conexão. */
function SignOutButton() {
  const { t } = useI18n();
  const nav = useNavigate();
  const confirm = useConfirm();
  const out = async () => {
    if (
      !navigator.onLine &&
      !(await confirm({ title: t('shell.signout.confirmTitle'), body: <>{t('shell.signout.confirmBody')}</>, confirm: t('shell.signout.confirmButton') }))
    )
      return;
    signOut();
    nav('/entrar?motivo=saiu', { replace: true });
  };
  return (
    <button type="button" onClick={() => void out()} className={navItem(false)} aria-label={t('shell.signout.aria')} title={t('shell.signout.title')}>
      <LogOut className="h-4 w-4" aria-hidden />
      <span>{t('shell.signout.label')}</span>
    </button>
  );
}

export default function AppShell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  // Só no build de venda e com acesso salvo; na demonstração a faixa já oferece "Já comprei — entrar".
  const signedIn = LICENSE.required && loadToken() !== null;
  // Já na listagem, "Meus projetos" não tem para onde ir: volta ao topo e leva o foco ao título.
  const onProjects = (e: MouseEvent) => {
    if (pathname !== '/app') return;
    e.preventDefault();
    window.scrollTo({ top: 0 });
    const h = document.querySelector<HTMLElement>('#conteudo h1');
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  };
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-brandInk">
        {t('shell.skip')}
      </a>
      <header className="no-print safe-top sticky top-0 z-40 bg-nav text-navInk">
        <div className="safe-x mx-auto flex h-14 max-w-[1440px] items-center gap-1 sm:gap-2">
          <Link to="/app" onClick={onProjects} className="mr-auto flex min-h-[44px] min-w-[44px] items-center gap-2.5 font-semibold tracking-tight" aria-label={`${BRAND.name} — ${t('shell.projects')}`}>
            <Logo className="h-7 w-7" />
            <span className="hidden sm:inline">{BRAND.name}</span>
          </Link>
          <Connectivity />
          <nav aria-label={t('shell.nav.main')} className="flex items-center gap-0.5 sm:gap-1">
            <NavLink to="/app" end onClick={onProjects} className={({ isActive }) => navItem(isActive)} aria-label={t('shell.projects')}>
              <LayoutGrid className="h-4 w-4" aria-hidden />
              <span className="sm:hidden">{t('shell.projectsShort')}</span>
              <span className="hidden sm:inline">{t('shell.projects')}</span>
            </NavLink>
            <NavLink to="/app/ajuda" className={({ isActive }) => navItem(isActive)}>
              <HelpCircle className="h-4 w-4" aria-hidden />
              <span>{t('shell.help')}</span>
            </NavLink>
            {signedIn && <SignOutButton />}
          </nav>
          <ThemeToggle />
        </div>
      </header>
      <DemoBanner />
      <main id="conteudo" className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
