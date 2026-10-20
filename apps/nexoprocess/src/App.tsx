import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Empty, Spinner } from './components/ui';
import Landing from './pages/Landing';
import Home from './pages/Home';
import AppShell from './components/AppShell';
import LicenseGate from './license/LicenseGate';

const Wizard = lazy(() => import('./pages/Wizard'));
const Assistant = lazy(() => import('./pages/Assistant'));
const ImportPage = lazy(() => import('./pages/Import'));
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'));
const Help = lazy(() => import('./pages/Help'));
const Login = lazy(() => import('./pages/Login'));

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/entrar" element={<Login />} />
        <Route element={<AppShell />}>
          <Route path="/app/ajuda" element={<Help />} />
          {/* No build de venda (VITE_LICENSE_REQUIRED=true) exige o e-mail da compra; senão, passa direto. */}
          <Route element={<LicenseGate />}>
            <Route path="/app" element={<Home />} />
            <Route path="/app/novo" element={<Assistant />} />
            <Route path="/app/novo/formulario" element={<Wizard />} />
            <Route path="/app/importar" element={<ImportPage />} />
            <Route path="/app/p/:id/*" element={<WorkspacePage />} />
          </Route>
          <Route
            path="*"
            element={
              <div className="mx-auto max-w-xl p-6">
                <Empty title="Página não encontrada" action={<Link className="font-semibold text-brand underline" to="/app">Voltar ao início</Link>}>
                  O endereço não existe ou foi digitado errado.
                </Empty>
              </div>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}
