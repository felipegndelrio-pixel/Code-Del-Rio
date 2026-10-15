import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { CheckSquare, FolderKanban, HelpCircle, LayoutDashboard, LogOut, Shield, Sheet, UserCircle2, WifiOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useOnline } from '../hooks/useAsync';
import { isDemo } from '../lib/supabase';
import { resetDemo } from '../lib/demo/mockClient';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projetos', label: 'Projetos', icon: FolderKanban },
  { to: '/minhas-acoes', label: 'Minhas ações', icon: CheckSquare },
  { to: '/planilhas', label: 'Planilhas', icon: Sheet },
];

export default function Layout() {
  const { profile, signOut, session } = useAuth();
  const online = useOnline();
  const [confirmReset, setConfirmReset] = useState(false);
  const nav = [...NAV, ...(profile?.is_platform_admin ? [{ to: '/admin', label: 'Administração', icon: Shield }] : [])];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-navy-700 bg-navy-900/80 p-4 lg:flex">
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-brand">Gestão executiva</p>
          <p className="text-lg font-extrabold text-white">Projetos & Governança</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-teal-brand/15 text-teal-100' : 'text-slate-300 hover:bg-navy-800')
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
          <NavLink to="/ajuda" className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-navy-800">
            <HelpCircle className="h-4 w-4" /> Ajuda e instalação
          </NavLink>
        </nav>
        <div className="mt-3 border-t border-navy-700 pt-3 text-xs text-slate-400">
          <NavLink to="/perfil" className="block truncate hover:text-white">
            {profile?.full_name || session?.user.email}
          </NavLink>
          <button onClick={signOut} className="mt-2 flex items-center gap-1.5 text-slate-300 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-navy-700 bg-navy-950/90 px-4 py-3 backdrop-blur lg:hidden">
          <p className="text-sm font-extrabold text-white">Projetos & Governança</p>
          <div className="flex items-center gap-1">
            <NavLink to="/ajuda" className="rounded-lg p-2 text-slate-300" aria-label="Ajuda">
              <HelpCircle className="h-5 w-5" />
            </NavLink>
            <NavLink to="/perfil" className="rounded-lg p-2 text-slate-300" aria-label="Perfil">
              <UserCircle2 className="h-5 w-5" />
            </NavLink>
            <button onClick={signOut} className="rounded-lg p-2 text-slate-300" aria-label="Sair">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        {isDemo && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gradient-to-r from-cyan-700 to-teal-600 px-4 py-1.5 text-center text-xs font-semibold text-white">
            MODO DEMONSTRAÇÃO · dados fictícios, salvos só neste aparelho
            {confirmReset ? (
              <span className="flex items-center gap-2">
                Apagar suas alterações e voltar ao exemplo?
                <button
                  className="rounded bg-white/20 px-2 py-0.5 underline"
                  onClick={() => {
                    resetDemo();
                    window.location.reload();
                  }}
                >
                  Sim, restaurar
                </button>
                <button className="underline" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button className="underline" onClick={() => setConfirmReset(true)}>
                Restaurar exemplo
              </button>
            )}
          </div>
        )}
        {!online && !isDemo && (
          <div role="alert" className="flex items-center gap-2 bg-orange-600 px-4 py-2 text-sm font-semibold text-white">
            <WifiOff className="h-4 w-4" /> Sem conexão. Dados não são salvos offline; alterações exigem internet.
          </div>
        )}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-4 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-navy-700 bg-navy-950/95 backdrop-blur lg:hidden" aria-label="Navegação inferior">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive ? 'text-teal-200' : 'text-slate-400')}
            >
              <n.icon className="h-5 w-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
