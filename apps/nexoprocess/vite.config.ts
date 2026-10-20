import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwind from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { BRAND_MANIFEST } from './src/config/manifest';

/**
 * Registra qual módulo foi para qual chunk em `.reports/bundle-report.json`
 * (fora do `dist`, não é publicado). Usado por `scripts/check-bundle.mjs`.
 */
function bundleReport(): Plugin {
  return {
    name: 'nexo-bundle-report',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter((c) => c.type === 'chunk')
        .map((c) => ({ file: c.fileName, name: c.name, isEntry: c.isEntry, imports: c.imports, dynamicImports: c.dynamicImports, modules: c.moduleIds }));
      mkdirSync(import.meta.dirname + '/.reports', { recursive: true });
      writeFileSync(import.meta.dirname + '/.reports/bundle-report.json', JSON.stringify(chunks, null, 1));
    },
  };
}

/**
 * Grupos de chunks na ordem do plano (Fase 1): react-vendor primeiro, para o React
 * nunca cair no chunk de gráficos. No Rolldown (Vite 8) o `manualChunks` está
 * descontinuado e vira um grupo único sem prioridade (o grupo do Recharts capturava o
 * React); por isso usamos `codeSplitting.groups` com prioridade pela ordem abaixo.
 * Cada grupo lista o pacote e as dependências que só ele usa. Exceções deliberadas:
 * `clsx` é usado pelo app e pelo Recharts e vai para `react-vendor` (sempre carregado);
 * se ficasse em `charts`, a entrada voltaria a importar o Recharts. `jszip`, usado
 * direto na exportação, tem grupo próprio (no Rollup ele cairia em `xlsx`).
 */
const CHUNK_GROUPS: [string, string[]][] = [
  ['react-vendor', ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom', 'cookie', 'set-cookie-parser', 'use-sync-external-store', 'clsx']],
  ['redux', ['@reduxjs/toolkit', '@standard-schema/spec', '@standard-schema/utils', 'react-redux', 'redux', 'redux-thunk', 'immer', 'reselect']],
  ['charts', ['recharts', 'decimal.js-light', 'es-toolkit', 'eventemitter3', 'tiny-invariant', 'victory-vendor', 'internmap', 'react-is', 'd3-*']],
  ['bpmn', ['bpmn-js', 'bpmn-moddle', 'moddle', 'moddle-xml', 'saxen', 'diagram-js', '@bpmn-io/diagram-js-ui', 'diagram-js-direct-editing', 'didi', 'min-dash', 'min-dom', 'domify', 'tiny-svg', 'object-refs', 'path-intersection', 'inherits-browser', 'ids', 'htm', 'preact', 'preact-render-to-string']],
  ['xlsx', ['exceljs', 'xlsx']],
  ['zip', ['jszip']],
];

// Ordem vira prioridade: o primeiro grupo captura seus módulos antes dos demais.
const pkgPattern = (pkgs: string[]) =>
  new RegExp(`[\\\\/]node_modules[\\\\/](?:${pkgs.map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*$/, '[^\\\\/]*')).join('|')})[\\\\/]`);
const CODE_SPLITTING_GROUPS = CHUNK_GROUPS.map(([name, pkgs], i) => ({ name, test: pkgPattern(pkgs), priority: CHUNK_GROUPS.length - i }));

// NexoProcess — app estático, local-first (sem backend). Variáveis de build:
//   VITE_BASE=/sub/   subcaminho de hospedagem (padrão: /)
//   VITE_ROUTER=hash  rotas por hash (hospedagem sem fallback de SPA)
//   SINGLEFILE=true   um único index.html (prévia), sem service worker
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, import.meta.dirname, '') };
  const single = env.SINGLEFILE === 'true';
  const themeInit = readFileSync(import.meta.dirname + '/public/theme-init.js', 'utf8');
  return {
    root: import.meta.dirname,
    base: env.VITE_BASE || '/',
    envDir: import.meta.dirname,
    css: { postcss: { plugins: [tailwind({ config: import.meta.dirname + '/tailwind.config.js' }), autoprefixer()] } },
    plugins: [
      react(),
      VitePWA({
        disable: single,
        registerType: 'prompt',
        includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
        manifest: BRAND_MANIFEST,
        workbox: {
          // Somente o app shell estático. Os dados do usuário ficam no IndexedDB
          // do próprio navegador e não passam pelo service worker.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          // A API de licença (/api/*) nunca recebe o index.html do app shell.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
      }),
      ...(single || env.BUNDLE_REPORT === 'false' ? [] : [bundleReport()]),
      ...(single
        ? [
            viteSingleFile(),
            {
              name: 'inline-theme-init',
              transformIndexHtml: (html: string) =>
                html.replace(/<link rel="(icon|apple-touch-icon)"[^>]*>/g, '').replace(/<script src="[^"]*theme-init\.js"><\/script>/, `<script>${themeInit}</script>`),
            },
          ]
        : []),
    ],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 2500,
      rollupOptions: single
        ? {}
        : {
        output: {
          codeSplitting: { groups: CODE_SPLITTING_GROUPS },
        },
      },
    },
    server: { port: 5180 },
    preview: { port: 4180 },
  };
});
