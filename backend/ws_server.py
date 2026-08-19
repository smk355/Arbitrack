import asyncio
import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

import config
import spread_engine
import upstox_client
from state import manager

logger = logging.getLogger("arbitrack")

router = APIRouter()

SEARCH_RESULTS_LIMIT = 15


class InstrumentMapStore:
    """Holds the live symbol -> {name, nse_key, bse_key} map as a single
    object that's mutated in place, so poll_loop and the REST endpoints
    always see the same state without any module-global reassignment
    (rebinding `instrument_map = ...` would leave anything that imported
    the old dict by reference pointing at a stale copy)."""

    def __init__(self):
        self.data: dict = {}

    def is_empty(self) -> bool:
        return not self.data

    def replace(self, new_map: dict):
        self.data = new_map

    def add(self, symbol: str, entry: dict):
        self.data[symbol] = entry

    def all_keys(self) -> list[str]:
        return [
            key
            for entry in self.data.values()
            for key in (entry["nse_key"], entry["bse_key"])
        ]


instrument_map_store = InstrumentMapStore()


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Client doesn't send anything; just keep the connection open
            # and detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/search-symbols")
def search_symbols(q: str = ""):
    query = q.strip().lower()
    if not query:
        return []

    ranked = []
    for inst in upstox_client.get_searchable_instruments():
        symbol_l = inst["symbol"].lower()
        name_l = inst["name"].lower()
        if symbol_l.startswith(query):
            rank = 0
        elif query in symbol_l:
            rank = 1
        elif query in name_l:
            rank = 2
        else:
            continue
        ranked.append((rank, inst))

    ranked.sort(key=lambda pair: (pair[0], pair[1]["symbol"]))

    return [
        {
            "symbol": inst["symbol"],
            "name": inst["name"],
            "tracked": inst["symbol"] in instrument_map_store.data,
        }
        for _, inst in ranked[:SEARCH_RESULTS_LIMIT]
    ]


class WatchlistAddRequest(BaseModel):
    symbol: str


@router.post("/watchlist/add")
def add_to_watchlist(body: WatchlistAddRequest):
    symbol = body.symbol.strip().upper()
    match = next(
        (inst for inst in upstox_client.get_searchable_instruments() if inst["symbol"] == symbol),
        None,
    )
    if not match:
        raise HTTPException(status_code=404, detail=f"Symbol '{symbol}' not found in instrument universe")

    entry = {
        "name": match["name"],
        "nse_key": match["nse_key"],
        "bse_key": match["bse_key"],
    }
    instrument_map_store.add(symbol, entry)
    return {"symbol": symbol, **entry}


async def poll_loop():
    while instrument_map_store.is_empty():
        try:
            instrument_map_store.replace(upstox_client.build_instrument_map())
        except Exception:
            logger.exception("failed to build instrument map, retrying")
            await asyncio.sleep(config.POLL_INTERVAL_SECONDS)

    while True:
        try:
            # Re-read every tick (cheap — it's just a dict) since
            # /watchlist/add can mutate instrument_map_store between ticks.
            all_keys = instrument_map_store.all_keys()
            quotes_data = upstox_client.fetch_quotes(all_keys)
            snapshot = spread_engine.build_snapshot(instrument_map_store.data, quotes_data)
            await manager.broadcast(snapshot)
        except Exception:
            logger.exception("poll_loop tick failed")
        await asyncio.sleep(config.POLL_INTERVAL_SECONDS)
