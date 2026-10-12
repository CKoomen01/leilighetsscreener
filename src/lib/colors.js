// Fargepalett (validert dataviz-referansepalett). Kategoriske farger tildeles i fast
// rekkefølge og følger enheten – ikke rangeringen.
import { useEffect, useState } from "react";

export const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

export const CHROME = {
  light: { surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#787670", grid: "#e1e0d9", axis: "#c3c2b7", mid: "#f0efec" },
  dark: { surface: "#1a1a19", ink: "#ffffff", ink2: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835", mid: "#383835" },
};

// Divergerende: rød (negativ) ↔ grå midtpunkt ↔ blå (positiv)
const DIV = {
  light: { neg: [208, 59, 59], pos: [42, 120, 214], mid: [240, 239, 236] },
  dark: { neg: [230, 103, 103], pos: [57, 135, 229], mid: [56, 56, 53] },
};

export function diverging(v, max, dark) {
  const p = DIV[dark ? "dark" : "light"];
  if (v == null || Number.isNaN(v)) return `rgb(${p.mid.join(",")})`;
  const t = Math.max(-1, Math.min(1, v / max));
  const end = t < 0 ? p.neg : p.pos;
  const a = Math.abs(t) ** 0.8;
  const c = p.mid.map((m, i) => Math.round(m + (end[i] - m) * a));
  return `rgb(${c.join(",")})`;
}

/** Tekstfarge som er lesbar på en gitt bakgrunn (rgb(...)). */
export function inkOn(bg) {
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#0b0b0b" : "#ffffff";
}

export function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

