import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Variáveis de build:
//   VITE_DEMO=true        modo demonstração (sem servidor, dados no aparelho)
//   VITE_BASE=/repo/      subcaminho de hospedagem (GitHub Pages)
//   VITE_ROUTER=hash      rotas por hash (hospedagem sem fallback SPA)
//   SINGLEFILE=true       gera um único index.html (prévia/artefato), sem service worker
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  const single = env.SINGLEFILE === 'true';
  return {
    base: env.VITE_BASE || '/',
    plugins: [
      react(),
      VitePWA({
        disable: single,
        registerType: 'prompt',
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'Gestão Executiva de Projetos',
          short_name: 'Projetos',
          description: 'Projetos, planos de ação e governança com dashboard executivo.',
          lang: 'pt-BR',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'any',
          background_color: '#06142b',
          theme_color: '#06142b',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Somente o "app shell" estático é armazenado em cache.
          // Respostas da API (dados protegidos) NUNCA são cacheadas.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/auth\//, /^\/rest\//, /^\/storage\//],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        },
      }),
      ...(single ? [viteSingleFile()] : []),
    ],
    build: {
      chunkSizeWarningLimit: 4000,
      rollupOptions: single
        ? {}
        : {
            output: {
              manualChunks(id: string) {
                if (id.includes('exceljs')) return 'exceljs';
                if (id.includes('recharts') || id.includes('d3-')) return 'charts';
                if (id.includes('@supabase')) return 'supabase';
                return undefined;
              },
            },
          },
    },
  };
});
