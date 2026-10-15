import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Config } from 'tailwindcss';

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  content: [path.join(here, 'index.html'), path.join(here, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        paper: '#F6F2EC',
        ink: { DEFAULT: '#1B1F2A', soft: '#4A5160', faint: '#8A909C' },
        line: '#E9E3DA',
        navy: { DEFAULT: '#1F2A44', deep: '#161E33', soft: '#2B3960' },
        brand: { DEFAULT: '#F0803C', deep: '#D2641F', soft: '#FFF1E6', mid: '#FFD9BF' },
        good: { DEFAULT: '#23876A', soft: '#E3F5EE' },
        warn: { DEFAULT: '#B8731A', soft: '#FCF1DC' },
        alert: { DEFAULT: '#C4423E', soft: '#FBE6E4' },
        calm: { DEFAULT: '#5B6B8C', soft: '#EEF1F6' },
      },
      borderRadius: { xl2: '1.25rem', xl3: '1.75rem' },
      boxShadow: {
        card: '0 1px 2px rgba(27,31,42,.04), 0 8px 24px -12px rgba(27,31,42,.10)',
        lift: '0 2px 4px rgba(27,31,42,.06), 0 18px 40px -16px rgba(27,31,42,.22)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        pulseRing: { '0%': { transform: 'scale(.9)', opacity: '.55' }, '100%': { transform: 'scale(1.5)', opacity: '0' } },
      },
      animation: { rise: 'rise .35s ease-out both', pulseRing: 'pulseRing 1.6s ease-out infinite' },
    },
  },
  plugins: [],
} satisfies Config;
