import type { Config } from "tailwindcss";

/**
 * Theme tokens extracted verbatim from the volt-on-black design reference
 * (`index.html`). This file is the single source of truth for colour, type and
 * spacing values — no inline hex may appear in `app/` or `components/`.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Accent
        volt: "#C8FF00",
        "volt-dim": "#8FB800",
        // Surfaces (darkest → raised)
        ink: "#080808",
        surface: "#0A0A0A",
        "surface-raised": "#0D0D0D",
        "surface-card": "rgba(15,15,15,.55)",
        "surface-panel": "rgba(13,13,13,.82)",
        // Text
        bone: "#E9E7E0",
        muted: "#9A9A9A",
        "muted-dim": "#8A8A8A",
        faint: "#6F6F6F",
        dim: "#555555",
        "footer-dim": "#888888",
        // Hairlines
        hairline: "rgba(255,255,255,.08)",
        "hairline-strong": "rgba(255,255,255,.12)",
        "hairline-volt": "rgba(200,255,0,.18)",
        // External brand
        whatsapp: "#25D366",
      },
      fontFamily: {
        display: ["var(--font-anton)", "sans-serif"],
        condensed: ["var(--font-barlow-condensed)", "sans-serif"],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      fontSize: {
        // clamp() pairs from the reference, mobile-first
        hero: ["clamp(58px,12.5vw,124px)", { lineHeight: "0.9", letterSpacing: "-1.5px" }],
        "hero-sub": ["clamp(20px,5vw,30px)", { lineHeight: "1.1" }],
        "section-title": ["clamp(26px,7vw,40px)", { lineHeight: "1.05" }],
        lede: ["clamp(14px,3.6vw,17px)", { lineHeight: "1.55" }],
        cta: ["clamp(16px,4vw,19px)", { lineHeight: "1" }],
        eyebrow: ["clamp(9px,2.4vw,11px)", { letterSpacing: "3px" }],
      },
      letterSpacing: {
        eyebrow: "3px",
        wide: "0.5px",
      },
      maxWidth: {
        shell: "980px",
      },
      spacing: {
        gutter: "22px",
        nav: "64px",
      },
      borderRadius: {
        chip: "5px",
        control: "8px",
        badge: "9px",
        cta: "13px",
        card: "16px",
        panel: "22px",
      },
      boxShadow: {
        "volt-glow": "0 0 10px #C8FF00",
        "volt-glow-lg": "0 0 16px rgba(200,255,0,.6)",
      },
      backgroundImage: {
        "page-vignette":
          "radial-gradient(120% 90% at 50% 0%,transparent 55%,rgba(0,0,0,.5) 100%)",
        instagram: "linear-gradient(45deg,#F9CE34,#EE2A7B,#6228D7)",
        "qr-checker":
          "repeating-conic-gradient(#0A0A0A 0% 25%, transparent 0% 50%)",
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(.6)", opacity: ".7" },
          "100%": { transform: "scale(2.3)", opacity: "0" },
        },
        blink: {
          "0%,90%,100%": { opacity: "1" },
          "94%": { opacity: ".25" },
        },
        drift: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "60px 60px" },
        },
        floatY: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(7px)" },
        },
      },
      animation: {
        blink: "blink 3s infinite",
        drift: "drift 6s linear infinite",
        floatY: "floatY 2.4s ease-in-out infinite",
        pulseRing: "pulseRing 2.4s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
