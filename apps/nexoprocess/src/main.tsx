import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { Providers } from './components/ui';
import PwaUpdater from './components/PwaUpdater';
import './styles/index.css';

// Rotas por hash para hospedagens estáticas sem fallback de SPA.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={import.meta.env.VITE_ROUTER === 'hash' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      <Providers>
        <App />
        <PwaUpdater />
      </Providers>
    </Router>
  </StrictMode>,
);
