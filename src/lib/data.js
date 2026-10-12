// Laster datafilene som GitHub Actions lager hver dag, og filtrerer/sorterer boliger.
import { createContext, useContext } from "react";

export async function loadData() {
  const get = async (f, fallback) => {
    try {
      const r = await fetch(`./data/${f}?v=${Math.floor(Date.now() / 6e5)}`);
      if (!r.ok) throw new Error(r.status);
      return await r.json();
    } catch {
      return fallback;
    }
  };
  const [listings, market, meta, brief] = await Promise.all([
    get("listings.json", []),
    get("market.json", {}),
    get("meta.json", {}),
    get("ai_brief.json", null),
  ]);
  return { listings, market, meta, brief };
}

export const AREA_NAMES = { oslo: "Oslo", stavanger: "Stavanger", vestfold: "Vestfold" };
export const TYPE_GROUPS = [
  ["leil", "Leilighet"],
  ["smahus", "Rekkehus / tomannsbolig"],
  ["ene", "Enebolig"],
];

export const SORTS = [
  ["score", "Best score"],
  ["rabatt", "Mest under markedspris"],
  ["yield", "Høyest leieavkastning"],
  ["gevinst", "Størst oppussingsgevinst"],
  ["pris", "Lavest pris"],
  ["kvmpris", "Lavest kr/m²"],
  ["nyeste", "Nyeste annonser"],
  ["prisned", "Største prisnedsettelser"],
];

export function applyFilters(listings, A, f, favorites, onlyFav = false) {
  const q = (f.q || "").trim().toLowerCase();
  const fav = new Set(favorites);
  const out = [];
  for (const l of listings) {
    const a = A[l.id];
    if (!a) continue;
    if (onlyFav && !fav.has(l.id)) continue;
    if (f.areas?.length && !f.areas.includes(l.area)) continue;
    if (f.subs?.length && !f.subs.includes(l.sub)) continue;
    if (f.types?.length && !f.types.includes(l.grp)) continue;
    if (f.maxPrice && a.common.total > f.maxPrice) continue;
    if (f.minPrice && a.common.total < f.minPrice) continue;
    if (f.minSqm && l.sqm < f.minSqm) continue;
    if (f.maxSqm && l.sqm > f.maxSqm) continue;
    if (f.minBed && (l.bed || 0) < f.minBed) continue;
    if (f.own === "selveier" && !/selveier/i.test(l.own)) continue;
    if (f.own === "andel" && /selveier/i.test(l.own)) continue;
    if (f.verdict === "kjop" && a.verdict !== "kjop") continue;
    if (f.verdict === "vurder" && a.verdict === "ikke") continue;
    if (f.onlyNew && (a.common.dom ?? 99) > 7) continue;
    if (f.onlyDrop && !(a.common.drop > 0)) continue;
    if (f.onlyRental && !l.rental) continue;
    if (f.noNew && l.new) continue;
    if (f.onlyReno && !["middels", "total", "lett"].includes(l.reno)) continue;
    if (q && !`${l.addr} ${l.title} ${l.sub} ${l.local} ${l.id}`.toLowerCase().includes(q)) continue;
    out.push(l);
  }
  const key = {
    score: l => -A[l.id].score,
    rabatt: l => -(A[l.id].common.disc ?? -9),
    yield: l => -(A[l.id].utleie?.net ?? (l.rent?.est ? (l.rent.est * 12) / l.total : -9)),
    gevinst: l => -(A[l.id].oppussing?.profit ?? -1e9),
    pris: l => A[l.id].common.total,
    kvmpris: l => A[l.id].common.ppsqm,
    nyeste: l => -new Date(l.pub || l.first).getTime(),
    prisned: l => -(A[l.id].common.drop || 0),
  }[f.sort] || (l => -A[l.id].score);
  return out.sort((x, y) => key(x) - key(y));
}

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
