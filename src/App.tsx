import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { isConfigured } from './lib/supabase';
import { Spinner } from './components/ui';
import Layout from './components/Layout';
import { ForgotPassword, Login, ResetPassword, Signup } from './pages/Auth';
import Setup from './pages/Setup';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const MyActions = lazy(() => import('./pages/MyActions'));
const ImportExport = lazy(() => import('./pages/ImportExport'));
const Admin = lazy(() => import('./pages/Admin'));
const Help = lazy(() => import('./pages/Help'));
const Profile = lazy(() => import('./pages/Profile'));

function Private({ children }: { children: React.ReactNode }) {
  const { session, loading, recovering } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner label="Verificando sessão…" />;
  if (recovering) return <Navigate to="/redefinir-senha" replace />;
  if (!session) return <Navigate to="/entrar" state={{ from: loc.pathname }} replace />;
  return <>{children}</>;
}

export default function App() {
  if (!isConfigured) return <Setup />;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/entrar" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route
          element={
            <Private>
              <Layout />
            </Private>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="projetos" element={<Projects />} />
          <Route path="projetos/:id" element={<ProjectDetail />} />
          <Route path="minhas-acoes" element={<MyActions />} />
          <Route path="planilhas" element={<ImportExport />} />
          <Route path="admin" element={<Admin />} />
          <Route path="ajuda" element={<Help />} />
          <Route path="perfil" element={<Profile />} />
          <Route path="*" element={<p className="p-8 text-slate-300">Página não encontrada.</p>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
