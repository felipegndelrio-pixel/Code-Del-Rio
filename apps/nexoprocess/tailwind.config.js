/** @type {import('tailwindcss').Config} */
// Cores vêm de tokens CSS (src/styles/index.css), então as mesmas classes
// funcionam nos temas claro e escuro. Raios e sombras sóbrios (V4).
const t = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: [__dirname + '/index.html', __dirname + '/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: t('bg'),
        surface: t('surface'),
        surface2: t('surface-2'),
        line: t('line'),
        ink: t('ink'),
        ink2: t('ink-2'),
        muted: t('muted'),
        brand: t('brand'),
        brandInk: t('brand-ink'),
        accent: t('accent'),
        accentStrong: t('accent-strong'),
        violet: t('violet'),
        amber: t('amber'),
        ok: t('ok'),
        warn: t('warn'),
        bad: t('bad'),
        nav: t('nav'),
        navInk: t('nav-ink'),
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Escala de raios contida: nada de cantos "pílula" em superfícies.
      borderRadius: { md: '6px', lg: '8px', xl: '8px', '2xl': '10px', '3xl': '12px' },
      boxShadow: { card: 'var(--shadow-card)', pop: 'var(--shadow-pop)', glow: '0 1px 2px rgb(14 22 38 / .12)' },
      maxWidth: { content: '72rem' },
    },
  },
  plugins: [],
};
