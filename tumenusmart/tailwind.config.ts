import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#e05d2f",
          dark: "#b8481f",
          light: "#fbe9e1",
        },
      },
      keyframes: {
        "destacado-entrada": {
          "0%": { transform: "translateX(-24px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        "destacado-entrada": "destacado-entrada 0.5s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
