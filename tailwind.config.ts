import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf3ff",
          100: "#f3e9ff",
          200: "#e8d9ff",
          300: "#d6beff",
          400: "#a982fb",
          500: "#7a65fb",
          600: "#6d55e8",
          700: "#5d43d4",
          800: "#4b35ad",
          900: "#382a80",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
