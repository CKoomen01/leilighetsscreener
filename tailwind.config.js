/** @type {import('tailwindcss').Config} */
const v = name => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        plane: v("plane"),
        surface: v("surface"),
        raised: v("raised"),
        ink: v("ink"),
        ink2: v("ink2"),
        muted: v("muted"),
        line: v("line"),
        accent: v("accent"),
        up: v("up"),
        down: v("down"),
        good: v("good"),
        warn: v("warn"),
        bad: v("bad"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      keyframes: {
        "slide-in": { from: { transform: "translateX(24px)", opacity: 0 }, to: { transform: "none", opacity: 1 } },
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: {
        "slide-in": "slide-in .2s ease-out",
        "fade-in": "fade-in .15s ease-out",
      },
    },
  },
  plugins: [],
};
