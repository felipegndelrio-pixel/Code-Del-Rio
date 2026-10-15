import { defineConfig, devices } from '@playwright/test';

// E2E contra o stack LOCAL (npm run stack:up). O build usa --mode test, que
// carrega .env.test.local (somente variáveis VITE_* vão para o bundle).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } },
  ],
  webServer: {
    command: 'npx vite build --mode test --outDir dist-e2e && npx vite preview --mode test --outDir dist-e2e --port 4173 --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
