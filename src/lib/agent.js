// Verktøyene den innebygde AI-agenten kan bruke. Agenten kan søke i boligene, åpne og sammenligne dem,
// endre filtre/modus/forutsetninger på siden, hente markedsdata, søke på nettet, lese nettsider
// (f.eks. en Finn-annonse utenfor datasettet) og starte en ny datainnhenting.
import { analyze, MODES, summarize, VERDICT } from "./analysis.js";
import { applyFilters, AREA_NAMES } from "./data.js";
import { generate } from "./gemini.js";
import { ACTIONS_URL, lastRun, triggerUpdate } from "./github.js";
import { DEFAULT_FILTERS } from "./store.js";

const S = (type, description, extra = {}) => ({ type, description, ...extra });
const FILTER_PROPS = {
  omrader: S("array", "Områder: oslo, stavanger, vestfold. Tom = alle.", { items: { type: "string", enum: ["oslo", "stavanger", "vestfold"] } }),
  delomrader: S("array", "Bydeler/kommuner, f.eks. «Grünerløkka», «Tønsberg», «Hinna». Må matche navn fra markedsdata.", { items: { type: "string" } }),
  boligtyper: S("array", "leil = leilighet, smahus = rekkehus/tomannsbolig, ene = enebolig.", { items: { type: "string", enum: ["leil", "smahus", "ene"] } }),
  maks_pris: S("number", "Maks totalpris i kr (inkl. fellesgjeld)."),
  min_pris: S("number", "Min totalpris i kr."),
  min_kvm: S("number", "Minste bruksareal i m²."),
  maks_kvm: S("number", "Største bruksareal i m²."),
  min_soverom: S("number", "Minst antall soverom."),
  eierform: S("string", "alle, selveier eller andel (borettslag/aksje).", { enum: ["alle", "selveier", "andel"] }),
  kun_kjop: S("boolean", "Vis bare boliger med vurdering «Kjøp»."),
  kun_utleiedel: S("boolean", "Bare boliger med utleiedel/hybel."),
  kun_oppussing: S("boolean", "Bare boliger med tegn på oppussingsbehov."),
  kun_prisnedsatt: S("boolean", "Bare boliger som er satt ned i pris."),
  kun_nye: S("boolean", "Bare annonser fra siste 7 dager."),
  skjul_nybygg: S("boolean", "Skjul nybygg/prosjektboliger."),
  fritekst: S("string", "Søk i adresse/overskrift."),
  sorter: S("string", "Sortering.", { enum: ["score", "rabatt", "yield", "gevinst", "pris", "kvmpris", "nyeste", "prisned"] }),
};
const MODE_PROP = S("array", "Investeringsmodus (kan kombineres): oppussing, utleie, innflytting.", { items: { type: "string", enum: ["oppussing", "utleie", "innflytting"] } });

