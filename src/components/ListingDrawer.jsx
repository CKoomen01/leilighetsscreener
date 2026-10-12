import { useState } from "react";
import { ExternalLink, Minus, Plus, Sparkles, X } from "lucide-react";
import { useApp } from "../lib/data.js";
import { MODES, RENO_LABEL, summarize } from "../lib/analysis.js";
import { generate } from "../lib/gemini.js";
import { aiCacheGet, aiCacheSet } from "../lib/store.js";
import { dateNo, finnUrl, kr, mill, num, pct, signedKr } from "../lib/format.js";
import { Drawer, KV, Markdown, NumInput, ScoreBar, Sources, Spinner, Stat, VerdictBadge } from "./ui.jsx";
import { FavButton, Tags } from "./ListView.jsx";

function Section({ title, children, right }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="h-title">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Egen kvadratmeterpris plassert mot nabolagets 25–75-persentil */
function PriceRange({ c }) {
  if (!c.cmp) return <p className="text-sm text-muted">For få sammenlignbare boliger i nærheten.</p>;
  const { p25, med, p75 } = c.cmp;
  const lo = Math.min(p25, c.ppsqm) * 0.92, hi = Math.max(p75, c.ppsqm) * 1.08;
  const x = v => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div>
      <div className="relative mt-6 h-2 rounded-full bg-line">
        <div className="absolute inset-y-0 rounded-full bg-accent/30" style={{ left: x(p25), width: `calc(${x(p75)} - ${x(p25)})` }} />
        <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-ink2" style={{ left: x(med) }} />
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow" style={{ left: x(c.ppsqm) }} />
        <div className="num absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-accent" style={{ left: x(c.ppsqm) }}>Denne: {num(c.ppsqm)}</div>
      </div>
      <div className="num mt-2 flex justify-between text-[11px] text-muted">
        <span>25 %: {num(p25)}</span><span>Median: {num(med)}</span><span>75 %: {num(p75)}</span>
      </div>
      <p className="mt-2 text-xs text-ink2">Totalpris per m² sammenlignet med {c.cmp.n} lignende boliger til salgs ({c.cmp.scope}). Prisantydning, ikke salgspris.</p>
    </div>
  );
}

