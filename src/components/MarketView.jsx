import { useMemo, useState } from "react";
import { AREA_NAMES, useApp } from "../lib/data.js";
import { SERIES, useDark } from "../lib/colors.js";
import { num, pct } from "../lib/format.js";
import { Seg } from "./ui.jsx";
import LineChart from "./LineChart.jsx";

const REGION_LABEL = { "001": "Oslo med Bærum", "002": "Stavanger", "006": "Østfold, Buskerud, Vestfold og Telemark", TOTAL: "Hele landet" };
const ZONE_LABEL = { "01": "Oslo og Bærum", "05": "Stavanger", "20": "Tettsteder 20 000+ (bl.a. Vestfold-byene)", "00": "Hele landet" };

function Card({ title, sub, children, right }) {
  return (
    <section className="card card-pad">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="h-title">{title}</h2>{sub && <p className="h-sub mt-0.5">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function MarketView() {
  const { market: m, rate } = useApp();
  const dark = useDark();
  const pal = SERIES[dark ? "dark" : "light"];
  const [area, setArea] = useState("oslo");
  const [sort, setSort] = useState("n");

  const idxSeries = useMemo(() => ["001", "002", "006", "TOTAL"]
    .filter(r => m.priceIndex?.[r])
    .map((r, i) => ({ label: REGION_LABEL[r], color: pal[i], data: m.priceIndex[r].filter(([q]) => q >= "2015K1") })), [m, pal]);

  const rateSeries = useMemo(() => {
    const s = [];
    if (m.mortgage) s.push({ label: "Boliglånsrente, nye lån (flytende)", color: pal[0], data: m.mortgage.map(([p, v]) => [p.replace("M", "-"), v]) });
    if (m.policy) s.push({ label: "Styringsrenten", color: pal[1], data: m.policy });
    return s;
  }, [m, pal]);

  const a = m.areas?.[area];
  const subs = useMemo(() => {
    if (!a) return [];
    const rows = a.subs.map(s => ({ ...s, yield: s.rentSqm && s.medLeil ? (s.rentSqm * 12) / s.medLeil : null }));
    const key = { n: r => -r.n, sqm: r => -(r.medSqm || 0), cheap: r => r.medSqm || 1e9, yield: r => -(r.yield || 0) }[sort];
    return rows.sort((x, y) => key(x) - key(y));
  }, [a, sort]);

  const growth = r => {
    const s = m.priceIndex?.[r];
    return s && s.length > 4 ? s.at(-1)[1] / s.at(-5)[1] - 1 : null;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(m.areas || {}).map(([id, x]) => (
          <div key={id} className="card card-pad">
            <div className="text-sm font-semibold">{x.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-y-2 text-xs text-ink2">
              <div><div className="text-muted">Til salgs</div><div className="num text-base font-semibold text-ink">{num(x.n)}</div></div>
              <div><div className="text-muted">Median kr/m²</div><div className="num text-base font-semibold text-ink">{num(x.medSqm)}</div></div>
              <div><div className="text-muted">Leie kr/m²/mnd</div><div className="num text-base font-semibold text-ink">{num(x.medRentSqm)}</div></div>
              <div><div className="text-muted">Prisvekst 12 mnd (SSB)</div><div className="num text-base font-semibold text-ink">{pct(growth(x.region), 1, true)}</div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Boligpriser over tid" sub="SSB prisindeks for brukte boliger (2015 = 100), kvartalsvis">
          <LineChart series={idxSeries} fmt={v => v.toFixed(0)} xFmt={x => x.replace("K", " K")} />
        </Card>
        <Card title="Renter" sub={`Prosent. Beregningene bruker nå ${num(rate, 2)} %.`}>
          <LineChart series={rateSeries.map(s => ({ ...s, data: s.data.filter(([p]) => p >= "2019") }))} fmt={v => `${v.toFixed(1)} %`} />
        </Card>
      </div>

      <Card title="Bydeler og kommuner" sub="Fra annonsene som ligger ute nå. Brutto yield ≈ leie per m² × 12 / kjøpspris per m² for leiligheter."
        right={<Seg label="Område" value={area} onChange={setArea} options={Object.keys(m.areas || {}).map(id => [id, AREA_NAMES[id] || id])} />}>
        <div className="mb-2 flex justify-end">
          <select className="input w-auto text-xs" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sorter">
            <option value="n">Flest boliger</option><option value="cheap">Billigst per m²</option><option value="sqm">Dyrest per m²</option><option value="yield">Høyest brutto yield</option>
          </select>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr>
              <th className="th">Område</th><th className="th text-right">Til salgs</th><th className="th text-right">Median kr/m²</th>
              <th className="th text-right">Leiligheter kr/m²</th><th className="th text-right">Leie kr/m²/mnd</th><th className="th text-right">Brutto yield</th>
            </tr></thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.name} className="border-b border-line/60">
                  <td className="td font-medium">{s.name}</td>
                  <td className="td num text-right">{s.n}</td>
                  <td className="td num text-right">{num(s.medSqm)}</td>
                  <td className="td num text-right">{num(s.medLeil)}</td>
                  <td className="td num text-right">{num(s.rentSqm)}</td>
                  <td className="td num text-right">{s.yield ? pct(s.yield, 1) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {m.rentSSB?.zones && (
        <Card title="Gjennomsnittlig husleie per måned (SSB)" sub={`Leiemarkedsundersøkelsen ${m.rentSSB.year}. Brukes som støtte når det er få leieannonser.`}>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="border-b border-line"><tr><th className="th">Prissone</th>{["1", "2", "3", "4", "5+"].map(r => <th key={r} className="th text-right">{r} rom</th>)}</tr></thead>
              <tbody>
                {Object.entries(m.rentSSB.zones).map(([z, rooms]) => (
                  <tr key={z} className="border-b border-line/60">
                    <td className="td">{ZONE_LABEL[z] || z}</td>
                    {["1", "2", "3", "4", "5+"].map(r => <td key={r} className="td num text-right">{rooms[r]?.monthly ? num(rooms[r].monthly) : "–"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted">Kilder: Finn.no (annonser), SSB tabell 07221, 09895, 06035 og 10748, Norges Bank (styringsrenten). Kartdata © OpenStreetMap.</p>
    </div>
  );
}
