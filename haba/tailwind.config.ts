import type { Config } from "tailwindcss";

// HABA design tokens — independent from Netstars Console.
//
// HABA = ハーバー研究所 (health food, natural). Palette leans warm green +
// cream, NOT Console's tech blue. Per haba-technical-plan §5.1 the two
// projects are intentionally decoupled — never import from netstars/.

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand: fresh green for "health food / medical foods"
        brand: {
          primary:       "#0F9D58",  // emerald-600-ish, MARVIE friendly
          "primary-hover": "#0B7E45",
          accent:        "#F59E0B",  // amber — warm, food-grade
          ink:           "#0B3D2E",  // dark forest, for headings on cream
        },
        // Payment-flow actor color tags — used in step animation.
        // Vendor-neutral names; upstream provider identities are not
        // surfaced on the consumer site.
        actor: {
          haba:     "#0F9D58",
          gateway:  "#2563EB",
          settler:  "#7C3AED",
          chain:    "#10B981",
          customer: "#F59E0B",
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
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Noto Sans JP", "Noto Sans SC", "system-ui", "sans-serif"],
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
        "2xl": "20px",
      },
      boxShadow: {
        e1: "0 1px 2px rgba(15,23,42,.04)",
        e2: "0 4px 12px rgba(15,23,42,.08)",
        e3: "0 12px 32px rgba(15,23,42,.12)",
      },
    },
  },
  plugins: [],
};

export default config;
