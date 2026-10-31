import { existsSync, readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Modo de venda (licença por e-mail): segundo build com chave pública SÓ DE TESTE.
const licenseKeys = JSON.parse(readFileSync(new URL('./tests/e2e/fixtures/license-test-keys.json', import.meta.url), 'utf8'));
export const LICENSE_TEST_CHECKOUT = 'https://pay.hotmart.com/TESTE';
export const LICENSE_TEST_SUPPORT = 'suporte@exemplo.com.br';

// E2E do NexoProcess contra o build de produção (vite preview).
// Usa CHROMIUM_PATH ou o Chromium pré-instalado do ambiente; senão, o do Playwright (CI).
const candidate = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const executablePath = existsSync(candidate) ? candidate : undefined;
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
    // Suíte funcional completa no desktop.
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, launchOptions: { executablePath } }, testIgnore: /license/ },
    // Build de venda (VITE_LICENSE_REQUIRED=true) na porta 4181.
    { name: 'licenca', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 }, baseURL: 'http://127.0.0.1:4181', launchOptions: { executablePath } }, testMatch: /license/ },
    // Larguras de referência da V4: 1440 · 768 · 390 (iPhone) · 320, além de Android (Pixel 7).
    { name: 'w1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } }, testMatch: /responsive/ },
    { name: 'w1024', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, launchOptions: { executablePath } }, testMatch: /responsive/ },
    { name: 'w768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, launchOptions: { executablePath } }, testMatch: /responsive/ },
    { name: 'iphone-390', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', launchOptions: { executablePath } }, testMatch: /responsive|mobile/ },
    { name: 'w320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, launchOptions: { executablePath } }, testMatch: /responsive|mobile/ },
    { name: 'android', use: { ...devices['Pixel 7'], launchOptions: { executablePath } }, testMatch: /responsive|mobile/ },
  ],
  webServer: [
    {
      command: 'npx vite build --config apps/nexoprocess/vite.config.ts && npx vite preview --config apps/nexoprocess/vite.config.ts --port 4180 --host 127.0.0.1 --strictPort',
      cwd: '../..',
      url: 'http://127.0.0.1:4180',
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite build --config apps/nexoprocess/vite.config.ts --outDir dist-licenca && npx vite preview --config apps/nexoprocess/vite.config.ts --outDir dist-licenca --port 4181 --host 127.0.0.1 --strictPort',
      cwd: '../..',
      url: 'http://127.0.0.1:4181',
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...(process.env as Record<string, string>),
        VITE_LICENSE_REQUIRED: 'true',
        VITE_LICENSE_PUBLIC_JWK: JSON.stringify(licenseKeys.publicJwk),
        VITE_HOTMART_CHECKOUT_URL: LICENSE_TEST_CHECKOUT,
        VITE_SUPPORT_EMAIL: LICENSE_TEST_SUPPORT,
        // Entrada EN (Gumroad): valores SÓ DE TESTE.
        VITE_GUMROAD_CHECKOUT_URL: 'https://example.gumroad.com/l/teste',
        VITE_EN_TERMS_URL: '/en/terms/',
        VITE_EN_PRIVACY_URL: '/en/privacy/',
        VITE_EN_REFUND_URL: '/en/refund/',
        BUNDLE_REPORT: 'false',
      },
    },
  ],
});
