import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6fe",
          200: "#bfd3fe",
          300: "#93b4fd",
          400: "#608cfa",
          500: "#3b65f6",
          600: "#2547eb",
          700: "#1d35d8",
          800: "#1e2faf",
          900: "#1e2d8a",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
