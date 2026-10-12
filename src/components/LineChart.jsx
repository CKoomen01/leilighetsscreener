import { useMemo, useRef, useState } from "react";
import { CHROME, useDark } from "../lib/colors.js";
import { Legend } from "./ui.jsx";

/**
 * Enkel SVG-linjegraf med én y-akse, krysshår og tooltip.
 * series: [{ label, color, data: [[x(string), y(number)], ...] }] – alle serier deler x-verdier (perioder).
 */
export default function LineChart({ series, height = 260, fmt = v => v.toFixed(1), xFmt = x => x }) {
  const dark = useDark();
  const ch = CHROME[dark ? "dark" : "light"];
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 720, H = height, pad = { l: 44, r: 12, t: 10, b: 26 };

  const { xs, xi, yMin, yMax } = useMemo(() => {
    const set = new Set();
    series.forEach(s => s.data.forEach(([x]) => set.add(x)));
    const xs = [...set].sort();
    const xi = new Map(xs.map((x, i) => [x, i]));
    const ys = series.flatMap(s => s.data.map(d => d[1]));
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const padY = (hi - lo) * 0.08 || 1;
    return { xs, xi, yMin: lo - padY, yMax: hi + padY };
  }, [series]);

  if (!xs.length) return <p className="text-sm text-muted">Ingen data.</p>;
  const X = i => pad.l + (i / Math.max(1, xs.length - 1)) * (W - pad.l - pad.r);
  const Y = v => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const xTicks = xs.filter((_, i) => i % Math.ceil(xs.length / 6) === 0);

  function onMove(e) {
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (xs.length - 1));
    if (i < 0 || i >= xs.length) return setHover(null);
    setHover({ i, left: (X(i) / W) * r.width, top: e.clientY - r.top });
  }

  return (
    <div className="space-y-2">
      {series.length > 1 && <Legend items={series.map(s => ({ label: s.label, color: s.color }))} />}
      <div className="relative">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke={ch.grid} strokeWidth="1" />
              <text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="10.5" fill={ch.muted}>{fmt(t)}</text>
            </g>
          ))}
          {xTicks.map(x => <text key={x} x={X(xi.get(x))} y={H - 8} textAnchor="middle" fontSize="10.5" fill={ch.muted}>{xFmt(x)}</text>)}
          {series.map(s => (
            <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              points={s.data.map(([x, y]) => `${X(xi.get(x))},${Y(y)}`).join(" ")} />
          ))}
          {hover && (
            <g>
              <line x1={X(hover.i)} x2={X(hover.i)} y1={pad.t} y2={H - pad.b} stroke={ch.axis} strokeWidth="1" />
              {series.map(s => {
                const d = s.data.find(p => p[0] === xs[hover.i]);
                return d ? <circle key={s.label} cx={X(hover.i)} cy={Y(d[1])} r="4.5" fill={s.color} stroke={ch.surface} strokeWidth="2" /> : null;
              })}
            </g>
          )}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute z-10 rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl"
            style={{ left: Math.min(hover.left + 12, (ref.current?.getBoundingClientRect().width || 600) - 170), top: Math.max(0, hover.top - 40) }}>
            <div className="mb-1 font-semibold text-ink">{xFmt(xs[hover.i])}</div>
            {series.map(s => {
              const d = s.data.find(p => p[0] === xs[hover.i]);
              return d ? (
                <div key={s.label} className="flex items-center justify-between gap-3 text-ink2">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="num font-medium text-ink">{fmt(d[1])}</span>
                </div>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
