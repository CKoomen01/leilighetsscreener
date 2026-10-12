import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Search } from "lucide-react";
import { AREA_NAMES, SORTS, TYPE_GROUPS, useApp } from "../lib/data.js";
import { DEFAULT_FILTERS } from "../lib/store.js";
import { num } from "../lib/format.js";
import { NumInput } from "./ui.jsx";

const PRICE_STEPS = [0, 2e6, 3e6, 4e6, 5e6, 6e6, 7e6, 8e6, 10e6, 12e6, 15e6, 20e6];

function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${on ? "border-accent bg-accent text-white" : "border-line bg-raised text-ink2 hover:border-ink/30 hover:text-ink"}`}>
      {children}
    </button>
  );
}

function Toggle({ on, onChange, children }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink2">
      <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={on} onChange={e => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export default function FilterBar({ count }) {
  const { filters: f, setFilters, market, listings } = useApp();
  const [more, setMore] = useState(false);
  const set = patch => setFilters(s => ({ ...s, ...patch }));
  const toggleIn = (key, v) => set({ [key]: f[key].includes(v) ? f[key].filter(x => x !== v) : [...f[key], v] });

  const subs = useMemo(() => {
    const areas = f.areas.length ? f.areas : Object.keys(market.areas || {});
    const all = areas.flatMap(a => (market.areas?.[a]?.subs || []).map(s => ({ ...s, area: a })));
    return all.sort((a, b) => a.name.localeCompare(b.name, "nb"));
  }, [f.areas, market]);

  const nActive = ["subs"].reduce((n, k) => n + (f[k].length ? 1 : 0), 0)
    + ["minSqm", "maxSqm", "minBed", "minPrice"].reduce((n, k) => n + (f[k] ? 1 : 0), 0)
    + (f.own !== "alle") + f.onlyNew + f.onlyDrop + f.onlyRental + f.onlyReno + !!f.noNew + (f.verdict !== "alle");

  return (
    <section className="card card-pad space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-8" placeholder="Søk adresse, bydel eller Finn-kode" value={f.q} onChange={e => set({ q: e.target.value })} />
        </div>
        <select className="input w-auto" value={f.maxPrice} onChange={e => set({ maxPrice: Number(e.target.value) })} aria-label="Maks totalpris">
          {PRICE_STEPS.map(p => <option key={p} value={p}>{p ? `Maks ${num(p / 1e6)} mill` : "Alle priser"}</option>)}
        </select>
        <select className="input w-auto" value={f.sort} onChange={e => set({ sort: e.target.value })} aria-label="Sortering">
          {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip on={!f.areas.length} onClick={() => set({ areas: [], subs: [] })}>Alle områder</Chip>
        {Object.entries(AREA_NAMES).map(([id, name]) => (
          <Chip key={id} on={f.areas.includes(id)} onClick={() => { toggleIn("areas", id); set({ subs: [] }); }}>
            {name} <span className="opacity-60">{listings.filter(l => l.area === id).length}</span>
          </Chip>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        {TYPE_GROUPS.map(([id, label]) => <Chip key={id} on={f.types.includes(id)} onClick={() => toggleIn("types", id)}>{label}</Chip>)}
        <button className="btn-ghost ml-auto text-xs" onClick={() => setMore(m => !m)} aria-expanded={more}>
          Flere filtre{nActive ? <span className="num rounded-full bg-accent px-1.5 text-[10px] text-white">{nActive}</span> : null}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} />
        </button>
      </div>

      {more && (
        <div className="space-y-3 border-t border-line pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label><span className="h-sub">Min. pris</span><NumInput value={f.minPrice} onChange={v => set({ minPrice: v })} placeholder="0" suffix="kr" /></label>
            <label><span className="h-sub">Min. m²</span><NumInput value={f.minSqm} onChange={v => set({ minSqm: v })} placeholder="0" suffix="m²" /></label>
            <label><span className="h-sub">Maks m²</span><NumInput value={f.maxSqm} onChange={v => set({ maxSqm: v })} placeholder="ingen" suffix="m²" /></label>
            <label><span className="h-sub">Soverom</span>
              <select className="input" value={f.minBed} onChange={e => set({ minBed: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n ? `${n}+` : "Alle"}</option>)}
              </select>
            </label>
            <label><span className="h-sub">Eierform</span>
              <select className="input" value={f.own} onChange={e => set({ own: e.target.value })}>
                <option value="alle">Alle</option><option value="selveier">Selveier</option><option value="andel">Borettslag / aksje</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Toggle on={f.verdict === "kjop"} onChange={v => set({ verdict: v ? "kjop" : "alle" })}>Bare «Kjøp»</Toggle>
            <Toggle on={f.verdict === "vurder"} onChange={v => set({ verdict: v ? "vurder" : "alle" })}>Skjul «Ikke kjøp»</Toggle>
            <Toggle on={f.onlyNew} onChange={v => set({ onlyNew: v })}>Nye siste 7 dager</Toggle>
            <Toggle on={f.onlyDrop} onChange={v => set({ onlyDrop: v })}>Prisnedsatt</Toggle>
            <Toggle on={f.onlyRental} onChange={v => set({ onlyRental: v })}>Har utleiedel</Toggle>
            <Toggle on={f.onlyReno} onChange={v => set({ onlyReno: v })}>Trenger oppussing</Toggle>
            <Toggle on={f.noNew} onChange={v => set({ noNew: v })}>Skjul nybygg</Toggle>
          </div>
          {subs.length > 0 && (
            <div>
              <div className="h-sub mb-1.5">Bydel / kommune {f.subs.length ? `(${f.subs.length} valgt)` : ""}</div>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto scroll-thin">
                {subs.map(s => <Chip key={s.area + s.name} on={f.subs.includes(s.name)} onClick={() => toggleIn("subs", s.name)}>{s.name} <span className="opacity-60">{s.n}</span></Chip>)}
              </div>
            </div>
          )}
          <button className="btn-ghost text-xs" onClick={() => setFilters({ ...DEFAULT_FILTERS })}><RotateCcw className="h-3.5 w-3.5" /> Nullstill filtre</button>
        </div>
      )}
      <div className="text-xs text-muted"><b className="num text-ink">{num(count)}</b> boliger matcher</div>
    </section>
  );
}
