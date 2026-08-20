from datetime import date

from fastapi import APIRouter, HTTPException

import history_cache

router = APIRouter()

TRADING_DAYS_1M = 22
TRADING_DAYS_6M = 130


def _slice_range(series: list, range_key: str) -> list:
    if range_key == "1m":
        return series[-TRADING_DAYS_1M:]
    if range_key == "6m":
        return series[-TRADING_DAYS_6M:]
    if range_key == "ytd":
        jan_1 = date.today().replace(month=1, day=1).isoformat()
        return [point for point in series if point[0] >= jan_1]
    return series  # "5y" (and anything unrecognized) -> full series


@router.get("/history/{symbol}")
def get_history(symbol: str, range: str = "1m"):
    cache = history_cache.get_cached_history()
    if not cache:
        raise HTTPException(status_code=404, detail="History cache not built yet")

    symbol = symbol.strip().upper()
    symbol_data = cache.get(symbol)
    if not symbol_data:
        raise HTTPException(status_code=404, detail=f"No history for '{symbol}'")

    return {
        "symbol": symbol,
        "range": range,
        "nse": _slice_range(symbol_data.get("nse", []), range),
        "bse": _slice_range(symbol_data.get("bse", []), range),
    }
