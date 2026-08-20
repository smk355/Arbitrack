import asyncio
import json
import logging
import os
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import config
import upstox_client
from ws_server import instrument_map_store

logger = logging.getLogger("arbitrack")

IST = ZoneInfo("Asia/Kolkata")
MARKET_CLOSE_HOUR_IST = 16

_REBUILD_CHECK_INTERVAL_SECONDS = 30 * 60

# Upstox's free tier allows 50 req/min (see config.py); poll_loop already
# spends ~20/min on live quotes, so pace the ~2 requests/symbol history
# build well under the remaining headroom rather than bursting through it.
_REQUEST_PACING_SECONDS = 2.5

_cache: dict | None = None


def _today_str() -> str:
    return datetime.now(IST).date().isoformat()


def _default_date_window() -> tuple[str, str]:
    to_date = date.today().isoformat()
    from_date = (date.today() - timedelta(days=365 * config.HISTORY_YEARS_BACK)).isoformat()
    return from_date, to_date


def _fetch_close_series(instrument_key: str, from_date: str, to_date: str) -> list:
    """Raises on failure — callers decide whether to absorb it (the batch
    build tolerates one bad symbol) or surface it (an on-demand single-
    symbol fetch should tell the caller it failed, not go silently empty)."""
    try:
        candles = upstox_client.fetch_historical_candles(
            instrument_key, config.HISTORY_CANDLE_INTERVAL, from_date, to_date
        )
    finally:
        time.sleep(_REQUEST_PACING_SECONDS)

    # Sort ascending (oldest first) regardless of the API's native order —
    # both our own range-slicing ("last N trading days") and
    # lightweight-charts on the frontend require ascending time order.
    # Store just [date, close] — OHLV isn't needed for a line chart.
    candles_sorted = sorted(candles, key=lambda row: row[0])
    return [[row[0][:10], row[4]] for row in candles_sorted]


def _safe_fetch_close_series(instrument_key: str, from_date: str, to_date: str) -> list:
    """Batch-build variant of _fetch_close_series: absorbs one instrument's
    failure so it doesn't take down the whole ~10-minute full-watchlist
    rebuild."""
    try:
        return _fetch_close_series(instrument_key, from_date, to_date)
    except Exception:
        logger.exception(f"failed to fetch historical candles for {instrument_key}")
        return []


def build_history_cache(instrument_map: dict) -> dict:
    """Fetches HISTORY_YEARS_BACK of daily candles for every symbol in
    instrument_map, on both exchanges, and writes the result to
    HISTORY_CACHE_FILE as one superset series per instrument.
    """
    from_date, to_date = _default_date_window()

    cache = {"cached_date": _today_str()}
    for symbol, keys in instrument_map.items():
        cache[symbol] = {
            "nse": _safe_fetch_close_series(keys["nse_key"], from_date, to_date),
            "bse": _safe_fetch_close_series(keys["bse_key"], from_date, to_date),
        }

    with open(config.HISTORY_CACHE_FILE, "w") as f:
        json.dump(cache, f)

    return cache


def fetch_symbol_history_live(nse_key: str, bse_key: str) -> dict:
    """On-demand fetch for a single symbol not yet in the cache — e.g. just
    added via /watchlist/add, before the next daily rebuild picks it up.
    Raises on failure (unlike the batch build, there's no larger job here
    to protect by swallowing it) so the caller can return a clear error."""
    from_date, to_date = _default_date_window()
    return {
        "nse": _fetch_close_series(nse_key, from_date, to_date),
        "bse": _fetch_close_series(bse_key, from_date, to_date),
    }


def add_symbol_to_cache(symbol: str, series: dict) -> None:
    """Merges a live-fetched symbol into the in-memory cache so a second
    lookup is instant. In-memory only — NOT written to disk (newly-added
    stocks are session-only until the next daily rebuild picks them up for
    real from the live instrument_map, per the earlier decision to treat
    them that way).

    Skips merging if no cache has ever been built yet (_cache is None):
    both history_cache_is_fresh and the cold-start branch of _should_rebuild
    key off _cache's identity/cached_date, so turning None into a dict here
    would look like "a real build already happened" and could block the
    real one from ever running today.
    """
    global _cache
    if _cache is None:
        return
    _cache[symbol] = series


def load_history_cache() -> dict | None:
    if not os.path.exists(config.HISTORY_CACHE_FILE):
        return None
    with open(config.HISTORY_CACHE_FILE) as f:
        return json.load(f)


def history_cache_is_fresh(cache: dict) -> bool:
    return bool(cache) and cache.get("cached_date") == _today_str()


def get_cached_history() -> dict | None:
    """Module-level cache, refreshed by history_cache_job — read via this
    function (not by importing the variable directly) so callers always
    see the current value rather than a stale reference from before the
    last rebuild reassigned it."""
    return _cache


def _should_rebuild(cache: dict | None) -> bool:
    if history_cache_is_fresh(cache):
        return False
    # No cache has ever been built (fresh install / deleted file) — build
    # right away so the feature isn't dead until market close. Once a cache
    # exists, only rebuild after close so we don't cache a partial candle
    # for today and then sit on it for the rest of the session.
    if cache is None:
        return True
    return datetime.now(IST).hour >= MARKET_CLOSE_HOUR_IST


async def history_cache_job():
    """Background loop, same shape as ws_server.poll_loop: wait for the
    live instrument map, then check-and-maybe-rebuild immediately (so a
    cold start doesn't wait out the first 30-minute sleep), then repeat
    every ~30 min. Reads instrument_map_store live (rather than a snapshot
    taken at startup) so symbols added later via /watchlist/add are picked
    up on the next natural rebuild.
    """
    global _cache

    _cache = load_history_cache()

    while instrument_map_store.is_empty():
        await asyncio.sleep(config.POLL_INTERVAL_SECONDS)

    while True:
        try:
            if _should_rebuild(_cache):
                logger.info("rebuilding history cache")
                _cache = await asyncio.to_thread(build_history_cache, instrument_map_store.data)
        except Exception:
            logger.exception("history_cache_job tick failed")
        await asyncio.sleep(_REBUILD_CHECK_INTERVAL_SECONDS)
