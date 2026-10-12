import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Heart, LineChart, List, Map as MapIcon } from "lucide-react";
import { AppContext, applyFilters, loadData } from "./lib/data.js";
import { analyze, currentRate } from "./lib/analysis.js";
import {
  assumptionsStore, favoritesStore, filtersStore, modesStore, notesStore, settingsStore, useStore,
} from "./lib/store.js";
import Header from "./components/Header.jsx";
import ModeBar from "./components/ModeBar.jsx";
import FilterBar from "./components/FilterBar.jsx";
import ListView from "./components/ListView.jsx";
import MapView from "./components/MapView.jsx";
import MarketView from "./components/MarketView.jsx";
import ListingDrawer from "./components/ListingDrawer.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import IntroModal from "./components/IntroModal.jsx";
import BriefCard from "./components/BriefCard.jsx";
import { Empty, Spinner } from "./components/ui.jsx";

const VIEWS = [
  ["liste", "Liste", List],
  ["kart", "Kart", MapIcon],
  ["favoritter", "Favoritter", Heart],
  ["marked", "Marked", LineChart],
];

export default function App() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useStore(settingsStore);
  const [assumptions, setAssumptions] = useStore(assumptionsStore);
  const [modes, setModes] = useStore(modesStore);
  const [filters, setFilters] = useStore(filtersStore);
  const [favorites, setFavorites] = useStore(favoritesStore);
  const [notes, setNotes] = useStore(notesStore);
  const [view, setView] = useState("liste");
  const [openId, setOpenId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(!settings.seenIntro);

  useEffect(() => { loadData().then(setData); }, []);

  // Tema
  useEffect(() => {
    const apply = () => {
      const t = settings.theme;
      const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);

  const listings = data?.listings || [];
  const market = data?.market || {};
  const meta = data?.meta || {};
  const rate = currentRate(market, assumptions);
  const activeModes = modes.length ? modes : ["innflytting"];

  // Analyse av alle boliger (rask: noen tusen boliger tar noen få millisekunder)
  const A = useMemo(() => {
    const out = {};
    for (const l of listings) out[l.id] = analyze(l, activeModes, assumptions, rate, notes[l.id]);
    return out;
  }, [listings, activeModes.join(","), assumptions, rate, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => applyFilters(listings, A, filters, favorites), [listings, A, filters, favorites]);
  const favList = useMemo(() => applyFilters(listings, A, { ...filters, areas: [], subs: [], types: [], q: "", verdict: "alle", maxPrice: 0, minPrice: 0, minSqm: 0, maxSqm: 0, minBed: 0, own: "alle", onlyNew: false, onlyDrop: false, onlyRental: false, onlyReno: false }, favorites, true), [listings, A, filters, favorites]);

  const openListing = useCallback(id => setOpenId(id), []);
  const ctx = {
    listings, market, meta, brief: data?.brief, A, filtered, rate,
    modes: activeModes, setModes, filters, setFilters, assumptions, setAssumptions,
    favorites, setFavorites, notes, setNotes, settings, setSettings,
    openListing, setView, openSettings: () => setSettingsOpen(true), openChat: () => setChatOpen(true),
  };
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  ctx.getCtx = () => ctxRef.current;

  const open = openId ? listings.find(l => l.id === openId) : null;

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen">
        <Header onSettings={() => setSettingsOpen(true)} onChat={() => setChatOpen(o => !o)} onHelp={() => setIntroOpen(true)} />
        <main className={`mx-auto max-w-[1400px] space-y-4 px-4 pb-16 pt-4 transition-[padding] ${chatOpen ? "lg:pr-[440px]" : ""}`}>
          {!data ? (
            <div className="flex items-center justify-center gap-2 py-24 text-ink2"><Spinner /> Laster boliger …</div>
          ) : !listings.length ? (
            <Empty icon={Building2} title="Ingen data ennå">
              Dataene hentes automatisk av GitHub hver morgen og ettermiddag. Første innhenting tar litt tid – sjekk igjen om en stund.
            </Empty>
          ) : (
            <>
              <ModeBar />
              <BriefCard />
              <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Visning">
                {VIEWS.map(([id, label, Icon]) => (
                  <button key={id} onClick={() => setView(id)} aria-pressed={view === id}
                    className={`btn shrink-0 ${view === id ? "bg-ink text-surface" : "text-ink2 hover:bg-ink/5"}`}>
                    <Icon className="h-4 w-4" aria-hidden />{label}
                    {id === "favoritter" && favorites.length > 0 && <span className="num rounded-full bg-accent px-1.5 text-[10px] text-white">{favorites.length}</span>}
                  </button>
                ))}
              </nav>
              {(view === "liste" || view === "kart") && <FilterBar count={filtered.length} />}
              {view === "liste" && <ListView items={filtered} />}
              {view === "kart" && <MapView items={filtered} />}
              {view === "favoritter" && (favList.length ? <ListView items={favList} /> : (
                <Empty icon={Heart} title="Ingen favoritter ennå">Trykk på hjertet på en bolig for å lagre den her. Favorittene lagres i denne nettleseren.</Empty>
              ))}
              {view === "marked" && <MarketView />}
            </>
          )}
        </main>
        {open && <ListingDrawer l={open} onClose={() => setOpenId(null)} />}
        {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        {introOpen && <IntroModal onClose={() => { setIntroOpen(false); setSettings(s => ({ ...s, seenIntro: true })); }} />}
      </div>
    </AppContext.Provider>
  );
}