export const DECLARATIONS = [
  {
    name: "sok_boliger",
    description: "Søker i alle boliger til salgs i datasettet og returnerer de beste treffene med nøkkeltall og vurdering. Endrer ikke siden.",
    parameters: { type: "object", properties: { ...FILTER_PROPS, modus: MODE_PROP, antall: S("number", "Antall treff (standard 8, maks 25).") } },
  },
  {
    name: "hent_bolig",
    description: "Henter alle detaljer, beregninger og begrunnelser for én bolig (Finn-kode).",
    parameters: { type: "object", properties: { finnkode: S("string", "Finn-koden") }, required: ["finnkode"] },
  },
  {
    name: "sammenlign_boliger",
    description: "Sammenligner 2–6 boliger side om side.",
    parameters: { type: "object", properties: { finnkoder: S("array", "Finn-koder", { items: { type: "string" } }) }, required: ["finnkoder"] },
  },
  {
    name: "vis_pa_siden",
    description: "Oppdaterer filtrene (og eventuelt modus) på nettsiden slik at brukeren ser utvalget. Bruk når brukeren ber deg vise/finne/filtrere boliger.",
    parameters: { type: "object", properties: { ...FILTER_PROPS, modus: MODE_PROP, nullstill: S("boolean", "Nullstill andre filtre først (standard true).") } },
  },
  {
    name: "apne_bolig",
    description: "Åpner detaljvisningen for en bolig på siden.",
    parameters: { type: "object", properties: { finnkode: S("string", "Finn-koden") }, required: ["finnkode"] },
  },
  {
    name: "sett_forutsetninger",
    description: "Endrer brukerens beregningsforutsetninger (lagres). Bare felt som oppgis endres.",
    parameters: {
      type: "object", properties: {
        rente: S("number", "Boliglånsrente i prosent, f.eks. 5.2"),
        nedbetalingstid: S("number", "År"),
        inntekt: S("number", "Brutto årsinntekt for husholdningen i kr"),
        egenkapital: S("number", "Tilgjengelig egenkapital i kr"),
        ek_prosent_selvbo: S("number", "Egenkapitalkrav % når man bor selv"),
        ek_prosent_utleie: S("number", "Egenkapitalkrav % for utleiebolig utenfor Oslo"),
        ek_prosent_utleie_oslo: S("number", "Egenkapitalkrav % for utleiebolig i Oslo"),
        ledighet: S("number", "Ledighet i % av året ved utleie"),
        oppussing_lett: S("number", "kr/m² for lett oppussing"),
        oppussing_middels: S("number", "kr/m² for middels oppussing"),
        oppussing_total: S("number", "kr/m² for totalrenovering"),
      },
    },
  },
  {
    name: "favoritt",
    description: "Legger til eller fjerner en bolig fra favorittene.",
    parameters: { type: "object", properties: { finnkode: S("string", "Finn-kode"), legg_til: S("boolean", "true = legg til, false = fjern") }, required: ["finnkode"] },
  },
  {
    name: "markedsdata",
    description: "Markedsdata: median kr/m² og leie per bydel/kommune fra annonsene, SSB-leiepriser, prisindeks og renter.",
    parameters: { type: "object", properties: { omrade: S("string", "oslo, stavanger eller vestfold", { enum: ["oslo", "stavanger", "vestfold"] }) } },
  },
  {
    name: "datastatus",
    description: "Når dataene sist ble oppdatert, og status for siste automatiske innhenting på GitHub.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "oppdater_data",
    description: "Starter en ny innhenting av ferske annonser og markedsdata (tar 10–40 min). Bruk bare når brukeren ber om det.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "nettsok",
    description: "Søker på nettet (Google) etter fersk informasjon: nabolag, skoler, regulering, nyheter, rentemøter, byggeprosjekter osv.",
    parameters: { type: "object", properties: { sporsmal: S("string", "Hva som skal søkes etter") }, required: ["sporsmal"] },
  },
  {
    name: "les_nettside",
    description: "Leser en nettside (f.eks. en Finn-annonse som ikke er i datasettet, salgsoppgave eller artikkel) og trekker ut det viktigste.",
    parameters: { type: "object", properties: { url: S("string", "Full URL"), hva: S("string", "Hva du vil finne ut") }, required: ["url"] },
  },
];

function filtersFromArgs(a, base) {
  const f = { ...base };
  if (a.omrader) f.areas = a.omrader;
  if (a.delomrader) f.subs = a.delomrader;
  if (a.boligtyper) f.types = a.boligtyper;
  if (a.maks_pris != null) f.maxPrice = a.maks_pris;
  if (a.min_pris != null) f.minPrice = a.min_pris;
  if (a.min_kvm != null) f.minSqm = a.min_kvm;
  if (a.maks_kvm != null) f.maxSqm = a.maks_kvm;
  if (a.min_soverom != null) f.minBed = a.min_soverom;
  if (a.eierform) f.own = a.eierform;
  if (a.kun_kjop != null) f.verdict = a.kun_kjop ? "kjop" : "alle";
  if (a.kun_utleiedel != null) f.onlyRental = a.kun_utleiedel;
  if (a.kun_oppussing != null) f.onlyReno = a.kun_oppussing;
  if (a.kun_prisnedsatt != null) f.onlyDrop = a.kun_prisnedsatt;
  if (a.kun_nye != null) f.onlyNew = a.kun_nye;
  if (a.skjul_nybygg != null) f.noNew = a.skjul_nybygg;
  if (a.fritekst != null) f.q = a.fritekst;
  if (a.sorter) f.sort = a.sorter;
  return f;
}

// Delområder matches løst (store/små bokstaver, delvis navn)
function resolveSubs(subs, listings) {
  if (!subs?.length) return subs;
  const all = [...new Set(listings.map(l => l.sub))];
  return subs.flatMap(s => all.filter(n => n.toLowerCase().includes(String(s).toLowerCase())));
}

