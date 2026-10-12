# Leilighetsscreener

Screener for boliger til salgs i **Oslo, Stavanger og Vestfold**. Den gir hver bolig rådet **Kjøp / Vurder / Ikke kjøp** ut fra hva du leter etter:

- 🔨 **Oppussingsobjekt**: verdi etter oppussing minus totalpris, oppussing, bærekostnader og salgskostnader
- 🔑 **Utleieobjekt**: estimert leie, netto yield og kontantstrøm med lån
- 🏠 **Klar for innflytting**: pris mot nabolaget, standard, månedskostnad og lånesjekk

Modusene kan kombineres, for eksempel utleie + oppussing, eller bo selv + leie ut en utleiedel.

## Datakilder (alle gratis)

| Kilde | Hva |
|---|---|
| Finn.no | Boliger til salgs (søkesider + detaljsider for nye annonser) og leieannonser (leieestimat) |
| SSB 09895 | Gjennomsnittlig husleie per prissone og antall rom |
| SSB 07221 | Prisindeks for brukte boliger |
| SSB 06035 | Kvadratmeterpris per kommune |
| SSB 10748 | Rente på nye boliglån |
| Norges Bank | Styringsrenten |
| OpenStreetMap | Kart |

Finn.no har ingen gratis offisiell API. Annonsene hentes forsiktig, to ganger i døgnet med pauser, og kun til privat bruk.

## Slik fungerer det

1. **GitHub Actions** (`.github/workflows/update.yml`) kjører `scripts/fetch_data.py` hver dag ca. kl. 06 og 17. Skriptet henter data, beregner sammenlignbare boliger (kr/m² for lignende boliger i nærheten) og leieestimat, og skriver `public/data/*.json`.
2. `scripts/ai_brief.py` lager «Dagens AI-oppsummering» med Gemini (secret `GEMINI_API_KEY`).
3. Tilstand som detaljcache og prishistorikk lagres i grenen `data`.
4. Nettsiden (Vite + React + Tailwind) bygges og publiseres på GitHub Pages. Alle scorer beregnes i nettleseren, slik at dine forutsetninger slår inn med en gang.

## AI-agenten

Agenten («AI-agent» øverst til høyre) bruker Google Gemini direkte fra nettleseren med funksjonskall. Den kan:

- søke i og sammenligne boliger
- åpne en bolig og legge den til i favoritter
- **endre filtre, modus og forutsetninger på siden**
- hente markedsdata
- søke på nettet og lese nettsider (for eksempel en Finn-annonse utenfor datasettet)
- **starte en ny datainnhenting**. Det krever et GitHub-token under Innstillinger.

API-nøkkelen legges inn under ⚙️ Innstillinger og lagres bare i nettleseren. Den ligger aldri i koden.

## Kjøre lokalt

```bash
npm install
pip install -r scripts/requirements.txt
python scripts/fetch_data.py --out public/data --cache cache --max-pages 2 --max-details 20   # liten testhenting
npm run dev
```

Tallene er estimater basert på prisantydninger og leieannonser. De er ikke takst eller finansiell rådgivning.
