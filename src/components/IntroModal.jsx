import { Modal } from "./ui.jsx";

const STEPS = [
  ["1", "Velg hva du leter etter", "Trykk på 🔨 Oppussingsobjekt, 🔑 Utleieobjekt og/eller 🏠 Klar for innflytting. Du kan kombinere – f.eks. utleie + oppussing, eller bo selv + leie ut en utleiedel."],
  ["2", "Filtrer", "Velg område, boligtype og makspris. «Flere filtre» gir bydel, størrelse, soverom og snarveier som «Bare Kjøp» og «Prisnedsatt»."],
  ["3", "Se rådet", "Hver bolig får Kjøp / Vurder / Ikke kjøp med en score 0–100. Trykk på en bolig for å se hvorfor, alle regnestykker, og for å få en AI-vurdering."],
  ["4", "Legg inn dine tall", "Under ⚙️ kan du legge inn rente, inntekt og egenkapital, så ser du månedskostnad og om du får lån. I hver bolig kan du regne på et eget bud."],
  ["5", "Spør AI-agenten", "Trykk «AI-agent» og skriv f.eks. «Vis gode utleieleiligheter i Oslo under 4 mill». Agenten endrer filtrene for deg, sammenligner boliger, søker på nettet og kan hente ferske data."],
];

export default function IntroModal({ onClose }) {
  return (
    <Modal title="Velkommen til Leilighetsscreeneren 👋" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-ink2">Siden henter automatisk alle boliger til salgs i <b className="text-ink">Oslo, Stavanger og Vestfold</b> fra Finn.no hver dag, og sammenligner dem med naboboliger, leiepriser og renter fra SSB og Norges Bank. Alt er gratis.</p>
        <ol className="space-y-3">
          {STEPS.map(([n, t, d]) => (
            <li key={n} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-white">{n}</span>
              <div><div className="text-sm font-semibold">{t}</div><div className="text-sm text-ink2">{d}</div></div>
            </li>
          ))}
        </ol>
        <p className="rounded-lg bg-ink/5 p-3 text-xs text-ink2">Tallene er estimater basert på prisantydninger og leieannonser – ikke takst eller finansiell rådgivning. Les alltid salgsoppgave og tilstandsrapport før du byr.</p>
        <button className="btn-primary" onClick={onClose}>Kom i gang</button>
      </div>
    </Modal>
  );
}
