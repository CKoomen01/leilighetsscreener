"""Henter og beregner alle data til Leilighetsscreeneren.

Kjøres av GitHub Actions (se .github/workflows/update.yml), men kan også kjøres lokalt:
    python scripts/fetch_data.py --out public/data --cache cache --max-pages 2 --max-details 20

Kilder (alle gratis):
  * Finn.no      – boliger til salgs og til leie (søkesider + detaljsider for nye annonser)
  * SSB          – leiepriser, prisindeks, kvadratmeterpris, boliglånsrente
  * Norges Bank  – styringsrenten
"""
from __future__ import annotations

import argparse
import datetime as dt
import html as htmlmod
import json
import re
import statistics
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import finn  # noqa: E402
import ssb  # noqa: E402

# ── Områder ──────────────────────────────────────────────────────────────
# location = Finns områdekode. zone = SSB prissone (leie), region = SSB prisindeksregion.
AREAS = [
    {"id": "oslo", "name": "Oslo", "location": "0.20061", "zone": "01", "region": "001",
     "kommuner": ["0301"], "radiusKm": 2.0},
    {"id": "stavanger", "name": "Stavanger", "location": "1.20012.20196", "zone": "05", "region": "002",
     "kommuner": ["1103"], "radiusKm": 3.0},
    {"id": "vestfold", "name": "Vestfold", "location": "0.20008", "zone": "20", "region": "006",
     "kommuner": ["3901", "3903", "3905", "3907", "3909", "3911"], "radiusKm": 6.0},
]

TYPE_GROUP = {
    "Leilighet": "leil",
    "Rekkehus": "smahus", "Tomannsbolig": "smahus", "Andre": "smahus",
    "Enebolig": "ene", "Gårdsbruk/Småbruk": "ene", "Hytte": "ene",
}

# Ord i annonseteksten som sier noe om standard
RENO_STRONG = [
    "oppussingsobjekt", "renoveringsobjekt", "oppussingsprosjekt", "behov for oppussing", "behov for renovering",
    "trenger oppussing", "trenger renovering", "oppgraderingsbehov", "moderniseringsbehov", "originalstand",
    "original standard", "opprinnelig standard", "håndverkerdrøm", "totalrenovering",
    "må pusses opp", "behov for modernisering", "dødsbo", "renoveringsbehov", "rehabiliteringsbehov",
]
RENO_LIGHT = [
    "behov for oppgradering", "noe oppgradering", "enkel standard", "eldre standard", "oppfriskning",
    "potensial for oppgradering", "mulighet for oppgradering", "oppgraderingspotensial", "slitt",
    "tidstypisk", "behov for vedlikehold", "vedlikeholdsbehov", "påkostning", "eget preg",
]
MODERN = [
    "nyoppusset", "totalrenovert", "nyrenovert", "pusset opp", "oppusset", "påkostet", "moderne",
    "nytt kjøkken", "nytt bad", "nyere kjøkken", "nyere bad", "innflyttingsklar", "nøkkelferdig", "høy standard",
]

TODAY = dt.date.today().isoformat()


def log(*a):
    print(*a, flush=True)


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return fallback


def save_json(path: Path, obj, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, indent=1 if pretty else None, separators=None if pretty else (",", ":"))
    path.write_text(txt, encoding="utf-8")


def amount(o) -> float | None:
    if isinstance(o, dict):
        v = o.get("amount")
        return float(v) if isinstance(v, (int, float)) and v > 0 else None
    return None


def strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>|</p>|</li>", "\n", s or "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = htmlmod.unescape(s)
    return re.sub(r"[ \t]+", " ", s).strip()


