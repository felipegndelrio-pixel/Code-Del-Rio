import { defineConfig, devices } from '@playwright/test';

// E2E do MODO DEMONSTRAÇÃO (arquivo único, sem servidor de dados), em viewport de iPhone.
export default defineConfig({
  testDir: 'tests/e2e-demo',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' },
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
  },
  webServer: {
    command: 'npm run build:preview-file && python3 -m http.server 4174 --bind 127.0.0.1 --directory dist-single',
    url: 'http://127.0.0.1:4174',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
