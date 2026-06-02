import type { Config } from "tailwindcss";

// HABA design tokens — Editorial Calm palette.
// Independent from Netstars Console (tech blue). Per haba-technical-plan §5.1.
// Palette reference: Aesop / high-end medicated cosmetics × Japanese pharmacy.

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand green — forest, premium depth
        brand: {
          primary:       "#2F5D45",   // deep forest green
          "primary-hover": "#254B38",
          light:         "#3D7A5A",
          subtle:        "rgba(47,93,69,0.08)",
          border:        "rgba(47,93,69,0.20)",
          ink:           "#1B2D24",   // deep forest ink — headings on cream
          accent:        "#C4763A",   // warm amber/cognac — CTA warmth
          "accent-subtle": "rgba(196,118,58,0.10)",
        },
        // Semantic
        semantic: {
          success: "#2A6E4C",
          warning: "#B8782A",
          danger:  "#B83232",
          info:    "#1E5A8E",
        },
        // Surface — warm cream stack
        surface: {
          page:     "var(--bg-page)",
          base:     "var(--bg-surface)",
          elevated: "var(--bg-surface-elevated)",
          muted:    "var(--bg-muted)",
          deep:     "var(--bg-deep)",
        },
        // Border — warm tones
        border: {
          subtle:  "var(--border-subtle)",
          default: "var(--border-default)",
          strong:  "var(--border-strong)",
        },
        // Ink — text hierarchy
        ink: {
          primary:   "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary:  "var(--text-tertiary)",
          inverse:   "var(--text-inverse)",
        },
      },
      fontFamily: {
        // Display serif: Bodoni Moda (Latin) — high contrast, editorial luxury
        // CJK serif via CSS variable so next/font handles the variable
        serif:   ["var(--font-bodoni)", "Noto Serif SC", "Noto Serif JP", "Georgia", "serif"],
        // Body sans: Jost (geometric Latin) + Noto Sans SC/JP for CJK
        sans:    ["var(--font-jost)", "Noto Sans SC", "Noto Sans JP", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
      fontSize: {
        caption: ["12px", { lineHeight: "18px", letterSpacing: "0.01em" }],
        small:   ["13px", { lineHeight: "20px" }],
        body:    ["15px", { lineHeight: "24px" }],
        lg:      ["17px", { lineHeight: "26px" }],
        // Display scale
        "display-sm":  ["32px", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        "display-md":  ["44px", { lineHeight: "1.10", letterSpacing: "-0.025em" }],
        "display-lg":  ["56px", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "display-xl":  ["72px", { lineHeight: "1.0",  letterSpacing: "-0.035em" }],
      },
      borderRadius: {
        sm:     "6px",
        DEFAULT:"10px",
        lg:     "14px",
        xl:     "18px",
        "2xl":  "24px",
        "3xl":  "32px",
      },
      boxShadow: {
        // Warm-tinted shadows, not cold gray
        e1: "0 1px 3px rgba(27,45,36,.06)",
        e2: "0 4px 16px rgba(27,45,36,.09)",
        e3: "0 12px 40px rgba(27,45,36,.14)",
        e4: "0 24px 64px rgba(27,45,36,.18)",
        // Inset for pressed states
        "inset-sm": "inset 0 1px 2px rgba(27,45,36,.08)",
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter:  "-0.02em",
        tight:    "-0.01em",
        normal:   "0em",
        wide:     "0.05em",
        wider:    "0.10em",
        widest:   "0.16em",
      },
      spacing: {
        // Consistent 4pt rhythm
        "4.5": "18px",
        "13":  "52px",
        "18":  "72px",
        "22":  "88px",
        "26":  "104px",
      },
    },
  },
  plugins: [],
};

export default config;