# ── Detaljer fra annonsesiden ────────────────────────────────────────────
def extract_details(ad: dict) -> dict:
    price = ad.get("price") or {}
    size = ad.get("size") or {}
    texts = [ad.get("title") or "", ad.get("summaryUnsafe") or ""]
    for g in ad.get("generalText") or []:
        texts.append(g.get("textUnsafe") or "")
    for p in ad.get("propertyInfo") or []:
        texts.append(p.get("content") or "")
    text = strip_html("\n".join(texts))
    low = text.lower()
    cad = (ad.get("cadastres") or [{}])[0] or {}
    years = [int(y) for y in re.findall(r"(?:pusset opp|oppusset|renovert|rehabilitert|nytt bad|nytt kjøkken)[^.]{0,40}?((?:19[89]|20[0-3])\d)", low)]
    return {
        "debt": price.get("collectiveDebt"),
        "total": price.get("total"),
        "cost": price.get("salesCostSum"),
        "tax": price.get("taxValue"),
        "shared": (ad.get("sharedCost") or {}).get("amount"),
        "sharedIncl": strip_html((ad.get("sharedCost") or {}).get("includesUnsafe") or "")[:240],
        "prom": size.get("primary"),
        "bra": size.get("usable"),
        "brai": size.get("usableAreaI"),
        "floor": ad.get("floor"),
        "rooms": ad.get("rooms"),
        "bed": ad.get("bedrooms"),
        "year": ad.get("constructionYear"),
        "renYear": ad.get("renovatedYear") or (max(years) if years else None),
        "energy": (ad.get("energyLabel") or {}).get("class"),
        "fac": ad.get("facilities") or [],
        "letting": bool(ad.get("lettingUnit")),
        "own": (ad.get("ownershipType") or "").strip(),
        "kommune": str(cad.get("municipalityNumber") or ""),
        "coop": (ad.get("housingCooperative") or {}).get("name"),
        "strong": sorted({k for k in RENO_STRONG if k in low}),
        "light": sorted({k for k in RENO_LIGHT if k in low}),
        "modern": sorted({k for k in MODERN if k in low}),
        "tg3": len(re.findall(r"\btg\s?3\b", low)),
        "utleie": bool(re.search(r"utleiedel|utleieenhet|hybel med egen inngang|leilighet i underetasje|sokkelleilighet|utleiemulighet", low)),
        "desc": text[:900],
    }


# ── Bygg én annonse fra søkedokument + eventuelle detaljer ───────────────
def build_listing(doc: dict, area: dict, sub: str, det: dict | None, hist: dict) -> dict | None:
    price = amount(doc.get("price_suggestion"))
    total = amount(doc.get("price_total"))
    ar = doc.get("area_range") or {}
    sqm = ar.get("size_from") or ar.get("size_to")
    ptype = doc.get("property_type_description") or ""
    if not price or not sqm or sqm < 12 or any(w in ptype.lower() for w in ("tomt", "garasje", "parkering", "næring")):
        return None
    total = total or price
    coords = doc.get("coordinates") or {}
    feats = doc.get("features") or []
    own = (doc.get("owner_type_description") or "").strip()
    d = det or {}

    if d.get("debt") is not None:
        debt, debt_est = float(d["debt"] or 0), False
    else:
        # Totalpris = prisantydning + fellesgjeld + omkostninger
        omk = price * 0.025 + 1300 if own.startswith("Selveier") else 6000
        debt, debt_est = max(0.0, round(total - price - omk, -3)), True
        if debt < 20000:
            debt = 0.0

    # Standard / oppussing. (Finns «is_renovation_object»-flagg er upålitelig, så vi bruker teksten.)
    head = (doc.get("heading") or "").lower()
    strong = sorted(set(d.get("strong", [])) | {k for k in RENO_STRONG if k in head})
    light = sorted(set(d.get("light", [])) | {k for k in RENO_LIGHT if k in head})
    modern = sorted(set(d.get("modern", [])) | {k for k in MODERN if k in head})
    if strong:
        old = (d.get("year") or 2000) < 1975
        reno = "total" if ("totalrenovering" in strong or "dødsbo" in strong or (old and len(strong) >= 2)) else "middels"
    elif light and not any(m in modern for m in ("nyoppusset", "totalrenovert", "nyrenovert", "innflyttingsklar")):
        reno = "lett"
    else:
        reno = "ingen"

    h = hist.get(doc["id"]) or {}
    lst = {
        "id": str(doc["id"]),
        "area": area["id"],
        "sub": sub,
        "addr": doc.get("location") or "",
        "local": doc.get("local_area_name") or "",
        "title": (doc.get("heading") or "")[:160],
        "type": ptype,
        "grp": TYPE_GROUP.get(ptype, "smahus"),
        "own": own or d.get("own") or "",
        "price": price,
        "total": total,
        "debt": debt,
        "debtEst": debt_est,
        "shared": amount(doc.get("price_shared_cost")) or d.get("shared") or 0,
        "sqm": sqm,
        "plot": (doc.get("area_plot") or {}).get("size") or None,
        "bed": doc.get("number_of_bedrooms"),
        "lat": coords.get("lat") or None,
        "lon": coords.get("lon") or None,
        "img": (doc.get("image") or {}).get("url") or ((doc.get("image_urls") or [None])[0]),
        "feat": [f.replace("has_", "") for f in feats if f != "is_renovation_object"],
        "broker": doc.get("organisation_name") or "",
        "pub": dt.datetime.fromtimestamp((doc.get("timestamp") or 0) / 1000, dt.UTC).date().isoformat() if doc.get("timestamp") else None,
        "first": h.get("first") or TODAY,
        "prices": h.get("prices") or [],
        "viewing": (doc.get("viewing_times") or [None])[0],
        "reno": reno,
        "rental": ("has_rental_unit" in feats) or bool(d.get("letting")) or bool(d.get("utleie")),
        "new": doc.get("main_search_key") == "SEARCH_ID_REALESTATE_NEWBUILDINGS" or (doc.get("ad_type") or 1) != 1,
        "det": bool(det),
        "url": doc.get("canonical_url") if "/homes/ad.html" not in (doc.get("canonical_url") or "/homes/ad.html") else None,
        "strong": strong,
        "light": light,
        "modern": modern,
    }
    if det:
        for k in ("prom", "bra", "brai", "floor", "rooms", "year", "renYear", "energy", "fac", "kommune", "coop",
                  "desc", "sharedIncl", "tax", "cost"):
            v = d.get(k)
            if v not in (None, "", [], 0) or k == "floor":
                lst[k] = v
        if not lst.get("bed") and d.get("bed"):
            lst["bed"] = d["bed"]
    return lst


