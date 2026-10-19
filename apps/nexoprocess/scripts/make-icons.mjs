// Gera os ícones PNG do PWA a partir do favicon.svg (usa o Chromium do Playwright).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const dir = new URL('../public/icons/', import.meta.url).pathname;
const svg = readFileSync(dir + 'favicon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
const shot = async (size, name, pad, bg) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size - pad * 2}" height="${size - pad * 2}" `)}</body></html>`);
  await page.screenshot({ path: dir + name, omitBackground: bg === 'transparent' });
};
await shot(192, 'icon-192.png', 0, 'transparent');
await shot(512, 'icon-512.png', 0, 'transparent');
await shot(512, 'icon-maskable-512.png', 72, '#173263');
await shot(180, 'apple-touch-icon.png', 14, '#173263');
await browser.close();
console.log('ícones gerados');
