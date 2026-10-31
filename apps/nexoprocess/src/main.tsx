import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { Providers } from './components/ui';
import PwaUpdater from './components/PwaUpdater';
import { I18nProvider } from './i18n/I18nProvider';
import './state/install'; // captura o convite de instalação o quanto antes
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles/index.css';

// Rotas por hash para hospedagens estáticas sem fallback de SPA.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

// theme-init.js marca navegadores sem os recursos mínimos e mostra o aviso no lugar do app.
const boot = window as Window & { __nexoIncompativel?: boolean; __nexoIniciado?: boolean };
if (!boot.__nexoIncompativel) {
  boot.__nexoIniciado = true;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router basename={import.meta.env.VITE_ROUTER === 'hash' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
        <I18nProvider>
          <Providers>
            <App />
            <PwaUpdater />
          </Providers>
        </I18nProvider>
      </Router>
    </StrictMode>,
  );
}
