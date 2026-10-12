import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Send, Settings, Trash2, Wrench, X } from "lucide-react";
import { useApp } from "../lib/data.js";
import { runAgent } from "../lib/gemini.js";
import { agentSystemPrompt, createExecutor, DECLARATIONS, STEP_LABEL } from "../lib/agent.js";
import { chatStore, useStore } from "../lib/store.js";
import { Markdown, Spinner } from "./ui.jsx";

const SUGGESTIONS = [
  "Vis de 10 beste utleieleilighetene i Oslo under 4 mill",
  "Finn oppussingsobjekter i Vestfold med størst gevinst",
  "Hvilke bydeler i Stavanger gir best leieavkastning?",
  "Jeg tjener 650 000 og har 400 000 i egenkapital – hva har jeg råd til?",
  "Hent ferske data",
  "Hva skjer med renta fremover?",
];

export default function ChatPanel({ onClose }) {
  const app = useApp();
  const [chat, setChat] = useStore(chatStore);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState([]);
  const end = useRef(null);
  const ta = useRef(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [chat.msgs.length, live.length, busy]);
  useEffect(() => { ta.current?.focus(); }, []);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    setLive([]);
    const msgs = [...chat.msgs, { role: "user", text: q }];
    setChat(c => ({ ...c, msgs }));
    try {
      const c = app.getCtx();
      const contents = [...(chat.contents || []).slice(-30), { role: "user", parts: [{ text: q }] }];
      const r = await runAgent({
        system: agentSystemPrompt(c),
        contents,
        declarations: DECLARATIONS,
        execute: createExecutor(app.getCtx),
        onStep: s => setLive(l => [...l, s]),
      });
      // Lagre bare tekstdelene av eldre turer (verktøysvar kan være store)
      const slim = r.contents.filter(m => m.parts.some(p => p.text && !p.thought)).map(m => ({ role: m.role, parts: m.parts.filter(p => p.text && !p.thought).map(p => ({ text: p.text })) }));
      setChat({ msgs: [...msgs, { role: "model", text: r.text || "(tomt svar)", steps: r.steps.map(s => s.name), model: r.model }], contents: slim.slice(-30) });
    } catch (e) {
      setChat(c => ({ ...c, msgs: [...msgs, { role: "model", text: `⚠️ ${e.message}`, error: true }] }));
    } finally {
      setBusy(false);
      setLive([]);
    }
  }

  // Andre deler av siden kan sende spørsmål hit
  useEffect(() => {
    const h = e => send(e.detail);
    window.addEventListener("agent-ask", h);
    return () => window.removeEventListener("agent-ask", h);
  });

  const noKey = !app.settings.apiKey;

  return createPortal(
    <aside className="fixed bottom-0 right-0 top-0 z-[1000] flex w-full flex-col border-l border-line bg-surface shadow-2xl animate-slide-in sm:top-[53px] lg:w-[430px]" aria-label="AI-agent">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/15 text-accent"><Bot className="h-4 w-4" /></span>
        <div className="flex-1 leading-tight">
          <div className="text-sm font-semibold">Boligagenten</div>
          <div className="text-[11px] text-muted">Søker, filtrerer, regner, henter data og søker på nettet</div>
        </div>
        {chat.msgs.length > 0 && <button className="btn-ghost p-1.5" onClick={() => setChat({ msgs: [], contents: [] })} aria-label="Tøm samtalen" title="Ny samtale"><Trash2 className="h-4 w-4" /></button>}
        <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Lukk"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 scroll-thin">
        {noKey && (
          <div className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm text-ink2">
            For å bruke AI-agenten må Gemini-nøkkelen legges inn én gang.
            <button className="btn-primary mt-2" onClick={app.openSettings}><Settings className="h-4 w-4" /> Åpne innstillinger</button>
          </div>
        )}
        {!chat.msgs.length && (
          <div className="space-y-2">
            <p className="text-sm text-ink2">Hei! Jeg kjenner alle boligene på siden og kan endre filtrene for deg. Prøv for eksempel:</p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} disabled={busy || noKey}
                className="block w-full rounded-lg border border-line bg-raised px-3 py-2 text-left text-sm text-ink2 hover:border-accent hover:text-ink disabled:opacity-50">{s}</button>
            ))}
          </div>
        )}
        {chat.msgs.map((m, i) => (
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-xl rounded-br-sm bg-accent px-3 py-2 text-sm text-white">{m.text}</div>
          ) : (
            <div key={i} className={`mr-4 rounded-xl rounded-bl-sm border px-3 py-2 ${m.error ? "border-bad/40 bg-bad/5" : "border-line bg-raised"}`}>
              {m.steps?.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {[...new Set(m.steps)].map(s => <span key={s} className="chip text-[10px]"><Wrench className="h-2.5 w-2.5" />{STEP_LABEL[s] || s}</span>)}
                </div>
              )}
              <Markdown text={m.text} />
            </div>
          )
        ))}
        {busy && (
          <div className="mr-4 space-y-1 rounded-xl border border-line bg-raised px-3 py-2 text-sm text-ink2">
            <div className="flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Tenker …</div>
            {live.map((s, i) => <div key={i} className="flex items-center gap-1.5 text-xs text-muted"><Wrench className="h-3 w-3" />{STEP_LABEL[s.name] || s.name}</div>)}
          </div>
        )}
        <div ref={end} />
      </div>

      <form className="border-t border-line p-3" onSubmit={e => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2">
          <textarea ref={ta} rows={2} className="input resize-none" placeholder={noKey ? "Legg inn API-nøkkel først" : "Spør om boliger, be om filtre, beregninger …"}
            value={input} onChange={e => setInput(e.target.value)} disabled={noKey}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="btn-primary h-9" disabled={busy || !input.trim() || noKey} aria-label="Send"><Send className="h-4 w-4" /></button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted">AI kan ta feil. Estimater er ikke takst eller finansiell rådgivning.</p>
      </form>
    </aside>,
    document.body,
  );
}
