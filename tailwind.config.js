/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#030b1a', 900: '#06142b', 850: '#0a1c3a', 800: '#0d2347', 700: '#143061', 600: '#1d417f' },
        cyan: { brand: '#22d3ee' },
        teal: { brand: '#2dd4bf' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { glow: '0 0 0 1px rgba(45,212,191,.35), 0 0 24px rgba(34,211,238,.12)' },
    },
  },
  plugins: [],
};
