/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:  ["DM Sans", "sans-serif"],
        mono:  ["DM Mono", "monospace"],
      },
      colors: {
        primary:   "#0A4F79",
        secondary: "#B4427F",
        success:   "#98C062",
        warning:   "#EA9947",
        danger:    "#DF4585",
        surface:   "#F0EDE8",
        ink:       "#1E1E2F",
      },
      backdropBlur: {
        xs: "2px",
        glass: "16px",
      },
      borderRadius: {
        "2xl": "20px",
        "3xl": "24px",
      },
      boxShadow: {
        glass:        "0 8px 32px rgba(10, 79, 121, 0.12), 0 2px 8px rgba(10, 79, 121, 0.06)",
        "glass-hover":"0 16px 48px rgba(10, 79, 121, 0.18), 0 4px 16px rgba(10, 79, 121, 0.10)",
        "glass-inset":"inset 0 1px 0 rgba(255,255,255,0.6)",
        kpi:          "0 4px 24px rgba(10, 79, 121, 0.14)",
      },
    },
  },
  plugins: [],
};