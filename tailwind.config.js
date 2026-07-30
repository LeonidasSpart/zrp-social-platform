/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zrp: {
          red: "#FF2D2D",
          darkRed: "#B10000",
          white: "#FFFFFF",
          silver: "#BDBDBD",
          charcoal: "#0D0D0D",
          deepBlack: "#050505",
        },
        primary: {
          DEFAULT: "#FF2D2D",
          dark: "#B10000",
        },
      },
      fontFamily: {
        orbitron: ["Orbitron", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