# ── Sammenlignbare boliger (kvadratmeterpris) ────────────────────────────
def haversine_km(lat, lon, lats, lons):
    p = np.pi / 180
    a = 0.5 - np.cos((lats - lat) * p) / 2 + np.cos(lat * p) * np.cos(lats * p) * (1 - np.cos((lons - lon) * p)) / 2
    return 12742 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def add_comparables(listings: list[dict]) -> None:
    """Median totalpris per m² for lignende boliger i nærheten (samme type, lignende størrelse)."""
    for area in AREAS:
        rad = area["radiusKm"]
        items = [x for x in listings if x["area"] == area["id"]]
        # Nybygg sammenlignes bare med nybygg, brukt med brukt
        for grp, is_new in [(g_, n_) for g_ in ("leil", "smahus", "ene") for n_ in (False, True)]:
            g = [x for x in items if x["grp"] == grp and bool(x.get("new")) == is_new]
            if not g:
                continue
            ppsqm = np.array([x["total"] / x["sqm"] for x in g])
            sqm = np.array([x["sqm"] for x in g], dtype=float)
            lat = np.array([x["lat"] or np.nan for x in g], dtype=float)
            lon = np.array([x["lon"] or np.nan for x in g], dtype=float)
            fk = np.array([(x["shared"] or np.nan) / x["sqm"] if x["shared"] else np.nan for x in g])
            good = np.array([x["reno"] == "ingen" for x in g])
            subs = np.array([x["sub"] for x in g])
            for i, x in enumerate(g):
                size_ok = (sqm >= x["sqm"] * 0.6) & (sqm <= x["sqm"] * 1.7)
                size_ok[i] = False
                scope, weak = "nærområde", False
                cand = np.array([], dtype=int)
                if x["lat"] and x["lon"]:
                    dist = haversine_km(x["lat"], x["lon"], lat, lon)
                    # Utvid radius gradvis før vi faller tilbake til hele området
                    for mult in (1, 2, 4):
                        cand = np.where(size_ok & (dist <= rad * mult))[0]
                        if len(cand) >= 6:
                            scope = "nærområde" if mult == 1 else f"innen {rad * mult:g} km"
                            break
                    if len(cand) > 20:
                        cand = cand[np.argsort(dist[cand])[:20]]
                if len(cand) < 6:
                    cand = np.where(size_ok & (subs == x["sub"]))[0]
                    scope = x["sub"] or area["name"]
                if len(cand) < 6:
                    cand = np.where(size_ok)[0]
                    scope, weak = f"hele {area['name']}", True
                if len(cand) < 3:
                    continue
                vals = ppsqm[cand]
                gvals = ppsqm[cand[good[cand]]]
                fks = fk[cand][~np.isnan(fk[cand])]
                x["cmp"] = {
                    "med": round(float(np.median(vals))),
                    "p25": round(float(np.percentile(vals, 25))),
                    "p75": round(float(np.percentile(gvals if len(gvals) >= 3 else vals, 75))),
                    "good": round(float(np.median(gvals))) if len(gvals) >= 3 else None,
                    "n": int(len(cand)),
                    "scope": scope,
                    "fk": round(float(np.median(fks)), 1) if len(fks) >= 3 else None,
                    "weak": weak,
                }


