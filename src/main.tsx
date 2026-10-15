import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import PwaUpdater from './components/PwaUpdater';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './components/ui';
import { useHashRouter } from './lib/supabase';
import './index.css';

// Roteamento por hash para hospedagens estáticas sem fallback de SPA (GitHub Pages, demo).
const Router = useHashRouter ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <ToastProvider>
          <App />
          <PwaUpdater />
        </ToastProvider>
      </AuthProvider>
    </Router>
  </StrictMode>,
);
