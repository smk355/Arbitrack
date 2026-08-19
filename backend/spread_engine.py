import time


def build_snapshot(instrument_map: dict, quotes_data: dict) -> list[dict]:
    """Joins NSE + BSE quotes per symbol into arbitrage spread rows,
    ranked by absolute spread % (biggest opportunity first).

    spread = nse_price - bse_price
    mid = (nse_price + bse_price) / 2
    spread_pct = spread / mid * 100, signed: positive means the stock
    is trading richer on NSE (sell NSE / buy BSE to capture it).
    """
    ts = int(time.time() * 1000)
    rows = []

    for symbol, keys in instrument_map.items():
        nse_quote = quotes_data.get(f"NSE_EQ:{symbol}")
        bse_quote = quotes_data.get(f"BSE_EQ:{symbol}")
        if not nse_quote or not bse_quote:
            continue

        nse_price = nse_quote.get("last_price")
        bse_price = bse_quote.get("last_price")
        if not nse_price or not bse_price:
            continue

        spread = nse_price - bse_price
        mid = (nse_price + bse_price) / 2
        spread_pct = (spread / mid) * 100

        rows.append({
            "symbol": symbol,
            "name": keys["name"],
            "nse_price": nse_price,
            "bse_price": bse_price,
            "spread": spread,
            "spread_pct": spread_pct,
            "ts": ts,
        })

    rows.sort(key=lambda r: abs(r["spread_pct"]), reverse=True)
    return rows