# ── Leiemodell ───────────────────────────────────────────────────────────
RENT_EXP = 0.7  # husleie vokser saktere enn arealet (leie ∝ m²^0.7)


def clean_lettings(docs: list[dict], area: dict, sub_of) -> list[dict]:
    out = []
    for d in docs:
        rent = amount(d.get("price_suggestion"))
        ar = d.get("area_range") or {}
        sqm = ar.get("size_from")
        ptype = (d.get("property_type_description") or "").lower()
        if not rent or not sqm or "rom i" in ptype or "hybel" in ptype or "garasje" in ptype or "næring" in ptype:
            continue
        if not (3000 <= rent <= 90000 and 15 <= sqm <= 300 and 80 <= rent / sqm <= 800):
            continue
        c = d.get("coordinates") or {}
        out.append({
            "rent": rent, "sqm": sqm, "r60": rent * (60 / sqm) ** RENT_EXP,
            "lat": c.get("lat") or None, "lon": c.get("lon") or None,
            "sub": sub_of(d), "area": area["id"], "bed": d.get("number_of_bedrooms"),
            "furn": d.get("furnished_state") or "",
        })
    return out


def add_rent_estimates(listings: list[dict], lettings: list[dict], ssb_rent: dict) -> None:
    for area in AREAS:
        L = [x for x in lettings if x["area"] == area["id"]]
        items = [x for x in listings if x["area"] == area["id"]]
        zone = (ssb_rent.get("zones") or {}).get(area["zone"]) or {}
        if L:
            r60 = np.array([x["r60"] for x in L])
            lat = np.array([x["lat"] or np.nan for x in L], dtype=float)
            lon = np.array([x["lon"] or np.nan for x in L], dtype=float)
            subs = np.array([x["sub"] for x in L])
        for x in items:
            est = None
            scope, n = "", 0
            if L:
                cand = np.array([], dtype=int)
                if x["lat"] and x["lon"]:
                    dist = haversine_km(x["lat"], x["lon"], lat, lon)
                    for mult in (1.5, 3, 6):
                        cand = np.where(dist <= area["radiusKm"] * mult)[0]
                        if len(cand) >= 5:
                            break
                    cand = cand[np.argsort(dist[cand])[:15]]
                    scope = "nærområde" if mult == 1.5 else f"innen {area['radiusKm'] * mult:g} km"
                if len(cand) < 5:
                    cand = np.where(subs == x["sub"])[0]
                    scope = x["sub"]
                if len(cand) < 5:
                    cand = np.arange(len(L))
                    scope = f"hele {area['name']}"
                if len(cand) >= 3:
                    n = int(len(cand)) if not scope.startswith("hele") else 2
                    est = float(np.median(r60[cand])) * (min(x["sqm"], 160) / 60) ** RENT_EXP
            # SSB som støtte når vi har få leieannonser
            rooms = str(min(5, max(1, (x.get("bed") or 1) + 1)))
            rooms = "5+" if rooms == "5" else rooms
            ssb_m = (zone.get(rooms) or {}).get("monthly")
            if ssb_m and (est is None or n < 6):
                ssb_est = ssb_m * (1 + 0.035 * max(0, int(dt.date.today().year) - int(ssb_rent.get("year") or 2025)))
                est = ssb_est if est is None else (est * n + ssb_est * 3) / (n + 3)
                scope = scope or "SSB"
            if est:
                hybel = float(np.median(r60[cand])) * (30 / 60) ** RENT_EXP if L and len(cand) >= 3 else (zone.get("1") or {}).get("monthly")
                x["rent"] = {"est": round(est, -2), "n": n, "scope": scope, "hybel": round(hybel, -2) if hybel else None}


