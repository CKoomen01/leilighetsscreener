import { useEffect, useState } from "react";
import { BedDouble, Heart, LayoutGrid, Maximize2, Rows3 } from "lucide-react";
import { useApp } from "../lib/data.js";
import { RENO_LABEL } from "../lib/analysis.js";
import { kr, mill, num, pct, signedKr } from "../lib/format.js";
import { Seg, VerdictBadge } from "./ui.jsx";

export function FavButton({ id, className = "" }) {
  const { favorites, setFavorites } = useApp();
  const on = favorites.includes(id);
  return (
    <button type="button" aria-label={on ? "Fjern fra favoritter" : "Legg til i favoritter"} aria-pressed={on}
      onClick={e => { e.stopPropagation(); setFavorites(f => (on ? f.filter(x => x !== id) : [...f, id])); }}
      className={`grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 ${className}`}>
      <Heart className={`h-4 w-4 ${on ? "fill-current text-[#e87ba4]" : ""}`} />
    </button>
  );
}

export function Tags({ l, a }) {
  const t = [];
  if (l.new) t.push(["Nybygg", "border-accent/40 text-accent"]);
  else if ((a.common.dom ?? 99) <= 3) t.push(["Ny annonse", "border-accent/40 text-accent"]);
  if (a.common.drop > 0) t.push([`Prisnedsatt ${pct(a.common.drop, 0)}`, "border-good/40 text-up"]);
  if (l.rental) t.push(["Utleiedel", "border-line text-ink2"]);
  if (l.reno !== "ingen") t.push([RENO_LABEL[l.reno], "border-warn/60 text-ink"]);
  if (l.energy) t.push([`Energi ${l.energy}`, "border-line text-muted"]);
  return (
    <div className="flex flex-wrap gap-1">
      {t.map(([txt, cls]) => <span key={txt} className={`chip ${cls}`}>{txt}</span>)}
    </div>
  );
}

