// Beregner nøkkeltall, score (0–100) og «Kjøp / Vurder / Ikke kjøp» for hver bolig.
// Alt skjer i nettleseren, slik at forutsetningene dine (rente, egenkapital ...) slår inn med en gang.
import { daysSince, kr, num, pct, signedKr } from "./format.js";

export const MODES = {
  oppussing: { id: "oppussing", label: "Oppussingsobjekt", short: "Oppussing", emoji: "🔨", desc: "Kjøp billig, pus opp, selg eller bo med gevinst" },
  utleie: { id: "utleie", label: "Utleieobjekt", short: "Utleie", emoji: "🔑", desc: "Leieinntekt, avkastning og kontantstrøm" },
  innflytting: { id: "innflytting", label: "Klar for innflytting", short: "Bo selv", emoji: "🏠", desc: "God pris, god standard og overkommelige kostnader" },
};

export const VERDICT = {
  kjop: { label: "Kjøp", cls: "bg-good/15 text-up border-good/40", dot: "#0ca30c" },
  vurder: { label: "Vurder", cls: "bg-warn/15 text-ink border-warn/50", dot: "#fab219" },
  ikke: { label: "Ikke kjøp", cls: "bg-bad/10 text-down border-bad/40", dot: "#d03b3b" },
};
export const RENO_LABEL = { ingen: "God stand", lett: "Lett oppussing", middels: "Middels oppussing", total: "Totalrenovering" };

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const lerp = (v, x0, x1) => clamp(((v - x0) / (x1 - x0)) * 100);

/** Månedlig terminbeløp for annuitetslån */
export function annuity(loan, ratePct, years) {
  if (loan <= 0) return 0;
  const r = ratePct / 100 / 12;
  const n = years * 12;
  return r === 0 ? loan / n : (loan * r) / (1 - (1 + r) ** -n);
}

export function currentRate(market, A) {
  if (A.rate != null && A.rate !== "") return Number(A.rate);
  const last = market?.mortgage?.at?.(-1)?.[1];
  return last ? Math.round(last * 100) / 100 : 5.3;
}

/**
 * @param l   bolig fra listings.json
 * @param modes  ["oppussing","utleie","innflytting"]
 * @param A   forutsetninger
 * @param rate  rente i %
 * @param ov  egne overstyringer { bid, rent, reno }
 */
