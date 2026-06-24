/** KuKuMBA design system — cute-but-serious My-Little-Pony pastels on a deep,
 *  futuristic night base. Soft, glassy, glowy; no bouncy/spring animations. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#0E0B1A',
        ink: '#0B0817',
        surface: { DEFAULT: '#14102A', 2: '#1B1640', 3: '#241B52' },
        lav: '#B79CED',
        bubble: '#FF8FD0',
        mint: '#7EE7C7',
        sky: '#7CC4FF',
        sun: '#FFD86E',
        roul: { red: '#E5484D', black: '#272042', green: '#30A46C' },
      },
      fontFamily: {
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        sans: ['Onest', 'Manrope', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 45px -12px rgba(183,156,237,0.65)',
        'glow-pink': '0 0 45px -12px rgba(255,143,208,0.55)',
        'glow-mint': '0 0 45px -12px rgba(126,231,199,0.5)',
        card: '0 14px 40px -18px rgba(0,0,0,0.7)',
      },
      borderRadius: { xl2: '1.25rem', '3xl': '1.75rem' },
      backgroundImage: {
        holo: 'linear-gradient(135deg,#B79CED 0%,#7CC4FF 28%,#7EE7C7 52%,#FFD86E 76%,#FF8FD0 100%)',
        'holo-soft':
          'linear-gradient(135deg,rgba(183,156,237,0.16),rgba(124,196,255,0.14),rgba(126,231,199,0.12),rgba(255,143,208,0.14))',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        fadeup: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        sheen: { '0%': { backgroundPosition: '0% 50%' }, '100%': { backgroundPosition: '200% 50%' } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        fadeup: 'fadeup 0.35s ease-out both',
        sheen: 'sheen 8s linear infinite',
      },
    },
  },
  plugins: [],
};
