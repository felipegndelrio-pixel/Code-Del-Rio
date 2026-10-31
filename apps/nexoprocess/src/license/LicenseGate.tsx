// Protege as rotas de /app no build de venda. Com token válido, o app abre na hora
// (inclusive offline). Com conexão e token com mais de 1 hora, confere a compra em
// segundo plano; se foi reembolsada, o acesso sai. Também confere de novo quando a
// página volta do cache do navegador (botão Voltar) e quando outra aba sai.
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/ui';
import { useI18n } from '../i18n/I18nProvider';
import { clearToken, currentLicense, LICENSE, renew, TOKEN_KEY } from './config';
import { DEMO_KEY, isDemo } from './demo';

export default function LicenseGate() {
  const { t } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>(LICENSE.required ? 'checking' : 'ok');

  useEffect(() => {
    if (!LICENSE.required) return;
    let alive = true;
    const check = async (refresh: boolean) => {
      const lic = await currentLicense();
      if (!alive) return;
      if (!lic) {
        clearToken();
        if (isDemo()) {
          setState('ok');
          return;
        }
        setState('denied');
        return;
      }
      setState('ok');
      if (refresh && navigator.onLine && Date.now() / 1000 - lic.payload.iat > LICENSE.refreshAfterSec) {
        const r = await renew(lic.token);
        if (alive && !r.ok && r.reason === 'nao_encontrado') {
          clearToken();
          nav('/entrar?motivo=revogado', { replace: true });
        }
      }
    };
    void check(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TOKEN_KEY || e.key === DEMO_KEY) void check(false);
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void check(true);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onShow);
    return () => {
      alive = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onShow);
    };
  }, [nav]);

  if (state === 'checking') return <PageSkeleton label={t('gate.checking')} />;
  if (state === 'denied') return <Navigate to={`/entrar?volta=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}