export function analyze(l, modes, A, rate, ov = {}) {
  const price = ov.bid > 0 ? Number(ov.bid) : l.price;
  const total = l.total - l.price + price;           // fellesgjeld og omkostninger følger med
  const sqm = l.sqm;
  const ppsqm = total / sqm;
  const cmp = l.cmp || null;
  const disc = cmp?.med ? (cmp.med - ppsqm) / cmp.med : null;     // + = billigere enn nabolaget
  const shared = l.shared || 0;
  const fkSqm = shared ? shared / sqm : null;
  const debtShare = total ? (l.debt || 0) / total : 0;
  const firstPrice = l.prices?.[0]?.[1];
  const drop = firstPrice && firstPrice > l.price ? (firstPrice - l.price) / firstPrice : 0;
  const dom = daysSince(l.pub || l.first);
  const reno = ov.reno || l.reno || "ingen";
  const rentEst = ov.rent > 0 ? Number(ov.rent) : l.rent?.est || null;
  const isOslo = l.area === "oslo";
  // Robust rabatt for scoring: krympes mot 0 når det er få sammenligninger, og begrenses til ±25 %
  const nEff = cmp ? (cmp.weak ? 2 : cmp.n) : 0;
  const discS = disc == null ? null : Math.max(-0.25, Math.min(0.25, disc * (nEff / (nEff + 5))));
  const priceScore = discS == null ? 50 : clamp(50 + discS * 200);

  const common = { price, total, ppsqm, cmp, disc, fkSqm, debtShare, drop, dom, reno, rentEst };
  const reasons = [];
  const add = (good, text, w = 1) => reasons.push({ good, text, w });

  // Felles observasjoner
  if (disc != null) {
    if (cmp.weak) add(false, `Få lignende boliger i nærheten – prissammenligningen er usikker`, 0.6);
    else if (disc >= 0.05) add(true, `${pct(disc, 0)} billigere per m² enn ${cmp.n} lignende boliger (${cmp.scope})`, 2);
    else if (disc <= -0.08) add(false, `${pct(-disc, 0)} dyrere per m² enn ${cmp.n} lignende boliger (${cmp.scope})`, 2);
  }
  if (drop >= 0.02) add(true, `Prisen er satt ned ${pct(drop, 0)} siden annonsen kom`, 1.5);
  if (dom != null && dom >= 60) add(true, `Har ligget ute i ${dom} dager – rom for forhandling`, 0.8);
  if (debtShare > 0.5) add(false, `Høy fellesgjeld (${pct(debtShare, 0)} av totalpris)`, 1.5);
  if (cmp?.fk && fkSqm) {
    if (fkSqm > cmp.fk * 1.3) add(false, `Høye felleskostnader (${num(fkSqm)} kr/m² mot ${num(cmp.fk)} i området)`, 1);
    else if (fkSqm < cmp.fk * 0.75) add(true, `Lave felleskostnader (${num(fkSqm)} kr/m² mot ${num(cmp.fk)} i området)`, 0.8);
  }
  if (["F", "G"].includes(l.energy)) add(false, `Dårlig energimerke (${l.energy})`, 0.6);

  const res = { common, reasons, scores: {} };

  // ── Klar for innflytting ────────────────────────────────────────────
  if (modes.includes("innflytting")) {
    const ek = Math.max(total * (A.ekSelf / 100), A.equity || 0);
    const loan = Math.max(0, total - ek);
    const pay = annuity(loan, rate, A.years);
    const hybel = modes.includes("utleie") && l.rental ? (l.rent?.hybel || 0) * (1 - A.vacancy / 100) : 0;
    const monthly = pay + shared - hybel;
    const sPrice = priceScore;
    let sCond = { ingen: 70, lett: 45, middels: 20, total: 5 }[reno];
    if (reno === "ingen" && l.modern?.length) sCond += 10;
    if ((l.year || 0) >= 2010) sCond += 8;
    if (["A", "B"].includes(l.energy)) sCond += 5;
    if (["F", "G"].includes(l.energy)) sCond -= 10;
    sCond = clamp(sCond);
    let sCost, affordable = null, stress = null;
    if (A.income > 0) {
      const share = (monthly * 12) / A.income;
      stress = annuity(loan, Math.max(rate + 3, 7), A.years) + shared - hybel;
      affordable = loan + (l.debt || 0) <= A.income * 5 && (A.equity <= 0 || A.equity >= total * (A.ekSelf / 100));
      sCost = clamp(lerp(share, 0.5, 0.2)) * (affordable ? 1 : 0.4);
      if (!affordable) add(false, "Over lånegrensen din (5× inntekt eller for lite egenkapital)", 2);
    } else {
      const fkRel = cmp?.fk && fkSqm ? fkSqm / cmp.fk : 1;
      sCost = clamp(55 - (fkRel - 1) * 80 - Math.max(0, debtShare - 0.3) * 120);
    }
    const sMarket = clamp(45 + drop * 600 + (dom > 60 ? 10 : 0));
    const score = sPrice * 0.45 + sCond * 0.2 + sCost * 0.2 + sMarket * 0.15 + (hybel ? 8 : 0);
    if (reno === "ingen" && (l.modern?.length || (l.year || 0) >= 2010)) add(true, "God/moderne standard – lite behov for oppussing", 1);
    if (reno === "middels" || reno === "total") add(false, `Trenger ${RENO_LABEL[reno].toLowerCase()} før innflytting`, 1.5);
    if (hybel) add(true, `Utleiedel kan gi ca. ${kr(l.rent.hybel)}/mnd i leie`, 1.5);
    res.scores.innflytting = clamp(score);
    res.innflytting = { score: clamp(score), ek, loan, pay, monthly, hybel, affordable, stress, parts: { pris: sPrice, standard: sCond, kostnader: sCost, marked: sMarket } };
  }

  // ── Oppussingsobjekt ────────────────────────────────────────────────
  let renoCost = 0;
  if (modes.includes("oppussing")) {
    const level = reno === "ingen" ? "lett" : reno;
    const perSqm = { lett: A.renoLett, middels: A.renoMiddels, total: A.renoTotal }[level];
    renoCost = sqm * perSqm;
    const after = cmp ? sqm * Math.max(cmp.p75 || cmp.med, cmp.good || 0) : null;
    const ek = total * (A.ekSelf / 100);
    const loan = total - ek;
    const hold = loan * (rate / 100) * (A.holdMonths / 12) + shared * A.holdMonths;
    const sell = after ? after * (A.sellCost / 100) : 0;
    const profit = after != null ? after - total - renoCost - hold - sell : null;
    const margin = profit != null ? profit / (total + renoCost) : null;
    const roi = profit != null ? profit / (ek + renoCost) : null;
    let score = margin == null ? 30 : clamp(30 + margin * 400);
    if (reno === "ingen") {
      score = Math.min(score, 45);
      add(false, "Ikke et tydelig oppussingsobjekt (ingen tegn i annonsen)", 1);
    } else {
      add(true, `Oppussingsbehov: ${RENO_LABEL[reno].toLowerCase()}${l.strong?.length ? ` («${l.strong[0]}»)` : ""}`, 1);
    }
    if (profit != null) add(profit > 0, `Beregnet gevinst etter oppussing: ${signedKr(profit)} (${pct(margin, 0)} margin)`, 2);
    res.scores.oppussing = score;
    res.oppussing = { score, level, perSqm, cost: renoCost, after, hold, sell, profit, margin, roi, ek };
  }

  // ── Utleieobjekt ────────────────────────────────────────────────────
  if (modes.includes("utleie")) {
    const renovated = modes.includes("oppussing") && reno !== "ingen";
    const rent = rentEst ? rentEst * (renovated ? 1.05 : 1) : null;
    const invest = total + (renovated ? renoCost : 0);
    const ekPct = modes.includes("innflytting") ? A.ekSelf : isOslo ? A.ekRentOslo : A.ekRent;
    const ek = invest * (ekPct / 100);
    const loan = invest - ek;
    const pay = annuity(loan, rate, A.years);
    const interest = loan * (rate / 100) / 12;
    const maint = (A.maintSqm * sqm) / 12;
    let gross = null, net = null, cf = null, cfAfterTax = null, cfExAvdrag = null;
    if (rent) {
      const income = rent * (1 - A.vacancy / 100);
      const noi = (income - shared - maint) * 12;
      gross = (rent * 12) / invest;
      net = noi / invest;
      cfExAvdrag = income - shared - maint - interest;
      cf = income - shared - maint - pay;
      const taxable = noi - interest * 12;
      cfAfterTax = cf - Math.max(0, taxable) * (A.taxRent / 100) / 12;
    }
    const sYield = net == null ? 30 : lerp(net * 100, 2.0, 5.0);
    const sCf = cfExAvdrag == null ? 30 : lerp(cfExAvdrag, -8000, 1500);
    let score = sYield * 0.5 + sCf * 0.3 + priceScore * 0.2;
    if (l.rental) score += 6;
    if (net != null) add(net >= 0.035, `Netto leieavkastning ${pct(net, 1)} (leie ca. ${kr(rent)}/mnd)`, 2);
    if (cfExAvdrag != null) add(cfExAvdrag >= 0, `Kontantstrøm ${signedKr(cfExAvdrag)}/mnd etter renter og drift (før avdrag)`, 1.5);
    if (l.rental && !modes.includes("innflytting")) add(true, "Har utleiedel / flere enheter", 1);
    if (l.rent && l.rent.n < 5) add(false, "Usikkert leieestimat (få leieannonser i nærheten)", 0.7);
    res.scores.utleie = clamp(score);
    res.utleie = { score: clamp(score), rent, invest, ek, ekPct, loan, pay, interest, maint, gross, net, cf, cfExAvdrag, cfAfterTax };
  }

  // ── Samlet ──────────────────────────────────────────────────────────
  const active = modes.filter(m => res.scores[m] != null);
  let score;
  if (modes.includes("innflytting") && modes.includes("utleie") && l.rental && !modes.includes("oppussing")) {
    score = res.scores.innflytting; // bo selv + lei ut utleiedel: utleie er bakt inn i månedskostnaden
  } else {
    score = active.reduce((s, m) => s + res.scores[m], 0) / Math.max(1, active.length);
  }
  res.score = Math.round(clamp(score));
  res.verdict = res.score >= 65 ? "kjop" : res.score >= 48 ? "vurder" : "ikke";
  const conf = (cmp?.n >= 10 && !cmp.weak ? 1 : cmp ? 0.5 : 0) + (l.det ? 1 : 0) + (!modes.includes("utleie") || (l.rent?.n || 0) >= 8 ? 1 : 0);
  res.confidence = conf >= 2.5 ? "høy" : conf >= 1.5 ? "middels" : "lav";
  reasons.sort((a, b) => b.w - a.w);
  return res;
}

