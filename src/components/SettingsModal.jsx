import { useState } from "react";
import { CheckCircle2, ExternalLink, Eye, EyeOff, RotateCcw } from "lucide-react";
import { assumptionsStore, DEFAULT_ASSUMPTIONS, settingsStore, useStore } from "../lib/store.js";
import { listModels, PREFERRED_MODELS } from "../lib/gemini.js";
import { useApp } from "../lib/data.js";
import { REPO } from "../lib/github.js";
import { num } from "../lib/format.js";
import { Modal, NumInput, Seg, Spinner } from "./ui.jsx";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="h-sub">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

function SecretInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex-1">
      <input className="input pr-9 font-mono" type={show ? "text" : "password"} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} autoComplete="off" spellCheck={false} />
      <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => setShow(s => !s)} aria-label={show ? "Skjul" : "Vis"}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const { market } = useApp();
  const [settings, setSettings] = useStore(settingsStore);
  const [A, setA] = useStore(assumptionsStore);
  const [key, setKey] = useState(settings.apiKey);
  const [gh, setGh] = useState(settings.ghToken);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = patch => setSettings(s => ({ ...s, ...patch }));
  const setAs = patch => setA(s => ({ ...s, ...patch }));
  const ssbRate = market?.mortgage?.at(-1);

  async function test() {
    setBusy(true); setStatus(null);
    try {
      const models = await listModels(key.trim());
      set({ apiKey: key.trim(), models });
      setStatus({ ok: true, text: `Nøkkelen virker! ${models.length} Gemini-modeller tilgjengelig.` });
    } catch (e) {
      setStatus({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const modelOptions = settings.models?.length
    ? [...PREFERRED_MODELS.filter(m => settings.models.includes(m)), ...settings.models.filter(m => !PREFERRED_MODELS.includes(m))]
    : PREFERRED_MODELS;

  return (
    <Modal title="Innstillinger og forutsetninger" onClose={onClose} wide>
      <div className="space-y-6">
        <section>
          <h3 className="h-title">Dine forutsetninger</h3>
          <p className="mt-1 text-sm text-ink2">Brukes i alle beregninger. Endringer slår inn med en gang.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Boliglånsrente" hint={ssbRate ? `Tomt = SSB-snitt for nye lån (${num(ssbRate[1], 2)} %, ${ssbRate[0]})` : "Tomt = automatisk"}>
              <NumInput value={A.rate ?? ""} onChange={v => setAs({ rate: v || null })} placeholder={ssbRate ? String(ssbRate[1]) : "5.3"} suffix="%" />
            </Field>
            <Field label="Nedbetalingstid"><NumInput value={A.years} onChange={v => setAs({ years: v || 30 })} suffix="år" /></Field>
            <Field label="Husholdningens brutto årsinntekt" hint="Valgfritt – gir lånesjekk (5× inntekt)"><NumInput value={A.income} onChange={v => setAs({ income: v })} placeholder="0" suffix="kr" /></Field>
            <Field label="Egenkapital du har" hint="Valgfritt"><NumInput value={A.equity} onChange={v => setAs({ equity: v })} placeholder="0" suffix="kr" /></Field>
            <Field label="EK-krav, bo selv"><NumInput value={A.ekSelf} onChange={v => setAs({ ekSelf: v })} suffix="%" /></Field>
            <Field label="EK-krav, utleie (utenfor Oslo / Oslo)">
              <div className="flex gap-2"><NumInput value={A.ekRent} onChange={v => setAs({ ekRent: v })} suffix="%" /><NumInput value={A.ekRentOslo} onChange={v => setAs({ ekRentOslo: v })} suffix="%" /></div>
            </Field>
            <Field label="Ledighet ved utleie"><NumInput value={A.vacancy} onChange={v => setAs({ vacancy: v })} suffix="%" /></Field>
            <Field label="Vedlikehold utleie"><NumInput value={A.maintSqm} onChange={v => setAs({ maintSqm: v })} suffix="kr/m²/år" /></Field>
            <Field label="Skatt på leieinntekt"><NumInput value={A.taxRent} onChange={v => setAs({ taxRent: v })} suffix="%" /></Field>
            <Field label="Oppussing: lett / middels / total" hint="kr per m²">
              <div className="flex gap-1.5"><NumInput value={A.renoLett} onChange={v => setAs({ renoLett: v })} /><NumInput value={A.renoMiddels} onChange={v => setAs({ renoMiddels: v })} /><NumInput value={A.renoTotal} onChange={v => setAs({ renoTotal: v })} /></div>
            </Field>
            <Field label="Salgskostnader ved videresalg"><NumInput value={A.sellCost} onChange={v => setAs({ sellCost: v })} suffix="%" /></Field>
            <Field label="Prosjekttid oppussing"><NumInput value={A.holdMonths} onChange={v => setAs({ holdMonths: v })} suffix="mnd" /></Field>
          </div>
          <button className="btn-ghost mt-2 text-xs" onClick={() => setA({ ...DEFAULT_ASSUMPTIONS })}><RotateCcw className="h-3.5 w-3.5" /> Tilbakestill forutsetninger</button>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="h-title">AI-agent (Google Gemini)</h3>
          <p className="mt-1 text-sm text-ink2">Lim inn Gemini API-nøkkelen og trykk «Lagre og test». Den lagres bare i denne nettleseren og sendes kun til Google. Gjør det én gang per enhet (PC/mobil).</p>
          <a className="mt-1 inline-flex items-center gap-1 text-sm text-accent hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Lag eller finn nøkkel: aistudio.google.com/apikey <ExternalLink className="h-3 w-3" />
          </a>
          <div className="mt-3 flex gap-2">
            <SecretInput value={key} onChange={setKey} placeholder="Lim inn nøkkelen her" />
            <button className="btn-primary" onClick={test} disabled={!key.trim() || busy}>{busy ? <Spinner /> : null} Lagre og test</button>
          </div>
          {status && <p className={`mt-2 flex items-center gap-1.5 text-sm ${status.ok ? "text-up" : "text-down"}`}>{status.ok && <CheckCircle2 className="h-4 w-4" />}{status.text}</p>}
          {settings.apiKey && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Modell">
                <select className="input" value={settings.model} onChange={e => set({ model: e.target.value })}>
                  <option value="">Automatisk (anbefalt)</option>
                  {modelOptions.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <button className="btn-ghost text-xs text-down" onClick={() => { set({ apiKey: "", models: [], model: "" }); setKey(""); }}>Fjern nøkkel fra denne nettleseren</button>
            </div>
          )}
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="h-title">«Hent ferske data nå» (valgfritt)</h3>
          <p className="mt-1 text-sm text-ink2">
            Data oppdateres automatisk to ganger daglig. Vil du kunne starte innhenting med ett klikk (eller be AI-agenten gjøre det), lag et
            {" "}<a className="text-accent hover:underline" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">fine-grained GitHub-token</a>{" "}
            med tilgang kun til repoet <code className="rounded bg-ink/5 px-1 text-xs">{REPO}</code> og rettigheten <b>Actions: Read and write</b>.
          </p>
          <div className="mt-2 flex gap-2">
            <SecretInput value={gh} onChange={setGh} placeholder="github_pat_…" />
            <button className="btn-outline" onClick={() => set({ ghToken: gh.trim() })} disabled={gh.trim() === settings.ghToken}>Lagre</button>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="h-title mb-2">Tema</h3>
          <Seg label="Tema" value={settings.theme} onChange={v => set({ theme: v })} options={[["system", "Automatisk"], ["light", "Lyst"], ["dark", "Mørkt"]]} />
        </section>
      </div>
    </Modal>
  );
}
