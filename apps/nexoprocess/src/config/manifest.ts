// Manifesto PWA. Nome e cores vêm de brand.ts para trocar a marca em um só lugar.
import { BRAND } from './brand';

export const BRAND_MANIFEST = {
  name: BRAND.name,
  short_name: BRAND.shortName,
  description: BRAND.tagline,
  lang: 'pt-BR',
  start_url: './app',
  scope: './',
  display: 'standalone' as const,
  orientation: 'any' as const,
  background_color: BRAND.colors.navy,
  theme_color: BRAND.colors.navy,
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
