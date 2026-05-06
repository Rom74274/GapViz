/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a1a',
          surface: '#11112a',
          elevated: '#1a1a3a',
        },
        border: {
          subtle: '#23234a',
          strong: '#3a3a6a',
        },
        text: {
          primary: '#e6e6f0',
          secondary: '#a0a0c0',
          muted: '#6a6a8a',
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
