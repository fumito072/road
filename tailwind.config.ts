import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#07111f",
        foreground: "#e5eefb",
        accent: "#38bdf8",
        muted: "#94a3b8",
        card: "rgba(15, 23, 42, 0.82)",
        panel: "#0b1628",
        line: "#12243d",
      },
      boxShadow: {
        panel: "0 20px 60px rgba(15, 23, 42, 0.35)",
        glow: "0 0 0 1px rgba(34, 211, 238, 0.08), 0 24px 72px rgba(2, 6, 23, 0.46)",
      },
    },
  },
  plugins: [],
};

export default config;
