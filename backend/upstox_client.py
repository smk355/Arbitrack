import gzip
import json
import os

import httpx

import config
from auth import get_access_token


def _download_instruments(url: str) -> list[dict]:
    resp = httpx.get(url, timeout=30)
    resp.raise_for_status()
    return json.loads(gzip.decompress(resp.content))


def _join_by_isin(nse_records: list[dict], bse_records: list[dict]) -> dict:
    """trading_symbol -> {name, isin, nse_key, bse_key} for every NSE_EQ
    instrument that resolves to a same-ISIN BSE_EQ listing.

    NSE and BSE list the same company under the same ISIN, so a symbol's
    BSE listing is found by matching ISIN rather than trading_symbol (the
    two exchanges don't always use identical trading symbols).
    """
    bse_by_isin = {
        r["isin"]: r for r in bse_records if r.get("segment") == "BSE_EQ"
    }

    joined = {}
    for nse_rec in nse_records:
        if nse_rec.get("segment") != "NSE_EQ":
            continue
        bse_rec = bse_by_isin.get(nse_rec["isin"])
        if not bse_rec:
            continue
        joined[nse_rec["trading_symbol"]] = {
            "name": nse_rec["name"],
            "isin": nse_rec["isin"],
            "nse_key": nse_rec["instrument_key"],
            "bse_key": bse_rec["instrument_key"],
        }
    return joined


def build_instrument_map(force_refresh: bool = False) -> dict:
    """Maps each watchlist symbol to its NSE and BSE instrument_key.

    Result is cached to disk since the instrument master files are ~80k
    and ~26k records and don't change intraday. The cache also stores the
    watchlist it was built from, so editing WATCHLIST_SYMBOLS in config.py
    invalidates it automatically instead of silently serving a stale map.
    """
    watchlist = sorted(config.WATCHLIST_SYMBOLS)

    if not force_refresh and os.path.exists(config.INSTRUMENT_MAP_FILE):
        with open(config.INSTRUMENT_MAP_FILE) as f:
            cached = json.load(f)
        if cached.get("watchlist") == watchlist:
            return cached["instruments"]

    nse_records = _download_instruments(config.NSE_INSTRUMENTS_URL)
    bse_records = _download_instruments(config.BSE_INSTRUMENTS_URL)
    joined = _join_by_isin(nse_records, bse_records)

    instrument_map = {}
    unresolved = []
    for symbol in config.WATCHLIST_SYMBOLS:
        rec = joined.get(symbol)
        if not rec:
            unresolved.append(symbol)
            continue
        instrument_map[symbol] = {
            "name": rec["name"],
            "nse_key": rec["nse_key"],
            "bse_key": rec["bse_key"],
        }

    if unresolved:
        print(f"[instrument_map] could not resolve on both exchanges, skipping: {unresolved}")

    with open(config.INSTRUMENT_MAP_FILE, "w") as f:
        json.dump({"watchlist": watchlist, "instruments": instrument_map}, f, indent=2)

    return instrument_map


_all_instruments_cache: list[dict] | None = None


def get_searchable_instruments() -> list[dict]:
    """Flat list of every {symbol, name, isin, nse_key, bse_key} resolvable
    on both exchanges (same ISIN join as build_instrument_map), covering
    the full instrument universe rather than just WATCHLIST_SYMBOLS.

    Powers the search bar. Loaded once per process and cached both in
    memory and on disk, since the instrument master doesn't change
    intraday.
    """
    global _all_instruments_cache
    if _all_instruments_cache is not None:
        return _all_instruments_cache

    if os.path.exists(config.ALL_INSTRUMENTS_FILE):
        with open(config.ALL_INSTRUMENTS_FILE) as f:
            _all_instruments_cache = json.load(f)
        return _all_instruments_cache

    nse_records = _download_instruments(config.NSE_INSTRUMENTS_URL)
    bse_records = _download_instruments(config.BSE_INSTRUMENTS_URL)
    joined = _join_by_isin(nse_records, bse_records)

    _all_instruments_cache = [
        {"symbol": symbol, **rec} for symbol, rec in joined.items()
    ]

    with open(config.ALL_INSTRUMENTS_FILE, "w") as f:
        json.dump(_all_instruments_cache, f, indent=2)

    return _all_instruments_cache


def fetch_quotes(instrument_keys: list[str]) -> dict:
    """Returns the raw `data` dict from the market-quote/quotes endpoint,
    keyed by "EXCHANGE_SEGMENT:TRADING_SYMBOL" (e.g. "NSE_EQ:RELIANCE").

    Upstox caps this endpoint at 500 instrument_keys per call; our full
    watchlist (NSE + BSE) fits in one call so no batching is needed.
    """
    token = get_access_token()
    resp = httpx.get(
        config.UPSTOX_QUOTES_URL,
        params={"instrument_key": ",".join(instrument_keys)},
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("data", {})
