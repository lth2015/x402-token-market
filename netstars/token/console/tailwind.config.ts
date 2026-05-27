import type { Config } from "tailwindcss";

// Design tokens come straight from netstars/token/ui/UX-SPEC.md §2.1
// (extended with semantic helpers for dark mode in §12).

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary:       "#2563EB",
          "primary-hover": "#1D4ED8",
          secondary:     "#3B82F6",
        },
        semantic: {
          success: "#10B981",
          warning: "#F59E0B",
          danger:  "#DC2626",
          info:    "#0EA5E9",
        },
        surface: {
          page:     "var(--bg-page)",
          base:     "var(--bg-surface)",
          elevated: "var(--bg-surface-elevated)",
          muted:    "var(--bg-muted)",
        },
        border: {
          subtle:  "var(--border-subtle)",
          default: "var(--border-default)",
        },
        ink: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary:  "var(--text-tertiary)",
        },
        // chart palette (color-blind friendly)
        chart: {
          1: "#2563EB",
          2: "#14B8A6",
          3: "#F59E0B",
          4: "#8B5CF6",
          5: "#EC4899",
          6: "#84CC16",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Noto Sans JP", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "16px" }],
        small:   ["13px", { lineHeight: "18px" }],
        body:    ["14px", { lineHeight: "20px" }],
        lg:      ["16px", { lineHeight: "24px" }],
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        e1: "0 1px 2px rgba(15,23,42,.04)",
        e2: "0 4px 12px rgba(15,23,42,.08)",
        e3: "0 12px 32px rgba(15,23,42,.12)",
      },
      animation: {
        "live-pulse":     "live-pulse 1.6s ease-in-out infinite",
        "slide-in-down":  "slide-in-down 200ms cubic-bezier(0.16,1,0.3,1)",
      },
      keyframes: {
        "live-pulse": {
          "0%":   { boxShadow: "0 0 0 0 rgba(16,185,129,.6)" },
          "70%":  { boxShadow: "0 0 0 10px rgba(16,185,129,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(16,185,129,0)" },
        },
        "slide-in-down": {
          "0%":   { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
