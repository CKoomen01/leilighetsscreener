import { useEffect, useRef } from "react";
import L from "leaflet";
import { useApp } from "../lib/data.js";
import { VERDICT } from "../lib/analysis.js";
import { mill, num, pct } from "../lib/format.js";
import { Legend } from "./ui.jsx";

const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export default function MapView({ items }) {
  const { A, openListing } = useApp();
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { preferCanvas: true, zoomControl: true }).setView([59.6, 10.4], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    window.__openListing = id => openListing(id);
    return () => { map.current.remove(); delete window.__openListing; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const g = layer.current;
    g.clearLayers();
    const pts = [];
    // Tegn «Ikke kjøp» først slik at de gode havner øverst
    const order = { ikke: 0, vurder: 1, kjop: 2 };
    const list = items.filter(l => l.lat && l.lon).slice(0, 4000).sort((x, y) => order[A[x.id].verdict] - order[A[y.id].verdict]);
    for (const l of list) {
      const a = A[l.id];
      const m = L.circleMarker([l.lat, l.lon], {
        radius: a.verdict === "kjop" ? 7 : 5.5,
        color: "#ffffff",
        weight: 1.5,
        fillColor: VERDICT[a.verdict].dot,
        fillOpacity: 0.9,
      });
      m.bindPopup(
        `<div style="min-width:190px">
          <div style="font-weight:600">${esc(l.addr)}</div>
          <div style="font-size:12px;opacity:.75">${esc(l.sub)} · ${esc(l.type)} · ${l.sqm} m²</div>
          <div style="margin-top:4px;font-size:13px"><b>${mill(a.common.total)}</b> · ${num(a.common.ppsqm)} kr/m²${a.common.disc != null ? ` (${pct(a.common.disc, 0, true)})` : ""}</div>
          <div style="font-size:12px;margin-top:2px">${VERDICT[a.verdict].label} · score ${a.score}</div>
          <button onclick="window.__openListing('${l.id}')" style="margin-top:6px;color:#2a78d6;font-weight:600;font-size:12px">Åpne detaljer →</button>
        </div>`,
      );
      m.addTo(g);
      pts.push([l.lat, l.lon]);
    }
    if (pts.length) map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
  }, [items, A]);

  const withPos = items.filter(l => l.lat && l.lon).length;
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <Legend items={Object.values(VERDICT).map(v => ({ label: v.label, color: v.dot }))} />
        <span className="text-xs text-muted">{num(withPos)} av {num(items.length)} boliger har kartposisjon{withPos > 4000 ? " (viser 4 000)" : ""}</span>
      </div>
      <div ref={el} className="h-[68vh] min-h-[420px] w-full" />
    </div>
  );
}