/** De viktigste tallene for valgt(e) modus */
export function ModeMetrics({ a, compact }) {
  const items = [];
  if (a.innflytting) items.push(["Månedskost", kr(a.innflytting.monthly), "Lån (annuitet) + felleskostnader" + (a.innflytting.hybel ? " − leie fra utleiedel" : "")]);
  if (a.utleie) {
    items.push(["Netto yield", a.utleie.net != null ? pct(a.utleie.net, 1) : "–", "Leie minus felleskost, vedlikehold og ledighet, delt på totalpris"]);
    items.push(["Kontantstrøm", a.utleie.cfExAvdrag != null ? signedKr(a.utleie.cfExAvdrag) : "–", "Per måned etter renter og driftskostnader (før avdrag og skatt)"]);
  }
  if (a.oppussing) items.push(["Gevinst oppussing", a.oppussing.profit != null ? signedKr(a.oppussing.profit) : "–", "Verdi etter oppussing − totalpris − oppussing − bærekost − salgskost"]);
  return (
    <div className={`grid gap-1.5 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
      {items.map(([k, v, hint]) => (
        <div key={k} className="rounded-md bg-ink/[.04] px-2 py-1" title={hint}>
          <div className="text-[10px] text-muted">{k}</div>
          <div className={`num text-[13px] font-semibold ${/^−/.test(v) ? "text-down" : /^\+/.test(v) ? "text-up" : "text-ink"}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function Card({ l }) {
  const { A, openListing } = useApp();
  const a = A[l.id];
  const c = a.common;
  return (
    <article className="card group flex cursor-pointer flex-col overflow-hidden transition hover:border-ink/30 hover:shadow-lg"
      onClick={() => openListing(l.id)} tabIndex={0} onKeyDown={e => e.key === "Enter" && openListing(l.id)}>
      <div className="relative aspect-[16/10] bg-line">
        {l.img && <img src={l.img.replace("/dynamic/default/", "/dynamic/480w/")} alt="" loading="lazy" className="h-full w-full object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />}
        <VerdictBadge verdict={a.verdict} score={a.score} className="absolute left-2 top-2 bg-surface/95 shadow" />
        <FavButton id={l.id} className="absolute right-2 top-2" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <div className="truncate text-sm font-semibold text-ink" title={l.addr}>{l.addr}</div>
          <div className="truncate text-xs text-muted">{l.sub} · {l.type}{l.own ? ` · ${l.own}` : ""}</div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <div className="num text-lg font-semibold">{mill(c.total)}</div>
          <div className="flex items-center gap-2.5 text-xs text-ink2">
            <span className="inline-flex items-center gap-1"><Maximize2 className="h-3 w-3" aria-hidden />{l.sqm} m²</span>
            {l.bed != null && <span className="inline-flex items-center gap-1"><BedDouble className="h-3 w-3" aria-hidden />{l.bed}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="num text-ink2">{num(c.ppsqm)} kr/m²</span>
          {c.disc != null && (
            <span className={`num font-medium ${c.disc >= 0.03 ? "text-up" : c.disc <= -0.03 ? "text-down" : "text-ink2"}`} title={`Median for ${c.cmp.n} lignende: ${num(c.cmp.med)} kr/m²`}>
              {c.disc >= 0 ? `${pct(c.disc, 0)} under` : `${pct(-c.disc, 0)} over`} området
            </span>
          )}
        </div>
        <ModeMetrics a={a} compact />
        <div className="mt-auto"><Tags l={l} a={a} /></div>
      </div>
    </article>
  );
}

function Table({ items }) {
  const { A, openListing, modes } = useApp();
  return (
    <div className="card overflow-x-auto scroll-thin">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <th className="th">Råd</th><th className="th">Adresse</th><th className="th text-right">Totalpris</th><th className="th text-right">m²</th>
            <th className="th text-right">kr/m²</th><th className="th text-right">vs. område</th>
            {modes.includes("innflytting") && <th className="th text-right">Månedskost</th>}
            {modes.includes("utleie") && <><th className="th text-right">Leie</th><th className="th text-right">Netto yield</th><th className="th text-right">Kontantstrøm</th></>}
            {modes.includes("oppussing") && <th className="th text-right">Gevinst</th>}
            <th className="th">Standard</th>
          </tr>
        </thead>
        <tbody>
          {items.map(l => {
            const a = A[l.id], c = a.common;
            return (
              <tr key={l.id} className="cursor-pointer border-b border-line/60 hover:bg-ink/[.03]" onClick={() => openListing(l.id)}>
                <td className="td"><VerdictBadge verdict={a.verdict} score={a.score} small /></td>
                <td className="td max-w-[260px]"><div className="truncate font-medium">{l.addr}</div><div className="truncate text-xs text-muted">{l.sub} · {l.type}</div></td>
                <td className="td num text-right">{mill(c.total)}</td>
                <td className="td num text-right">{l.sqm}</td>
                <td className="td num text-right">{num(c.ppsqm)}</td>
                <td className={`td num text-right ${c.disc >= 0.03 ? "text-up" : c.disc <= -0.03 ? "text-down" : ""}`}>{c.disc != null ? pct(c.disc, 0, true) : "–"}</td>
                {a.innflytting && <td className="td num text-right">{kr(a.innflytting.monthly)}</td>}
                {a.utleie && <><td className="td num text-right">{kr(a.utleie.rent)}</td><td className="td num text-right">{pct(a.utleie.net, 1)}</td><td className={`td num text-right ${a.utleie.cfExAvdrag >= 0 ? "text-up" : "text-down"}`}>{signedKr(a.utleie.cfExAvdrag)}</td></>}
                {a.oppussing && <td className={`td num text-right ${a.oppussing.profit >= 0 ? "text-up" : "text-down"}`}>{signedKr(a.oppussing.profit)}</td>}
                <td className="td text-xs text-ink2">{RENO_LABEL[l.reno]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ListView({ items }) {
  const [layout, setLayout] = useState(() => (window.innerWidth < 768 ? "grid" : "grid"));
  const [n, setN] = useState(48);
  useEffect(() => { setN(48); }, [items]);
  const shown = items.slice(0, n);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Seg label="Visning" value={layout} onChange={setLayout} options={[["grid", <span key="g" className="inline-flex items-center gap-1"><LayoutGrid className="h-3.5 w-3.5" />Kort</span>], ["table", <span key="t" className="inline-flex items-center gap-1"><Rows3 className="h-3.5 w-3.5" />Tabell</span>]]} />
      </div>
      {layout === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map(l => <Card key={l.id} l={l} />)}
        </div>
      ) : <Table items={shown} />}
      {items.length > n && (
        <div className="flex justify-center"><button className="btn-outline" onClick={() => setN(x => x + 48)}>Vis flere ({num(items.length - n)} igjen)</button></div>
      )}
    </div>
  );
}
