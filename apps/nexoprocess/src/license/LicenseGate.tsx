// Protege as rotas de /app no build de venda. Com token válido, o app abre na hora
// (inclusive offline). Com conexão e token com mais de 7 dias, renova em segundo
// plano; se a compra foi reembolsada, o acesso sai.
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageSkeleton } from '../components/ui';
import { activate, clearToken, currentLicense, LICENSE } from './config';
import { isDemo } from './demo';

export default function LicenseGate() {
  const loc = useLocation();
  const nav = useNavigate();
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>(LICENSE.required ? 'checking' : 'ok');

  useEffect(() => {
    if (!LICENSE.required) return;
    let alive = true;
    (async () => {
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
      if (navigator.onLine && Date.now() / 1000 - lic.payload.iat > LICENSE.refreshAfterSec) {
        const r = await activate({ token: lic.token });
        if (alive && !r.ok && r.reason === 'nao_encontrado') {
          clearToken();
          nav('/entrar?motivo=revogado', { replace: true });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav]);

  if (state === 'checking') return <PageSkeleton label="Conferindo o acesso…" />;
  if (state === 'denied') return <Navigate to={`/entrar?volta=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}
