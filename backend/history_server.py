import logging

from fastapi import APIRouter, HTTPException

import history_cache
from ws_server import instrument_map_store

logger = logging.getLogger("arbitrack")

router = APIRouter()


@router.get("/history/{symbol}")
def get_history(symbol: str):
    symbol = symbol.strip().upper()

    cache = history_cache.get_cached_history()
    symbol_data = cache.get(symbol) if cache else None

    if not symbol_data:
        # Not in the daily-built cache yet — e.g. added via /watchlist/add
        # after today's rebuild already ran. Fall back to a live fetch
        # rather than 404ing on an otherwise perfectly valid, tracked stock.
        entry = instrument_map_store.data.get(symbol)
        if not entry:
            raise HTTPException(status_code=404, detail=f"No history for '{symbol}'")

        try:
            symbol_data = history_cache.fetch_symbol_history_live(entry["nse_key"], entry["bse_key"])
        except Exception:
            logger.exception(f"live history fetch failed for '{symbol}'")
            raise HTTPException(status_code=502, detail=f"Failed to fetch history for '{symbol}' from Upstox")

        history_cache.add_symbol_to_cache(symbol, symbol_data)

    if not symbol_data.get("nse") and not symbol_data.get("bse"):
        raise HTTPException(status_code=404, detail=f"No historical data available for '{symbol}' yet")

    return {
        "symbol": symbol,
        "nse": symbol_data.get("nse", []),
        "bse": symbol_data.get("bse", []),
    }