/** Kort tekstoppsummering av en bolig, brukt av AI-agenten */
export function summarize(l, a) {
  const c = a.common;
  const o = {
    finnkode: l.id, adresse: l.addr, omrade: l.sub, type: l.type, eierform: l.own,
    prisantydning: Math.round(c.price), totalpris: Math.round(c.total), fellesgjeld: l.debt, felleskost_mnd: l.shared,
    kvm: l.sqm, soverom: l.bed, byggeaar: l.year, energimerke: l.energy, standard: c.reno,
    kr_per_kvm: Math.round(c.ppsqm), median_kr_per_kvm_naboer: c.cmp?.med, rabatt_vs_naboer: c.disc != null ? Math.round(c.disc * 1000) / 10 + " %" : null,
    dager_ute: c.dom, prisnedsatt: c.drop ? Math.round(c.drop * 1000) / 10 + " %" : null, utleiedel: l.rental,
    score: a.score, vurdering: VERDICT[a.verdict].label, sikkerhet: a.confidence,
  };
  if (a.utleie) Object.assign(o, { leie_estimat: a.utleie.rent, netto_yield: a.utleie.net != null ? Math.round(a.utleie.net * 1000) / 10 + " %" : null, kontantstrom_mnd: Math.round(a.utleie.cfExAvdrag ?? 0) });
  if (a.oppussing) Object.assign(o, { oppussingskost: Math.round(a.oppussing.cost), verdi_etter: Math.round(a.oppussing.after ?? 0), gevinst: Math.round(a.oppussing.profit ?? 0) });
  if (a.innflytting) Object.assign(o, { maanedskost: Math.round(a.innflytting.monthly) });
  return o;
}
