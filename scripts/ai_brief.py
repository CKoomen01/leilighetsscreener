"""Lager «Dagens AI-oppsummering» med Gemini etter hver datainnhenting.

Bruker miljøvariabelen GEMINI_API_KEY (GitHub-secret). Hopper stille over hvis den mangler
eller Gemini feiler – nettsiden fungerer uansett.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
from pathlib import Path

import requests

API = "https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.5-flash", "gemini-2.5-flash"]


def finn(id_):
    return f"https://www.finn.no/realestate/homes/ad.html?finnkode={id_}"


def candidates(listings: list[dict]) -> dict:
    def short(x, **extra):
        return {"finnkode": x["id"], "adresse": x["addr"], "omrade": x["sub"], "type": x["type"], "kvm": x["sqm"],
                "totalpris": round(x["total"]), "kr_kvm": round(x["total"] / x["sqm"]), **extra}

    out = {}
    with_cmp = [x for x in listings if x.get("cmp")]
    disc = lambda x: (x["cmp"]["med"] - x["total"] / x["sqm"]) / x["cmp"]["med"]
    leil = [x for x in with_cmp if x["grp"] == "leil" and x["cmp"]["n"] >= 8]
    out["billigst_mot_naboer"] = [short(x, rabatt=f"{disc(x)*100:.0f} %") for x in sorted(leil, key=disc, reverse=True)[:8]]
    rent = [x for x in leil if x.get("rent") and x["rent"]["n"] >= 5]
    gy = lambda x: x["rent"]["est"] * 12 / x["total"]
    out["hoyest_brutto_yield"] = [short(x, leie=x["rent"]["est"], brutto_yield=f"{gy(x)*100:.1f} %") for x in sorted(rent, key=gy, reverse=True)[:8]]
    reno = [x for x in with_cmp if x["reno"] in ("middels", "total")]
    pot = lambda x: (x["cmp"]["p75"] * x["sqm"] - x["total"]) / x["total"]
    out["oppussing_potensial"] = [short(x, standard=x["reno"], verdi_ved_p75=round(x["cmp"]["p75"] * x["sqm"])) for x in sorted(reno, key=pot, reverse=True)[:8]]
    drops = [x for x in listings if len(x.get("prices") or []) > 1 and x["prices"][0][1] > x["price"]]
    dr = lambda x: (x["prices"][0][1] - x["price"]) / x["prices"][0][1]
    out["prisnedsatt"] = [short(x, ned=f"{dr(x)*100:.0f} %") for x in sorted(drops, key=dr, reverse=True)[:6]]
    return out


def main():
    key = os.environ.get("GEMINI_API_KEY")
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "public/data")
    if not key:
        print("Ingen GEMINI_API_KEY – hopper over AI-oppsummering.")
        return
    listings = json.loads((out_dir / "listings.json").read_text(encoding="utf-8"))
    market = json.loads((out_dir / "market.json").read_text(encoding="utf-8"))
    if not listings:
        return
    today = dt.date.today().isoformat()
    new = [x for x in listings if x.get("first") == today]
    areas = {k: {"navn": v["name"], "til_salgs": v["n"], "median_kr_kvm": v["medSqm"], "leie_kr_kvm_mnd": v["medRentSqm"]}
             for k, v in market.get("areas", {}).items()}
    data = {
        "dato": today,
        "omrader": areas,
        "nye_annonser_i_dag": len(new),
        "boliglansrente": (market.get("mortgage") or [None])[-1],
        "styringsrente": (market.get("policy") or [None])[-1],
        "kandidater": candidates(listings),
    }
    prompt = (
        "Du skriver en kort daglig oppsummering (maks 220 ord) på norsk bokmål for en privat boligkjøper som screener "
        "boliger i Oslo, Stavanger og Vestfold. Bruk markdown: én kort innledning om markedet i dag (antall boliger, renter), "
        "deretter tre korte punktlister: **Mest under markedspris**, **Best for utleie**, **Oppussingskandidater** – 3 boliger "
        "hver, som lenker på formen [adresse](finn-lenke) med 1 nøkkeltall. Avslutt med én setning om prisnedsettelser hvis "
        "noen er store. Ikke finn på tall. Finn-lenke: https://www.finn.no/realestate/homes/ad.html?finnkode=KODE\n\n"
        + json.dumps(data, ensure_ascii=False)
    )
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048}}
    for m in MODELS:
        try:
            r = requests.post(API.format(m=m), headers={"x-goog-api-key": key}, json=body, timeout=120)
        except requests.RequestException as e:
            print("  ", m, e)
            continue
        if r.ok:
            parts = (r.json().get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            if text.strip():
                (out_dir / "ai_brief.json").write_text(json.dumps({"date": today, "model": m, "text": text}, ensure_ascii=False), encoding="utf-8")
                print(f"✔ AI-oppsummering laget med {m}")
                return
        print("  ", m, r.status_code)
        time.sleep(3)
    print("⚠ Kunne ikke lage AI-oppsummering i dag.")


if __name__ == "__main__":
    main()
