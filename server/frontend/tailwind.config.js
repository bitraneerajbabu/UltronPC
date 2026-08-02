/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#FAF8F2',
          card: '#FFFFFF',
          border: 'rgba(0, 0, 0, 0.08)',
          'border-light': '#F4F0E6',
          btn: '#0F6E56',
          'btn-hover': '#085041',
          accent: '#1D9E75',
          muted: '#6B6E6C',
        },
      },
    },
  },
}

