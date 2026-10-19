import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { BRAND_MANIFEST } from './src/config/manifest';

// NexoProcess — app estático, local-first (sem backend). Variáveis de build:
//   VITE_BASE=/sub/   subcaminho de hospedagem (padrão: /)
//   VITE_ROUTER=hash  rotas por hash (hospedagem sem fallback de SPA)
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, import.meta.dirname, '') };
  return {
    root: import.meta.dirname,
    base: env.VITE_BASE || '/',
    envDir: import.meta.dirname,
    css: { postcss: { plugins: [tailwind({ config: import.meta.dirname + '/tailwind.config.js' }), autoprefixer()] } },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: BRAND_MANIFEST,
        workbox: {
          // Somente o app shell estático. Os dados do usuário ficam no IndexedDB
          // do próprio navegador e não passam pelo service worker.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2500,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('exceljs')) return 'exceljs';
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('bpmn-js') || id.includes('diagram-js') || id.includes('moddle') || id.includes('tiny-svg')) return 'bpmn';
            return undefined;
          },
        },
      },
    },
    server: { port: 5180 },
    preview: { port: 4180 },
  };
});
