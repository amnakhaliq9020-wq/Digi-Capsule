/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#f4f0e8',
        ink: '#1b242c',
        tide: '#1f5c57',
        tideDark: '#164743',
        mist: '#e7eeea',
        line: '#d5ddd8',
        card: '#fffcf7',
        clay: '#8d3b32',
        moss: '#1f6b45',
        sand: '#efe6d6',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Segoe UI', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      boxShadow: {
        card: '0 12px 30px rgba(27, 36, 44, 0.06)',
      },
    },
  },
  plugins: [],
};
