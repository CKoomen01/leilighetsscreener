const nf0 = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const num = (v, d = 0) => (v == null || !isFinite(v) ? "–" : d ? nf1.format(v) : nf0.format(v));

/** kr 4 190 000 */
export const kr = v => (v == null || !isFinite(v) ? "–" : `kr ${nf0.format(Math.round(v))}`);

/** 4,19 mill / 850 000 */
export function mill(v) {
  if (v == null || !isFinite(v)) return "–";
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toLocaleString("nb-NO", { maximumFractionDigits: 2, minimumFractionDigits: 2 })} mill`;
  return `${nf0.format(Math.round(v / 1000) * 1000)}`;
}

/** +1 234 kr / −800 kr */
export function signedKr(v) {
  if (v == null || !isFinite(v)) return "–";
  const s = nf0.format(Math.abs(Math.round(v)));
  return `${v < 0 ? "−" : "+"}${s} kr`;
}

/** 0.123 -> 12,3 % */
export function pct(v, d = 1, signed = false) {
  if (v == null || !isFinite(v)) return "–";
  const s = (Math.abs(v) * 100).toLocaleString("nb-NO", { maximumFractionDigits: d, minimumFractionDigits: d });
  return `${signed ? (v < 0 ? "−" : "+") : v < 0 ? "−" : ""}${s} %`;
}

export const tone = v => (v == null ? "text-muted" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink2");

export function daysSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 864e5));
}

export function dateNo(iso, opts = { day: "numeric", month: "short" }) {
  if (!iso) return "–";
  return new Date(iso).toLocaleDateString("nb-NO", opts);
}

export function timeAgo(iso) {
  const d = daysSince(iso);
  if (d == null) return "";
  if (d === 0) return "i dag";
  if (d === 1) return "i går";
  return `${d} dager siden`;
}

export const finnUrl = l => (typeof l === "object" ? l.url : null) || `https://www.finn.no/realestate/homes/ad.html?finnkode=${typeof l === "object" ? l.id : l}`;
