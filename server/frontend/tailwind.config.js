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
          bg: '#b5cad0',
          card: '#c4d6db',
          border: '#9db7c0',
          'border-light': '#b5cad0',
          btn: '#5397ad',
          'btn-hover': '#468697',
          accent: '#3a7a8e',
          muted: '#4a6a78',
        },
      },
    },
  },
}