/** getCtx() returnerer alltid siste tilstand fra appen. */
export function createExecutor(getCtx) {
  return async function execute(name, args) {
    const c = getCtx();
    const byId = id => c.listings.find(l => l.id === String(id).replace(/\D/g, ""));

    switch (name) {
      case "sok_boliger": {
        const modes = args.modus?.length ? args.modus : c.modes;
        const f = filtersFromArgs(args, { ...DEFAULT_FILTERS, types: [] });
        f.subs = resolveSubs(f.subs, c.listings);
        let A = c.A;
        if (args.modus?.length) {
          A = {};
          for (const l of c.listings) A[l.id] = analyze(l, modes, c.assumptions, c.rate, c.notes[l.id]);
        }
        const hits = applyFilters(c.listings, A, f, c.favorites);
        const n = Math.min(25, args.antall || 8);
        return {
          antall_treff: hits.length,
          modus: modes.map(m => MODES[m].label),
          boliger: hits.slice(0, n).map(l => summarize(l, A[l.id])),
        };
      }
      case "hent_bolig": {
        const l = byId(args.finnkode);
        if (!l) return { feil: "Fant ikke boligen i datasettet. Bruk les_nettside med Finn-lenken for boliger utenfor datasettet." };
        const a = c.A[l.id];
        return {
          ...summarize(l, a),
          lenke: `https://www.finn.no/realestate/homes/ad.html?finnkode=${l.id}`,
          overskrift: l.title,
          megler: l.broker,
          visning: l.viewing,
          fasiliteter: l.fac,
          prishistorikk: l.prices,
          sammenlignbare: l.cmp,
          leieestimat: l.rent,
          begrunnelser: a.reasons.map(r => `${r.good ? "+" : "−"} ${r.text}`),
          delscore: a.scores,
          beskrivelse: l.desc || "(ikke hentet ennå)",
          utleie: a.utleie, oppussing: a.oppussing, innflytting: a.innflytting,
        };
      }
      case "sammenlign_boliger": {
        return (args.finnkoder || []).slice(0, 6).map(id => {
          const l = byId(id);
          return l ? summarize(l, c.A[l.id]) : { finnkode: id, feil: "ikke funnet" };
        });
      }
      case "vis_pa_siden": {
        const base = args.nullstill === false ? c.filters : { ...DEFAULT_FILTERS, types: [] };
        const f = filtersFromArgs(args, base);
        f.subs = resolveSubs(f.subs, c.listings);
        c.setFilters(f);
        if (args.modus?.length) c.setModes(args.modus);
        c.setView("liste");
        await new Promise(r => setTimeout(r, 50));
        const now = getCtx();
        const hits = applyFilters(now.listings, now.A, f, now.favorites);
        return { ok: true, viser: hits.length, topp3: hits.slice(0, 3).map(l => summarize(l, now.A[l.id])) };
      }
      case "apne_bolig": {
        const l = byId(args.finnkode);
        if (!l) return { feil: "Fant ikke boligen." };
        c.openListing(l.id);
        return { ok: true };
      }
      case "sett_forutsetninger": {
        const map = {
          rente: "rate", nedbetalingstid: "years", inntekt: "income", egenkapital: "equity", ek_prosent_selvbo: "ekSelf",
          ek_prosent_utleie: "ekRent", ek_prosent_utleie_oslo: "ekRentOslo", ledighet: "vacancy",
          oppussing_lett: "renoLett", oppussing_middels: "renoMiddels", oppussing_total: "renoTotal",
        };
        const patch = {};
        for (const [k, v] of Object.entries(args)) if (map[k] && v != null) patch[map[k]] = v;
        c.setAssumptions(s => ({ ...s, ...patch }));
        return { ok: true, endret: patch };
      }
      case "favoritt": {
        const id = String(args.finnkode);
        const add = args.legg_til !== false;
        c.setFavorites(f => (add ? [...new Set([...f, id])] : f.filter(x => x !== id)));
        return { ok: true };
      }
      case "markedsdata": {
        const m = c.market;
        const ids = args.omrade ? [args.omrade] : Object.keys(m.areas || {});
        const out = {};
        for (const id of ids) {
          const a = m.areas?.[id];
          if (!a) continue;
          const idx = m.priceIndex?.[a.region] || [];
          const last = idx.at(-1), yearAgo = idx.at(-5);
          out[AREA_NAMES[id] || id] = {
            boliger_til_salgs: a.n, leieannonser: a.nLet, median_kr_per_kvm: a.medSqm, median_leie_kr_per_kvm_mnd: a.medRentSqm,
            prisvekst_siste_aar: last && yearAgo ? `${(((last[1] / yearAgo[1]) - 1) * 100).toFixed(1)} % (SSB, ${last[0]})` : null,
            delomrader: a.subs.slice(0, 25),
            ssb_leie_snitt_per_rom: m.rentSSB?.zones?.[a.zone],
          };
        }
        return {
          omrader: out,
          boliglansrente_nye_lan: m.mortgage?.at(-1),
          styringsrente: m.policy?.at(-1),
          rente_brukt_i_beregninger: c.rate,
        };
      }
      case "datastatus": {
        const run = await lastRun().catch(() => null);
        return { sist_oppdatert: c.meta.updated, antall_boliger: c.meta.count, med_detaljer: c.meta.withDetails, leieannonser: c.meta.lettings, siste_kjoring: run };
      }
      case "oppdater_data": {
        const r = await triggerUpdate();
        if (r.ok) return { ok: true, melding: "Innhenting startet. Nye data er på siden om ca. 10–40 minutter (last siden på nytt da).", lenke: r.url };
        if (r.needToken) return { ok: false, melding: `For å starte innhenting herfra må brukeren legge inn et GitHub-token under Innstillinger. Alternativt: åpne ${ACTIONS_URL} og trykk «Run workflow». Data oppdateres uansett automatisk hver morgen og ettermiddag.` };
        return { ok: false, melding: r.error, lenke: r.url };
      }
      case "nettsok": {
        const r = await generate({
          system: "Du er en norsk research-assistent for boligkjøp. Svar kort og faktabasert på norsk, med tall og datoer der det finnes.",
          messages: [{ role: "user", text: args.sporsmal }],
          search: true,
        });
        return { svar: r.text, kilder: r.sources.slice(0, 5) };
      }
      case "les_nettside": {
        const r = await generate({
          system: "Du leser nettsider for en boligkjøper. Trekk ut fakta: prisantydning, totalpris, fellesgjeld, felleskostnader, areal (BRA-i/P-rom), soverom, byggeår, energimerke, eierform, tilstand/TG-avvik, beliggenhet. Svar på norsk, kort. Si tydelig fra hvis siden ikke kunne leses.",
          messages: [{ role: "user", text: `Les ${args.url}. ${args.hva || ""}` }],
          urlContext: true,
          search: false,
        });
        return { innhold: r.text, kilder: r.sources.slice(0, 3) };
      }
      default:
        return { feil: `Ukjent verktøy ${name}` };
    }
  };
}

