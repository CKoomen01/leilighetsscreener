"""Gratis markedsdata fra SSB (statistikkbanken) og Norges Bank."""
from __future__ import annotations

import requests

SSB = "https://data.ssb.no/api/v0/no/table"


def _post(table: str, query: list[dict]) -> dict:
    r = requests.post(f"{SSB}/{table}", json={"query": query, "response": {"format": "json-stat2"}}, timeout=60)
    r.raise_for_status()
    return r.json()


def _sel(code: str, values: list[str] | str, filt: str = "item") -> dict:
    if isinstance(values, str):
        values = [values]
    return {"code": code, "selection": {"filter": filt, "values": values}}


def _table(d: dict) -> list[dict]:
    """Flater ut json-stat2 til en liste med {dimensjon: kode, ..., value}."""
    dims = d["id"]
    sizes = d["size"]
    cats = []
    for dim in dims:
        idx = d["dimension"][dim]["category"]["index"]
        codes = sorted(idx, key=idx.get) if isinstance(idx, dict) else idx
        cats.append(codes)
    rows = []
    values = d["value"]
    for n, v in enumerate(values):
        rem = n
        row = {}
        for i in range(len(dims) - 1, -1, -1):
            row[dims[i]] = cats[i][rem % sizes[i]]
            rem //= sizes[i]
        row["value"] = v
        rows.append(row)
    return rows


def rent_by_zone(zones: list[str]) -> dict:
    """Leiemarkedsundersøkelsen (09895): gj.snittlig månedsleie og årlig leie per m² per prissone og antall rom."""
    d = _post("09895", [
        _sel("Soner2", zones),
        _sel("AntRom", ["1", "2", "3", "4", "5+"]),
        _sel("ContentsCode", ["Husleie", "Husleiear"]),
        {"code": "Tid", "selection": {"filter": "top", "values": ["1"]}},
    ])
    out: dict = {}
    year = None
    for r in _table(d):
        year = r["Tid"]
        z = out.setdefault(r["Soner2"], {})
        rooms = z.setdefault(r["AntRom"], {})
        rooms["monthly" if r["ContentsCode"] == "Husleie" else "perSqmYear"] = r["value"]
    return {"year": year, "zones": out}


def price_index(regions: list[str], since: str = "2010K1") -> dict:
    """Prisindeks for brukte boliger (07221), alle boligtyper, kvartalsvis."""
    d = _post("07221", [
        _sel("Region", regions),
        _sel("Boligtype", "00"),
        _sel("ContentsCode", "Boligindeks"),
        {"code": "Tid", "selection": {"filter": "all", "values": ["*"]}},
    ])
    out: dict = {}
    for r in _table(d):
        if r["Tid"] >= since and r["value"] is not None:
            out.setdefault(r["Region"], []).append([r["Tid"], r["value"]])
    return out


def sqm_price_by_municipality(kommuner: list[str]) -> dict:
    """Gjennomsnittlig kvadratmeterpris for selveierboliger (06035), siste 10 år."""
    d = _post("06035", [
        _sel("Region", kommuner),
        _sel("Boligtype", ["01", "02", "03"]),
        _sel("ContentsCode", "KvPris"),
        {"code": "Tid", "selection": {"filter": "top", "values": ["10"]}},
    ])
    out: dict = {}
    for r in _table(d):
        if r["value"] is not None:
            out.setdefault(r["Region"], {}).setdefault(r["Boligtype"], []).append([r["Tid"], r["value"]])
    for k in out.values():
        for v in k.values():
            v.sort()
    return out


def mortgage_rate(since: str = "2015M01") -> list:
    """Rente på nye nedbetalingslån med pant i bolig, husholdninger, flytende rente (10748)."""
    d = _post("10748", [
        _sel("Utlanstype", "70"),
        _sel("Sektor", "04b"),
        _sel("Rentebinding", "08"),
        _sel("ContentsCode", "RenterNyeBolig"),
        {"code": "Tid", "selection": {"filter": "all", "values": ["*"]}},
    ])
    return [[r["Tid"], r["value"]] for r in _table(d) if r["Tid"] >= since and r["value"] is not None]


def policy_rate(since: str = "2015-01") -> list:
    """Styringsrenten, månedlig snitt, fra Norges Banks åpne API."""
    r = requests.get(
        "https://data.norges-bank.no/api/data/IR/M.KPRA.SD.R",
        params={"format": "sdmx-json", "startPeriod": since},
        timeout=60,
    )
    r.raise_for_status()
    d = r.json()["data"]
    periods = d["structure"]["dimensions"]["observation"][0]["values"]
    series = next(iter(d["dataSets"][0]["series"].values()))["observations"]
    return [[periods[int(i)]["id"], float(v[0])] for i, v in sorted(series.items(), key=lambda kv: int(kv[0]))]
