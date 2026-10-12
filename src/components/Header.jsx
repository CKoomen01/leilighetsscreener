import { useEffect, useState } from "react";
import { CircleHelp, Home, RefreshCw, Settings, Sparkles } from "lucide-react";
import { useApp } from "../lib/data.js";
import { ACTIONS_URL, lastRun, triggerUpdate } from "../lib/github.js";
import { Modal, Spinner } from "./ui.jsx";

function fmtUpdated(iso) {
  if (!iso) return "ukjent";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
  return today ? `i dag ${t}` : `${d.toLocaleDateString("nb-NO", { day: "numeric", month: "short" })} ${t}`;
}

function UpdateModal({ onClose }) {
  const { meta, settings, openSettings } = useApp();
  const [run, setRun] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { lastRun().then(setRun).catch(() => setRun(null)); }, []);

  async function start() {
    setBusy(true);
    const r = await triggerUpdate();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Innhenting startet! Nye data er klare om ca. 10–40 minutter – last siden på nytt da." } : { ok: false, text: r.error || "Kunne ikke starte." });
    if (r.ok) setTimeout(() => lastRun().then(setRun), 4000);
  }

  const running = run && run.status !== "completed";
  return (
    <Modal title="Oppdatere data" onClose={onClose}>
      <div className="space-y-3 text-sm text-ink2">
        <p>Dataene hentes <b className="text-ink">automatisk hver morgen (ca. kl. 07) og ettermiddag (ca. kl. 17)</b> fra Finn.no, SSB og Norges Bank. Du trenger ikke gjøre noe.</p>
        <div className="rounded-lg border border-line bg-raised p-3">
          <div>Sist oppdatert: <b className="text-ink">{fmtUpdated(meta.updated)}</b></div>
          <div>{meta.count ?? 0} boliger · {meta.withDetails ?? 0} med full detaljinfo · {meta.lettings ?? 0} leieannonser</div>
          {run === undefined ? <div className="mt-1 flex items-center gap-2"><Spinner className="h-3 w-3" /> Sjekker GitHub …</div> : run && (
            <div className="mt-1">Siste kjøring: {running ? <b className="text-accent">pågår nå …</b> : run.conclusion === "success" ? <span className="text-up">vellykket</span> : <span className="text-down">{run.conclusion}</span>}
              {" · "}<a className="text-accent hover:underline" href={run.url} target="_blank" rel="noopener noreferrer">se detaljer</a></div>
          )}
          {meta.stale && <div className="mt-1 text-down">Finn svarte ikke ved siste innhenting – viser forrige datasett.</div>}
        </div>
        {settings.ghToken ? (
          <button className="btn-primary" onClick={start} disabled={busy || running}>{busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Hent ferske data nå</button>
        ) : (
          <div className="space-y-2">
            <p>Vil du hente nye data <i>akkurat nå</i>? Åpne GitHub og trykk <b className="text-ink">«Run workflow»</b>:</p>
            <a className="btn-primary w-fit" href={ACTIONS_URL} target="_blank" rel="noopener noreferrer"><RefreshCw className="h-4 w-4" /> Åpne GitHub Actions</a>
            <p className="text-xs">Tips: Legg inn et GitHub-token under <button className="text-accent hover:underline" onClick={() => { onClose(); openSettings(); }}>Innstillinger</button>, så kan du (og AI-agenten) starte innhenting med ett klikk herfra.</p>
          </div>
        )}
        {msg && <p className={msg.ok ? "text-up" : "text-down"}>{msg.text}</p>}
      </div>
    </Modal>
  );
}

export default function Header({ onSettings, onChat, onHelp }) {
  const { meta } = useApp();
  const [upd, setUpd] = useState(false);
  return (
    <header className="sticky top-0 z-[900] border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white"><Home className="h-4 w-4" aria-hidden /></span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Leilighetsscreener</div>
            <div className="text-[11px] text-muted">Oslo · Stavanger · Vestfold</div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost hidden text-xs sm:inline-flex" onClick={() => setUpd(true)} title="Oppdatere data">
            <RefreshCw className="h-3.5 w-3.5" /> Oppdatert {fmtUpdated(meta.updated)}
          </button>
          <button className="btn-ghost p-2 sm:hidden" onClick={() => setUpd(true)} aria-label="Oppdatere data"><RefreshCw className="h-4 w-4" /></button>
          <button className="btn-ghost p-2" onClick={onHelp} aria-label="Hjelp"><CircleHelp className="h-4 w-4" /></button>
          <button className="btn-ghost p-2" onClick={onSettings} aria-label="Innstillinger"><Settings className="h-4 w-4" /></button>
          <button className="btn-primary ml-1" onClick={onChat}><Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">AI-agent</span></button>
        </div>
      </div>
      {upd && <UpdateModal onClose={() => setUpd(false)} />}
    </header>
  );
}
