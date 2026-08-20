import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from history_cache import history_cache_job
from history_server import router as history_router
from ws_server import poll_loop, router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    poll_task = asyncio.create_task(poll_loop())
    history_task = asyncio.create_task(history_cache_job())
    yield
    poll_task.cancel()
    history_task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)
app.include_router(history_router)


@app.get("/")
def home():
    return {"message": "Backend is running"}
