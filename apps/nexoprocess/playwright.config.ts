import { defineConfig, devices } from '@playwright/test';

// E2E do NexoProcess contra o build de produção (vite preview).
// Usa o Chromium pré-instalado; defina CHROMIUM_PATH para outro executável.
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: '../../test-results/nexoprocess',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, launchOptions: { executablePath } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } }, testMatch: /responsive|mobile/ },
  ],
  webServer: {
    command: 'npx vite build --config apps/nexoprocess/vite.config.ts && npx vite preview --config apps/nexoprocess/vite.config.ts --port 4180 --host 127.0.0.1 --strictPort',
    cwd: '../..',
    url: 'http://127.0.0.1:4180',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
