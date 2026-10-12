"""Henter boligannonser fra Finn.no.

Finn har ingen gratis offisiell API. Sidene inneholder data i React Router sitt
«turbo-stream»-format, som vi dekoder her. Kun til privat bruk: forespørslene er
få, går med pauser imellom og kjøres maks to ganger i døgnet.
"""
from __future__ import annotations

import json
import random
import re
import time

import requests

BASE = "https://www.finn.no"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,en;q=0.5",
}
MAX_PAGE = 50  # Finn viser maks 50 sider à 50 annonser per søk

_session = requests.Session()
_session.headers.update(HEADERS)
_STREAM_RE = re.compile(r'streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)', re.S)


class Blocked(Exception):
    pass


def polite_sleep(base: float) -> None:
    time.sleep(base + random.uniform(0, base * 0.6))


def get_html(url: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            r = _session.get(url, timeout=30)
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
            continue
        if r.status_code == 200:
            r.encoding = "utf-8"
            return r.text
        if r.status_code in (403, 429):
            # Finn/DataDome vil at vi tar det med ro
            if attempt == retries - 1:
                raise Blocked(f"{r.status_code} for {url}")
            time.sleep(30 * (attempt + 1))
            continue
        if r.status_code == 404:
            return ""
        time.sleep(5 * (attempt + 1))
    return ""


def decode_stream(html: str):
    """Dekoder React Router turbo-stream (flat liste med referanser) til vanlige objekter."""
    chunks = _STREAM_RE.findall(html)
    if not chunks:
        return None
    raw = "".join(json.loads(c) for c in chunks)
    arr = json.loads(raw.split("\n")[0])
    memo: dict[int, object] = {}

    def dec(i):
        if not isinstance(i, int) or i < 0:
            return None
        if i in memo:
            return memo[i]
        v = arr[i]
        if isinstance(v, dict):
            o: dict = {}
            memo[i] = o
            for k, vi in v.items():
                o[dec(int(k[1:]))] = dec(vi)
            return o
        if isinstance(v, list):
            if v and isinstance(v[0], str):  # spesialtyper (dato, promise ...)
                memo[i] = None
                return None
            lst: list = []
            memo[i] = lst
            lst.extend(dec(x) for x in v)
            return lst
        memo[i] = v
        return v

    return dec(0)


def _search_results(root) -> dict | None:
    try:
        return root["loaderData"]["routes/realestate/search/search"]["results"]
    except (KeyError, TypeError):
        return None


def search_page(kind: str, location: str, page: int) -> dict | None:
    """kind = 'homes' (til salgs) eller 'lettings' (til leie)."""
    url = f"{BASE}/realestate/{kind}/search.html?location={location}&page={page}&sort=PUBLISHED_DESC"
    html = get_html(url)
    if not html:
        return None
    return _search_results(decode_stream(html))


def sub_locations(results: dict, location: str) -> list[tuple[str, str, int]]:
    """Underområder (bydeler/kommuner) for et område, fra filtertreet i søkeresultatet."""
    for f in results.get("filters") or []:
        if f.get("name") != "location":
            continue

        def walk(items):
            for it in items or []:
                if it.get("value") == location:
                    return [(c["value"], c["display_name"], c.get("hits") or 0) for c in it.get("filter_items") or []]
                found = walk(it.get("filter_items"))
                if found:
                    return found
            return None

        return walk(f.get("filter_items")) or []
    return []


def search_all(kind: str, location: str, label: str, delay: float, log=print) -> list[dict]:
    """Alle annonser i et område. Deler opp i underområder når søket har flere enn 50 sider."""
    first = search_page(kind, location, 1)
    if not first:
        log(f"  ! ingen resultater for {label} ({location})")
        return []
    paging = first["metadata"].get("paging") or {}
    last = int(paging.get("last") or 1)
    if last >= MAX_PAGE:
        subs = sub_locations(first, location)
        if subs:
            log(f"  {label}: {last}+ sider, deler i {len(subs)} underområder")
            out = []
            for value, name, hits in subs:
                if hits:
                    polite_sleep(delay)
                    out += search_all(kind, value, name, delay, log)
            return out
    docs = list(first.get("docs") or [])
    for p in range(2, min(last, MAX_PAGE) + 1):
        polite_sleep(delay)
        res = search_page(kind, location, p)
        if not res:
            break
        docs += res.get("docs") or []
    log(f"  {label}: {len(docs)} annonser ({last} sider)")
    return docs


def ad_details(finnkode: str) -> dict | None:
    html = get_html(f"{BASE}/realestate/homes/ad.html?finnkode={finnkode}")
    if not html:
        return None
    root = decode_stream(html)
    try:
        return root["loaderData"]["routes/realestate/item/homes-ad"]["objectData"]["ad"]
    except (KeyError, TypeError):
        return None
