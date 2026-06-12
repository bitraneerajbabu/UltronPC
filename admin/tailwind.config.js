/** @type {import('tailwindcss').Config} */
import animate from 'tailwindcss-animate'

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/react/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
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
        // Tremor custom settings
        tremor: {
          brand: {
            faint: "hsl(var(--primary-faint, 217 91% 97%))",
            muted: "hsl(var(--primary-muted, 217 91% 82%))",
            subtle: "hsl(var(--primary-subtle, 217 91% 60%))",
            DEFAULT: "hsl(var(--primary))",
            emphasis: "hsl(var(--primary-emphasis, 217 91% 35%))",
          },
          background: {
            muted: "#f8fafc",
            subtle: "#f1f5f9",
            DEFAULT: "#ffffff",
            emphasis: "#0f172a",
          },
          border: {
            DEFAULT: "hsl(var(--border))",
          },
          content: {
            subtle: "#94a3b8",
            DEFAULT: "#475569",
            emphasis: "#0f172a",
          },
        },
        status: {
          online: {
            bg: "hsl(var(--status-online-bg))",
            text: "hsl(var(--status-online-text))",
            border: "hsl(var(--status-online-border))",
            DEFAULT: "hsl(var(--status-online))",
          },
          delay: {
            bg: "hsl(var(--status-delay-bg))",
            text: "hsl(var(--status-delay-text))",
            border: "hsl(var(--status-delay-border))",
            DEFAULT: "hsl(var(--status-delay))",
          },
          offline: {
            bg: "hsl(var(--status-offline-bg))",
            text: "hsl(var(--status-offline-text))",
            border: "hsl(var(--status-offline-border))",
            DEFAULT: "hsl(var(--status-offline))",
          },
          inactive: {
            bg: "hsl(var(--status-inactive-bg))",
            text: "hsl(var(--status-inactive-text))",
            border: "hsl(var(--status-inactive-border))",
            DEFAULT: "hsl(var(--status-inactive))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  safelist: [
    {
      pattern:
        /^(bg-(?:tremor|status)-|text-(?:tremor|status)-|border-(?:tremor|status)-)/,
    },
  ],
  plugins: [animate],
}
