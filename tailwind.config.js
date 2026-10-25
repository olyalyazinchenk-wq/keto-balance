/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        keto: {
          green: '#2E7D32',
          avocado: '#81C784',
          gold: '#FBC02D',
        }
      }
    },
  },
  plugins: [],
}
