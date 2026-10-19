/** @type {import('tailwindcss').Config} */
// Cores vêm de tokens CSS (src/styles/tokens.css), então as mesmas classes
// funcionam nos temas claro e escuro.
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
        violet: t('violet'),
        amber: t('amber'),
        ok: t('ok'),
        warn: t('warn'),
        bad: t('bad'),
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      borderRadius: { xl2: '1.125rem' },
      boxShadow: { card: 'var(--shadow-card)', glow: '0 0 0 1px rgb(var(--brand) / .35), 0 8px 30px rgb(var(--brand) / .10)' },
    },
  },
  plugins: [],
};
