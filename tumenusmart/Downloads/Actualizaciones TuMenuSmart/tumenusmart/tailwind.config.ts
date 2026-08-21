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
    },
  },
  plugins: [],
};

export default config;
