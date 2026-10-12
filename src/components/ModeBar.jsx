import { Check, SlidersHorizontal } from "lucide-react";
import { MODES } from "../lib/analysis.js";
import { useApp } from "../lib/data.js";
import { num } from "../lib/format.js";

export default function ModeBar() {
  const { modes, setModes, rate, assumptions: A, openSettings, filtered, A: an } = useApp();
  const toggle = id => setModes(m => (m.includes(id) ? (m.length > 1 ? m.filter(x => x !== id) : m) : [...m, id]));
  const counts = { kjop: 0, vurder: 0, ikke: 0 };
  for (const l of filtered) counts[an[l.id].verdict]++;
  const combo = modes.includes("innflytting") && modes.includes("utleie");

  return (
    <section className="card card-pad space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Hva leter du etter? <span className="font-normal text-muted">Velg én eller flere – vurderingen tilpasses.</span></h2>
        <button className="btn-ghost text-xs" onClick={openSettings}>
          <SlidersHorizontal className="h-3.5 w-3.5" /> Rente {num(rate, 1)} % · EK {A.ekSelf} %{A.income ? ` · inntekt ${num(A.income / 1000)}k` : ""} – endre
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.values(MODES).map(m => {
          const on = modes.includes(m.id);
          return (
            <button key={m.id} className="mode-btn" aria-pressed={on} onClick={() => toggle(m.id)}>
              <span className="text-xl" aria-hidden>{m.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block truncate text-[11px] text-muted">{m.desc}</span>
              </span>
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                {on && <Check className="h-3 w-3" aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2">
        <span><b className="num text-up">{counts.kjop}</b> Kjøp</span>
        <span><b className="num text-ink">{counts.vurder}</b> Vurder</span>
        <span><b className="num text-down">{counts.ikke}</b> Ikke kjøp</span>
        {combo && <span className="text-muted">· Bo selv + utleie: boliger med utleiedel får leieinntekten trukket fra månedskostnaden.</span>}
      </div>
    </section>
  );
}