export function agentSystemPrompt(c) {
  const modes = c.modes.map(m => MODES[m].label).join(" + ");
  const A = c.assumptions;
  const counts = Object.entries(c.market.areas || {}).map(([id, a]) => `${a.name}: ${a.n}`).join(", ");
  return `Du er «Boligagenten», en hjelpsom norsk AI-rådgiver innebygd i Leilighetsscreeneren – en nettside som screener boliger til salgs i Oslo, Stavanger og Vestfold med gratis data fra Finn.no, SSB og Norges Bank.

Brukeren er en privatperson (NHH-student) som vurderer å kjøpe bolig. Svar alltid på norsk bokmål, kort, konkret og lettfattelig. Bruk verktøyene aktivt i stedet for å gjette: søk i boligene, hent detaljer, endre filtre på siden, hent markedsdata, søk på nettet eller les nettsider. Når brukeren ber deg «finne», «vise» eller «filtrere» boliger: bruk vis_pa_siden slik at siden oppdateres, og oppsummer de beste treffene. Oppgi alltid Finn-kode og adresse når du nevner en bolig, og formater som markdown-lenke: [adresse](https://www.finn.no/realestate/homes/ad.html?finnkode=KODE).

Slik fungerer vurderingene: Hver bolig får en score 0–100 per valgt modus (oppussing / utleie / innflytting) og et samlet råd: Kjøp (≥65), Vurder (48–64), Ikke kjøp (<48). Kvadratmeterpris sammenlignes med lignende boliger i nærheten (samme type og størrelse). Leie estimeres fra leieannonser på Finn i nærheten (+ SSB). Oppussingsgevinst = verdi etter oppussing (øvre kvartil kr/m² blant naboboliger i god stand) − totalpris − oppussing − bærekostnader − salgskostnader. Tallene er estimater, ikke takst – minn om å lese salgsoppgave/tilstandsrapport og at du ikke er en autorisert finansiell rådgiver når det er relevant.

Nå: modus = ${modes}. Rente brukt = ${c.rate} %. Egenkapitalkrav: selvbo ${A.ekSelf} %, utleie ${A.ekRent} % (Oslo ${A.ekRentOslo} %). Inntekt: ${A.income ? A.income + " kr" : "ikke oppgitt"}. Egenkapital: ${A.equity ? A.equity + " kr" : "ikke oppgitt"}.
Data sist oppdatert: ${c.meta.updated || "ukjent"}. Antall boliger: ${counts}. Dagens dato: ${new Date().toISOString().slice(0, 10)}.`;
}

export const STEP_LABEL = {
  sok_boliger: "Søker i boliger",
  hent_bolig: "Henter boligdetaljer",
  sammenlign_boliger: "Sammenligner boliger",
  vis_pa_siden: "Oppdaterer filtrene på siden",
  apne_bolig: "Åpner bolig",
  sett_forutsetninger: "Endrer forutsetninger",
  favoritt: "Oppdaterer favoritter",
  markedsdata: "Henter markedsdata",
  datastatus: "Sjekker datastatus",
  oppdater_data: "Starter datainnhenting",
  nettsok: "Søker på nettet",
  les_nettside: "Leser nettside",
};
export { VERDICT };
