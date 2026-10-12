import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { useApp } from "../lib/data.js";
import { Markdown } from "./ui.jsx";

/** Dagens AI-oppsummering, laget av Gemini i GitHub Actions ved hver datainnhenting. */
export default function BriefCard() {
  const { brief } = useApp();
  const [open, setOpen] = useState(false);
  if (!brief?.text) return null;
  return (
    <section className="card overflow-hidden border-accent/30">
      <button className="flex w-full items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="flex-1 text-sm font-semibold">Dagens AI-oppsummering <span className="font-normal text-muted">· {brief.date}</span></span>
        <span className="hidden text-xs text-muted sm:inline">{open ? "Skjul" : "Les"}</span>
        <ChevronDown className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line px-4 py-3"><Markdown text={brief.text} /></div>}
    </section>
  );
}