# ── Markedsdata ──────────────────────────────────────────────────────────
def market_data(listings: list[dict], lettings: list[dict]) -> dict:
    m: dict = {"updated": TODAY, "areas": {}}
    try:
        m["rentSSB"] = ssb.rent_by_zone([a["zone"] for a in AREAS] + ["00"])
    except Exception as e:  # noqa: BLE001
        log("  ! SSB leie:", e)
        m["rentSSB"] = {}
    try:
        m["priceIndex"] = ssb.price_index([a["region"] for a in AREAS] + ["TOTAL"])
    except Exception as e:  # noqa: BLE001
        log("  ! SSB prisindeks:", e)
    try:
        m["sqmSSB"] = ssb.sqm_price_by_municipality(sorted({k for a in AREAS for k in a["kommuner"]}))
    except Exception as e:  # noqa: BLE001
        log("  ! SSB kvm-pris:", e)
    try:
        m["mortgage"] = ssb.mortgage_rate()
    except Exception as e:  # noqa: BLE001
        log("  ! SSB boliglånsrente:", e)
    try:
        m["policy"] = ssb.policy_rate()
    except Exception as e:  # noqa: BLE001
        log("  ! Norges Bank:", e)

    for a in AREAS:
        items = [x for x in listings if x["area"] == a["id"]]
        lets = [x for x in lettings if x["area"] == a["id"]]
        subs: dict = {}
        for x in items:
            s = subs.setdefault(x["sub"] or a["name"], {"n": 0, "pp": [], "leil": []})
            s["n"] += 1
            s["pp"].append(x["total"] / x["sqm"])
            if x["grp"] == "leil":
                s["leil"].append(x["total"] / x["sqm"])
        rsub: dict = {}
        for x in lets:
            rsub.setdefault(x["sub"] or a["name"], []).append(x["rent"] / x["sqm"])
        m["areas"][a["id"]] = {
            "name": a["name"],
            "zone": a["zone"],
            "region": a["region"],
            "kommuner": a["kommuner"],
            "n": len(items),
            "nLet": len(lets),
            "medSqm": round(statistics.median([x["total"] / x["sqm"] for x in items])) if items else None,
            "medRentSqm": round(statistics.median([x["rent"] / x["sqm"] for x in lets])) if lets else None,
            "subs": sorted(
                [{"name": k, "n": v["n"], "medSqm": round(statistics.median(v["pp"])),
                  "medLeil": round(statistics.median(v["leil"])) if len(v["leil"]) >= 3 else None,
                  "rentSqm": round(statistics.median(rsub[k])) if len(rsub.get(k, [])) >= 3 else None}
                 for k, v in subs.items()],
                key=lambda s: -s["n"],
            ),
        }
    return m


