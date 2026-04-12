/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#effcfb",
          100: "#d7f6f2",
          200: "#b2ebe4",
          300: "#7cdcd4",
          400: "#46c5bf",
          500: "#1faca9",
          600: "#138a8b",
          700: "#136d70",
          800: "#15575a",
          900: "#16494b",
        },
        slateblue: {
          50: "#eef5ff",
          100: "#d8e8ff",
          200: "#b9d8ff",
          300: "#8bc0ff",
          400: "#589dfb",
          500: "#367df0",
          600: "#215fdb",
          700: "#1e4cb3",
          800: "#213f91",
          900: "#203875",
        },
      },
      fontFamily: {
        sans: ['"Public Sans"', '"Segoe UI Variable"', '"Segoe UI"', "sans-serif"],
      },
      boxShadow: {
        soft: "0 18px 45px -24px rgba(15, 23, 42, 0.32)",
        panel: "0 14px 32px -20px rgba(14, 116, 144, 0.35)",
      },
      backgroundImage: {
        "hero-gradient":
          "linear-gradient(135deg, rgba(20,184,166,0.18), rgba(37,99,235,0.10) 55%, rgba(255,255,255,0.95))",
      },
    },
  },
  plugins: [],
};
