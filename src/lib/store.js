// Små tilstandslagre som lagres i nettleseren (localStorage).
// Alt du legger inn (API-nøkkel, favoritter, forutsetninger) blir værende på denne enheten.
import { useSyncExternalStore } from "react";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function createStore(key, fallback) {
  let state = read(key, fallback);
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  if (isObj(fallback)) state = isObj(state) ? { ...fallback, ...state } : fallback;
  else if (Array.isArray(fallback) && !Array.isArray(state)) state = fallback;
  const subs = new Set();
  return {
    get: () => state,
    set(next) {
      state = typeof next === "function" ? next(state) : next;
      try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* full eller blokkert */ }
      subs.forEach(fn => fn());
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export const DEFAULT_ASSUMPTIONS = {
  rate: null,            // boliglånsrente i % (null = bruk siste tall fra SSB + 0,1)
  years: 30,             // nedbetalingstid
  ekSelf: 10,            // egenkapital % når du skal bo selv
  ekRent: 15,            // egenkapital % for utleiebolig (sekundærbolig) utenfor Oslo
  ekRentOslo: 40,        // egenkapital % for sekundærbolig i Oslo
  income: 0,             // brutto årsinntekt (husholdning) – valgfritt
  equity: 0,             // tilgjengelig egenkapital i kr – valgfritt
  vacancy: 5,            // % ledighet utleie
  maintSqm: 150,         // vedlikehold kr per m² per år
  taxRent: 22,           // skatt på netto leieinntekt
  renoLett: 4000,        // oppussing kr/m²
  renoMiddels: 10000,
  renoTotal: 20000,
  sellCost: 2.5,         // salgskostnader ved videresalg, % av salgspris
  holdMonths: 6,         // måneder fra kjøp til salg ved oppussing
  buyCostPct: 2.5,       // dokumentavgift selveier
};

export const settingsStore = createStore("ls.settings", {
  apiKey: "",
  model: "",
  models: [],
  theme: "system",
  ghToken: "",           // valgfritt: GitHub-token for «Oppdater data nå»
  seenIntro: false,
});
export const assumptionsStore = createStore("ls.assumptions", DEFAULT_ASSUMPTIONS);
export const modesStore = createStore("ls.modes", ["innflytting"]);
export const DEFAULT_FILTERS = {
  areas: [],             // tom = alle
  subs: [],
  types: ["leil"],
  maxPrice: 0,
  minPrice: 0,
  minSqm: 0,
  maxSqm: 0,
  minBed: 0,
  own: "alle",           // alle | selveier | andel
  verdict: "alle",       // alle | kjop | vurder
  onlyNew: false,
  onlyDrop: false,
  onlyRental: false,
  onlyReno: false,
  noNew: false,
  q: "",
  sort: "score",
};
export const filtersStore = createStore("ls.filters", DEFAULT_FILTERS);
export const favoritesStore = createStore("ls.favorites", []);
export const notesStore = createStore("ls.notes", {});   // { finnkode: { note, bid, rent, reno } }
export const chatStore = createStore("ls.chat", { msgs: [], contents: [] });

export function useStore(store) {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [state, store.set];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function aiCacheGet(key) {
  try { return JSON.parse(localStorage.getItem(`ls.ai.${key}`)); } catch { return null; }
}
export function aiCacheSet(key, value) {
  try {
    localStorage.setItem(`ls.ai.${key}`, JSON.stringify(value));
  } catch {
    Object.keys(localStorage).filter(k => k.startsWith("ls.ai.")).forEach(k => localStorage.removeItem(k));
  }
}
