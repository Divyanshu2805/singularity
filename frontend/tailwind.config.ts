/**
 * The design system as Tailwind sees it.
 *
 * Handles: which files are scanned for classes, the colour tokens mapped onto the CSS custom properties defined in
 * the stylesheet, the fonts, the radii, and the keyframes and animations the UI uses.
 *
 * Colours are indirections onto CSS variables rather than literal values, so light and dark are one definition and
 * the code editor's theme can read the same variables.
 */
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        panel: {
          DEFAULT: "hsl(var(--panel))",
          hover: "hsl(var(--panel-hover))",
          active: "hsl(var(--panel-active))",
        },
        chat: {
          user: "hsl(var(--chat-user))",
          ai: "hsl(var(--chat-ai))",
        },
        file: {
          active: "hsl(var(--file-active))",
        },
        syntax: {
          keyword: "hsl(var(--syntax-keyword))",
          string: "hsl(var(--syntax-string))",
          number: "hsl(var(--syntax-number))",
          comment: "hsl(var(--syntax-comment))",
          function: "hsl(var(--syntax-function))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
        "cursor-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "aurora-drift": {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(4%, -3%, 0) scale(1.08)" },
        },
        "slide-peek": {
          "0%, 15%": { transform: "translateX(0)" },
          "45%, 60%": { transform: "translateX(var(--slide-by))" },
          "90%, 100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        "aurora-drift": "aurora-drift 18s ease-in-out infinite",
        "slide-peek": "slide-peek var(--slide-duration) ease-in-out 250ms infinite",
        pulse: "pulse 1s ease-in-out infinite",
        "cursor-blink": "cursor-blink 1s step-end infinite",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Monaco", "Consolas", "monospace"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
