from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()
        self.latest_snapshot: list[dict] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)
        if self.latest_snapshot:
            await ws.send_json({"quotes": self.latest_snapshot})

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)

    async def broadcast(self, snapshot: list[dict]):
        self.latest_snapshot = snapshot
        dead = set()
        for ws in self.active:
            try:
                await ws.send_json({"quotes": snapshot})
            except Exception:
                dead.add(ws)
        self.active -= dead


manager = ConnectionManager()