# ── Hovedløp ─────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--cache", default="cache")
    ap.add_argument("--areas", default=",".join(a["id"] for a in AREAS))
    ap.add_argument("--max-pages", type=int, default=0, help="for testing: maks sider per søk (0 = alle)")
    ap.add_argument("--max-details", type=int, default=900, help="maks nye detaljsider per kjøring")
    ap.add_argument("--delay", type=float, default=1.2, help="pause (sek) mellom forespørsler til Finn")
    ap.add_argument("--time-budget", type=int, default=75, help="maks minutter for detaljhenting")
    ap.add_argument("--offline", action="store_true", help="bare beregn på nytt fra cache (ingen henting fra Finn)")
    args = ap.parse_args()

    out, cache = Path(args.out), Path(args.cache)
    if args.max_pages:
        finn.MAX_PAGE = args.max_pages
    details: dict = load_json(cache / "details.json", {})
    hist: dict = load_json(cache / "history.json", {})
    prev_let: list = load_json(cache / "lettings.json", [])
    prev_listings: list = load_json(cache / "listings.json", [])
    wanted = set(args.areas.split(","))
    started = time.time()
    blocked = False

    # 1) Søkesider: boliger til salgs og til leie
    homes: list[tuple[dict, dict, str]] = []
    lettings: list[dict] = []
    for area in AREAS:
        if area["id"] not in wanted or args.offline:
            continue
        log(f"▶ {area['name']}: boliger til salgs")
        try:
            first = finn.search_page("homes", area["location"], 1)
            subs = finn.sub_locations(first, area["location"]) if first else []
            if not subs:
                subs = [(area["location"], area["name"], 1)]
            for value, name, hits in subs:
                if not hits:
                    continue
                finn.polite_sleep(args.delay)
                for doc in finn.search_all("homes", value, name, args.delay, log):
                    homes.append((doc, area, name))
            log(f"▶ {area['name']}: boliger til leie")
            for value, name, hits in subs:
                finn.polite_sleep(args.delay)
                docs = finn.search_all("lettings", value, name, args.delay, log)
                lettings += clean_lettings(docs, area, lambda d, n=name: n)
        except finn.Blocked as e:
            log("  ! Finn blokkerte forespørselen:", e)
            blocked = True
            break

    if blocked or not homes:
        log("⚠ Bruker forrige datasett (ingen ferske søkeresultater)." if not args.offline else "▶ Offline: beregner på nytt fra cache")
        listings = prev_listings
        lettings = lettings or prev_let
    else:
        # Fjern duplikater (samme annonse kan dukke opp i flere underområder)
        seen, uniq = set(), []
        for doc, area, name in homes:
            if doc.get("id") and doc["id"] not in seen and doc.get("type") == "realestate":
                seen.add(doc["id"])
                uniq.append((doc, area, name))
        homes = uniq
        log(f"✔ {len(homes)} unike annonser, {len(lettings)} leieannonser")

        # 2) Detaljsider for nye (eller prisendrede) annonser, nyeste først
        todo = []
        for doc, area, name in homes:
            c = details.get(doc["id"])
            p = amount(doc.get("price_suggestion"))
            if doc.get("main_search_key") == "SEARCH_ID_REALESTATE_NEWBUILDINGS":
                continue  # nybygg har egne prosjektsider
            if not c or (p and c.get("price") != p and c.get("fetched", "") < TODAY):
                todo.append(doc["id"])
        log(f"▶ Detaljsider: {len(todo)} mangler, henter inntil {args.max_details}")
        n_ok = 0
        doc_by_id = {d["id"]: d for d, _, _ in homes}
        for fid in todo[: args.max_details]:
            if time.time() - started > args.time_budget * 60:
                log("  tidsbudsjett brukt opp, fortsetter neste kjøring")
                break
            try:
                ad = finn.ad_details(fid)
            except finn.Blocked as e:
                log("  ! blokkert under detaljhenting:", e)
                break
            if ad:
                doc = doc_by_id[fid]
                details[fid] = {"fetched": TODAY, "price": amount(doc.get("price_suggestion")), "d": extract_details(ad)}
                n_ok += 1
                if n_ok % 50 == 0:
                    log(f"  {n_ok} detaljsider hentet")
                    save_json(cache / "details.json", details)
            finn.polite_sleep(args.delay)
        log(f"✔ {n_ok} nye detaljsider")

        # 3) Prishistorikk
        active = set()
        for doc, area, name in homes:
            fid = doc["id"]
            active.add(fid)
            t = amount(doc.get("price_suggestion"))
            h = hist.setdefault(fid, {"first": TODAY, "prices": []})
            if t and (not h["prices"] or h["prices"][-1][1] != t):
                h["prices"].append([TODAY, t])
            h["seen"] = TODAY
        # Glem annonser som har vært borte i over 60 dager
        cutoff = (dt.date.today() - dt.timedelta(days=60)).isoformat()
        hist = {k: v for k, v in hist.items() if k in active or v.get("seen", "") >= cutoff}
        details = {k: v for k, v in details.items() if k in active or k in hist}

        # 4) Bygg datasett
        listings = []
        for doc, area, name in homes:
            lst = build_listing(doc, area, name, (details.get(doc["id"]) or {}).get("d"), hist)
            if lst:
                h = hist.get(doc["id"]) or {}
                lst["prices"] = h.get("prices", [])
                listings.append(lst)

    log("▶ Sammenlignbare boliger og leieestimat")
    market = market_data(listings, lettings)
    add_comparables(listings)
    add_rent_estimates(listings, lettings, market.get("rentSSB") or {})

    meta = {
        "updated": dt.datetime.now(dt.UTC).isoformat(timespec="minutes"),
        "count": len(listings),
        "lettings": len(lettings),
        "withDetails": sum(1 for x in listings if x.get("det")),
        "stale": (blocked or not homes) and not args.offline,
        "areas": [{"id": a["id"], "name": a["name"]} for a in AREAS],
    }
    save_json(out / "listings.json", listings)
    save_json(out / "market.json", market)
    save_json(out / "meta.json", meta, pretty=True)
    save_json(cache / "details.json", details)
    save_json(cache / "history.json", hist)
    save_json(cache / "lettings.json", lettings)
    save_json(cache / "listings.json", listings)
    log(f"✔ Ferdig: {meta['count']} boliger ({meta['withDetails']} med detaljer), {meta['lettings']} leieannonser")


if __name__ == "__main__":
    main()
