import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          ink:        "#0F172A",
          subtle:     "#475569",
          tertiary:   "#94A3B8",
          muted:      "#CBD5E1",
          divider:    "#E2E8F0",
          surface:    "#FFFFFF",
          elevated:   "#F8FAFC",
          primary:    "#2563EB",
          "primary-hover": "#1D4ED8",
          accent:     "#0EA5E9",
        },
        semantic: {
          success: "#059669",
          warning: "#D97706",
          danger:  "#DC2626",
          info:    "#0284C7",
        },
      },
      boxShadow: {
        e1: "0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.04)",
        e2: "0 4px 12px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)",
        e3: "0 12px 32px rgba(15,23,42,0.08), 0 3px 6px rgba(15,23,42,0.04)",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Helvetica Neue", "sans-serif"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "flow-in":    "flowIn 0.35s ease-out",
      },
      keyframes: {
        flowIn: {
          "0%":   { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