function AiAssessment({ l, a, modes }) {
  const key = `${l.id}:${modes.join("+")}:${a.score}`;
  const [res, setRes] = useState(() => aiCacheGet(key));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function run() {
    setBusy(true); setErr(null);
    try {
      const facts = summarize(l, a);
      const r = await generate({
        system: "Du er en erfaren, ærlig norsk boligrådgiver. Vurder boligen for en privat kjøper ut fra valgt strategi. Svar på norsk i markdown med overskriftene: **Kort konklusjon** (1–2 setninger, Kjøp/Vurder/Ikke kjøp), **Styrker**, **Svakheter og risiko**, **Sjekk før budrunden** (konkrete punkter: salgsoppgave, tilstandsrapport, vedtekter, fellesgjeld/rentebinding, regulering osv.), **Budstrategi** (hvis relevant, med et fornuftig budintervall). Bruk tallene du får; ikke finn på fakta. Søk gjerne etter nabolag/regulering. Maks 280 ord.",
        messages: [{ role: "user", text: `Strategi: ${modes.map(m => MODES[m].label).join(" + ")}.\n\nNøkkeltall:\n${JSON.stringify(facts, null, 1)}\n\nBegrunnelser fra modellen:\n${a.reasons.map(r => (r.good ? "+ " : "- ") + r.text).join("\n")}\n\nAnnonsetekst (utdrag):\n${(l.desc || l.title).slice(0, 1500)}` }],
        search: true,
      });
      setRes(r);
      aiCacheSet(key, r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      {!res && <button className="btn-primary" onClick={run} disabled={busy}>{busy ? <Spinner /> : <Sparkles className="h-4 w-4" />} {busy ? "AI-en vurderer …" : "Få AI-vurdering"}</button>}
      {err && <p className="mt-2 text-sm text-down">{err}</p>}
      {res && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <Markdown text={res.text} />
          <Sources sources={res.sources} />
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span>{res.model}</span>
            <button className="hover:text-accent" onClick={run} disabled={busy}>{busy ? "…" : "Lag ny vurdering"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ListingDrawer({ l, onClose }) {
  const { A, modes, assumptions: As, rate, notes, setNotes, openChat } = useApp();
  const a = A[l.id];
  const c = a.common;
  const note = notes[l.id] || {};
  const setNote = patch => setNotes(n => ({ ...n, [l.id]: { ...n[l.id], ...patch } }));
  const [imgOk, setImgOk] = useState(true);

  return (
    <Drawer onClose={onClose} label={l.addr}>
      <div className="relative aspect-[16/8] bg-line">
        {l.img && imgOk && <img src={l.img.replace("/dynamic/default/", "/dynamic/960w/")} alt="" className="h-full w-full object-cover" onError={() => setImgOk(false)} />}
        <div className="absolute right-3 top-3 flex gap-2">
          <FavButton id={l.id} />
          <button className="grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur hover:bg-black/60" onClick={onClose} aria-label="Lukk"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug">{l.addr}</h2>
            <p className="text-sm text-ink2">{l.sub}{l.local && l.local !== l.sub ? ` · ${l.local}` : ""} · {l.type} · {l.own}</p>
          </div>
          <a className="btn-outline" href={finnUrl(l)} target="_blank" rel="noopener noreferrer">Se på Finn <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
        <p className="text-sm text-ink2">{l.title}</p>
        <Tags l={l} a={a} />
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3">
          <VerdictBadge verdict={a.verdict} score={a.score} />
          <span className="text-xs text-muted">Sikkerhet i vurderingen: <b className="text-ink2">{a.confidence}</b>{!l.det && " (detaljer hentes ved neste oppdatering)"}</span>
          <div className="w-full space-y-1.5">
            {modes.map(m => a.scores[m] != null && <ScoreBar key={m} label={MODES[m].short} value={a.scores[m]} />)}
          </div>
        </div>
      </div>

      <Section title="Hvorfor?">
        <ul className="space-y-1.5">
          {a.reasons.slice(0, 8).map((r, i) => (
            <li key={i} className="flex gap-2 text-sm">
              {r.good ? <Plus className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Positivt" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Negativt" />}
              <span className="text-ink2">{r.text}</span>
            </li>
          ))}
          {!a.reasons.length && <li className="text-sm text-muted">Ingen tydelige styrker eller svakheter – boligen er priset omtrent som området.</li>}
        </ul>
      </Section>

      <Section title="AI-vurdering" right={<button className="btn-ghost text-xs" onClick={() => { onClose(); openChat(); setTimeout(() => window.dispatchEvent(new CustomEvent("agent-ask", { detail: `Fortell meg mer om boligen med Finn-kode ${l.id} (${l.addr}). Hva bør jeg tenke på?` })), 100); }}>Spør agenten om denne</button>}>
        <AiAssessment l={l} a={a} modes={modes} />
      </Section>

      <Section title="Nøkkeltall">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Prisantydning" value={mill(c.price)} />
          <Stat label="Totalpris" value={mill(c.total)} hint="Inkl. fellesgjeld og omkostninger" />
          <Stat label="Fellesgjeld" value={l.debt ? mill(l.debt) : "0"} sub={l.debtEst ? "estimert" : null} />
          <Stat label="Felleskost/mnd" value={kr(l.shared)} sub={c.fkSqm ? `${num(c.fkSqm)} kr/m²` : null} />
          <Stat label="Areal" value={`${l.sqm} m²`} sub={[l.brai && `BRA-i ${l.brai}`, l.prom && `P-rom ${l.prom}`].filter(Boolean).join(" · ") || null} />
          <Stat label="Soverom" value={l.bed ?? "–"} sub={l.rooms ? `${l.rooms} rom` : null} />
          <Stat label="Byggeår" value={l.year ?? "–"} sub={l.renYear ? `oppusset ${l.renYear}` : null} />
          <Stat label="Energimerke" value={l.energy ?? "–"} sub={l.floor != null ? `${l.floor}. etasje` : null} />
        </div>
        <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
          <KV k="Kr per m² (totalpris)" v={num(c.ppsqm)} />
          <KV k="Standard (fra annonsetekst)" v={RENO_LABEL[c.reno]} />
          <KV k="Publisert" v={dateNo(l.pub)} />
          <KV k="Visning" v={l.viewing ? dateNo(l.viewing, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "–"} />
          {l.plot ? <KV k="Tomt" v={`${num(l.plot)} m²`} /> : null}
          {l.coop ? <KV k="Borettslag/sameie" v={<span className="text-xs">{l.coop}</span>} /> : null}
          <KV k="Megler" v={<span className="text-xs">{l.broker}</span>} />
          {l.tax ? <KV k="Formuesverdi" v={kr(l.tax)} /> : null}
        </div>
        {l.prices?.length > 1 && (
          <div className="mt-2 text-xs text-ink2">Prishistorikk: {l.prices.map(([d, p]) => `${dateNo(d)}: ${mill(p)}`).join(" → ")}</div>
        )}
      </Section>

      <Section title="Pris mot området">
        <PriceRange c={c} />
      </Section>

      {a.innflytting && (
        <Section title={`${MODES.innflytting.emoji} Bo selv – månedlige kostnader`}>
          <KV k={`Egenkapital (${As.ekSelf} %${As.equity ? " / din EK" : ""})`} v={kr(a.innflytting.ek)} />
          <KV k="Lån" v={kr(a.innflytting.loan)} />
          <KV k={`Terminbeløp (${num(rate, 2)} %, ${As.years} år)`} v={kr(a.innflytting.pay)} />
          <KV k="Felleskostnader" v={kr(l.shared)} />
          {a.innflytting.hybel > 0 && <KV k="− Leie fra utleiedel (etter ledighet)" v={kr(-a.innflytting.hybel)} />}
          <KV k="Sum per måned" v={kr(a.innflytting.monthly)} strong />
          {a.innflytting.stress != null && <KV k="Stresstest (rente +3 pp, min. 7 %)" v={kr(a.innflytting.stress)} hint="Bankene sjekker at du tåler en renteøkning på 3 prosentpoeng" />}
          {a.innflytting.affordable != null && (
            <p className={`mt-1 text-sm ${a.innflytting.affordable ? "text-up" : "text-down"}`}>
              {a.innflytting.affordable ? "✓ Innenfor lånegrensen (5× inntekt) med oppgitt inntekt/egenkapital." : "✗ Over lånegrensen (5× inntekt) eller for lite egenkapital."}
            </p>
          )}
          {!As.income && <p className="mt-1 text-xs text-muted">Legg inn inntekt og egenkapital under forutsetninger for å se om du får lån.</p>}
        </Section>
      )}

      {a.utleie && (
        <Section title={`${MODES.utleie.emoji} Utleie – avkastning og kontantstrøm`}>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Stat label="Estimert leie/mnd" value={kr(a.utleie.rent)} sub={l.rent ? `${l.rent.n} leieannonser (${l.rent.scope})` : "ingen data"} />
            <Stat label="Brutto yield" value={pct(a.utleie.gross, 1)} />
            <Stat label="Netto yield" value={pct(a.utleie.net, 1)} />
          </div>
          <KV k={`Leie − ${As.vacancy} % ledighet`} v={kr(a.utleie.rent * (1 - As.vacancy / 100))} />
          <KV k="− Felleskostnader" v={kr(-l.shared)} />
          <KV k={`− Vedlikehold (${As.maintSqm} kr/m²/år)`} v={kr(-a.utleie.maint)} />
          <KV k={`− Renter (lån ${mill(a.utleie.loan)}, EK ${a.utleie.ekPct} %)`} v={kr(-a.utleie.interest)} />
          <KV k="= Kontantstrøm før avdrag" v={signedKr(a.utleie.cfExAvdrag)} strong />
          <KV k="Kontantstrøm etter avdrag" v={signedKr(a.utleie.cf)} hint="Avdrag er sparing – du eier mer av boligen hver måned" />
          <KV k={`Etter skatt (${As.taxRent} %) og avdrag`} v={signedKr(a.utleie.cfAfterTax)} />
          <label className="mt-3 block max-w-xs"><span className="h-sub">Egen leievurdering (kr/mnd)</span>
            <NumInput value={note.rent} onChange={v => setNote({ rent: v })} placeholder={String(l.rent?.est || "")} suffix="kr" /></label>
          {modes.includes("innflytting") && l.rental && <p className="mt-2 text-xs text-muted">Utleiedel estimert til ca. {kr(l.rent?.hybel)}/mnd.</p>}
        </Section>
      )}

      {a.oppussing && (
        <Section title={`${MODES.oppussing.emoji} Oppussing – regnestykke`}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink2">Oppussingsnivå:</span>
            {["lett", "middels", "total"].map(lv => (
              <button key={lv} className={`rounded-full border px-2.5 py-0.5 text-xs ${a.oppussing.level === lv ? "border-accent bg-accent text-white" : "border-line text-ink2"}`}
                onClick={() => setNote({ reno: lv })}>{RENO_LABEL[lv]}</button>
            ))}
            {note.reno && <button className="text-xs text-muted hover:text-accent" onClick={() => setNote({ reno: undefined })}>tilbakestill</button>}
          </div>
          {l.strong?.length > 0 && <p className="mb-2 text-xs text-ink2">Fra annonsen: «{l.strong.join("», «")}»</p>}
          <KV k="Totalpris" v={kr(c.total)} />
          <KV k={`+ Oppussing (${num(a.oppussing.perSqm)} kr/m² × ${l.sqm} m²)`} v={kr(a.oppussing.cost)} />
          <KV k={`+ Bærekostnader (${As.holdMonths} mnd renter og felleskost)`} v={kr(a.oppussing.hold)} />
          <KV k={`+ Salgskostnader (${As.sellCost} %)`} v={kr(a.oppussing.sell)} />
          <KV k="Verdi etter oppussing" v={kr(a.oppussing.after)} hint="Øvre kvartil kr/m² blant lignende boliger i god stand i nærheten × areal" />
          <KV k="= Beregnet gevinst" v={signedKr(a.oppussing.profit)} strong />
          <KV k="Margin / avkastning på egenkapital" v={`${pct(a.oppussing.margin, 0)} / ${pct(a.oppussing.roi, 0)}`} />
        </Section>
      )}

      <Section title="Dine tall">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="h-sub">Regn på et bud (prisantydning er {mill(l.price)})</span>
            <NumInput value={note.bid} onChange={v => setNote({ bid: v })} placeholder={String(l.price)} suffix="kr" /></label>
          <label className="sm:col-span-2"><span className="h-sub">Notater (lagres i nettleseren)</span>
            <textarea className="input min-h-[70px]" value={note.note || ""} onChange={e => setNote({ note: e.target.value })} placeholder="F.eks. inntrykk fra visning, spørsmål til megler …" /></label>
        </div>
      </Section>

      {l.desc && (
        <Section title="Fra annonseteksten">
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink2">{l.desc.slice(0, 900)}{l.desc.length >= 900 ? " …" : ""}</p>
        </Section>
      )}
      <div className="h-6" />
    </Drawer>
  );
}
