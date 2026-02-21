module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './app/electron/**/*.{js,ts}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'neon-green': '#39FF14',
        brand: '#39FF14',
      },
    },
  },
  plugins: [],
};
