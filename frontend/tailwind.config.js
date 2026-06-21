/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#0b0b0f',
          soft: '#16161d',
          muted: '#5b5b66',
        },
        sand: {
          50: '#faf8f4',
          100: '#f3eee5',
          200: '#e7dcc9',
          300: '#d8c6a6',
          400: '#c9a86a',
          500: '#b8924d',
        },
        accent: {
          DEFAULT: '#2f6df6',
          soft: '#eaf0ff',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,24,0.04), 0 12px 32px -12px rgba(16,16,24,0.18)',
        glow: '0 0 0 1px rgba(47,109,246,0.18), 0 8px 30px -8px rgba(47,109,246,0.35)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(47,109,246,0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgba(47,109,246,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(47,109,246,0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        marquee: 'marquee 32s linear infinite',
      },
    },
  },
  plugins: [],
}
