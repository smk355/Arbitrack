// Data layer: connects to the backend WS, normalizes ticks, and keeps a
// small in-memory per-symbol history buffer (for a future history view).
// Exposes a plain pub/sub store consumable via useSyncExternalStore.
//
// Expected backend message shape (see ws_server.py / spread_engine.py):
//   either a bare array of quote objects, or { quotes: [...] } / { data: [...] }
//   each quote: { symbol, name, nse_price, bse_price, spread, spread_pct, ts }
//
// If no backend is reachable within DEMO_FALLBACK_DELAY_MS, falls back to a
// simulated tick generator so the UI is visible without the backend running.
// Real ticks always take over the moment a connection succeeds.

const WS_URL = "ws://localhost:8000/ws";
const HISTORY_LIMIT = 150;
const RECONNECT_DELAY_MS = 2000;
const DEMO_FALLBACK_DELAY_MS = 2500;
const DEMO_TICK_INTERVAL_MS = 700;

export const WATCHLIST_SYMBOLS = [
  "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AUBANK",
  "AXISBANK", "BAJAJ-AUTO", "BAJFINANCE", "BAJAJFINSV", "BEL",
  "BHARTIARTL", "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT",
  "ETERNAL", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
  "HINDALCO", "HINDUNILVR", "ICICIBANK", "IDFCFIRSTB", "INDIGO",
  "INFY", "ITC", "JIOFIN", "JSWSTEEL", "KOTAKBANK",
  "LT", "M&M", "MAHABANK", "MARUTI", "MAXHEALTH",
  "NESTLEIND", "NTPC", "ONGC", "POWERGRID", "RELIANCE",
  "SBILIFE", "SBIN", "SHRIRAMFIN", "SUNPHARMA", "TATACONSUM",
  "TATASTEEL", "TCS", "TECHM", "TITAN", "TMPV",
  "TRENT", "UJJIVANSFB", "ULTRACEMCO", "WIPRO",
];

let state = {
  quotes: {},
  history: {},
  connected: false,
  demo: false,
};

const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot() {
  return state;
}

function normalizeIncoming(raw) {
  const list = Array.isArray(raw) ? raw : raw.quotes || raw.data || [];
  return list.map((q) => ({
    symbol: q.symbol,
    name: q.name ?? q.symbol,
    nsePrice: Number(q.nse_price ?? q.nsePrice ?? 0),
    bsePrice: Number(q.bse_price ?? q.bsePrice ?? 0),
    spread: Number(q.spread ?? 0),
    spreadPct: Number(q.spread_pct ?? q.spreadPct ?? 0),
    nseBidQty: Number(q.nse_bid_qty ?? q.nseBidQty ?? 0),
    nseAskQty: Number(q.nse_ask_qty ?? q.nseAskQty ?? 0),
    bseBidQty: Number(q.bse_bid_qty ?? q.bseBidQty ?? 0),
    bseAskQty: Number(q.bse_ask_qty ?? q.bseAskQty ?? 0),
    ts: q.ts ?? Date.now(),
  }));
}

function applyBatch(list) {
  const nextQuotes = { ...state.quotes };
  const nextHistory = { ...state.history };
  for (const q of list) {
    if (!q.symbol) continue;
    nextQuotes[q.symbol] = q;
    const prev = nextHistory[q.symbol] || [];
    const point = { ts: q.ts, nsePrice: q.nsePrice, bsePrice: q.bsePrice, spreadPct: q.spreadPct };
    const arr = prev.length >= HISTORY_LIMIT ? [...prev.slice(1), point] : [...prev, point];
    nextHistory[q.symbol] = arr;
  }
  setState({ quotes: nextQuotes, history: nextHistory });
}

let socket = null;
let demoTimer = null;
let demoStartTimer = null;
let reconnectTimer = null;
let started = false;

export function connect() {
  if (started) return;
  started = true;
  openSocket();
  demoStartTimer = setTimeout(() => {
    if (!state.connected) startDemo();
  }, DEMO_FALLBACK_DELAY_MS);
}

function openSocket() {
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }
  socket.onopen = () => {
    stopDemo();
    setState({ connected: true, demo: false });
  };
  socket.onmessage = (event) => {
    try {
      applyBatch(normalizeIncoming(JSON.parse(event.data)));
    } catch {
      // ignore malformed frame
    }
  };
  socket.onclose = () => {
    socket = null;
    setState({ connected: false });
    scheduleReconnect();
  };
  socket.onerror = () => {
    socket?.close();
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(openSocket, RECONNECT_DELAY_MS);
}

// ---- Demo mode: a simulated feed, used only until a real backend answers ----

function startDemo() {
  if (demoTimer) return;
  setState({ demo: true });
  const bases = {};
  for (const symbol of WATCHLIST_SYMBOLS) {
    bases[symbol] = 50 + Math.random() * 4000;
  }
  demoTimer = setInterval(() => {
    const tickCount = 6 + Math.floor(Math.random() * 10);
    const batch = [];
    for (let i = 0; i < tickCount; i++) {
      const symbol = WATCHLIST_SYMBOLS[Math.floor(Math.random() * WATCHLIST_SYMBOLS.length)];
      bases[symbol] *= 1 + (Math.random() - 0.5) * 0.004;
      const nsePrice = bases[symbol];
      const spreadPct = (Math.random() - 0.5) * 1.2;
      const bsePrice = nsePrice / (1 + spreadPct / 100);
      batch.push({
        symbol,
        name: symbol,
        nsePrice,
        bsePrice,
        spread: nsePrice - bsePrice,
        spreadPct,
        ts: Date.now(),
      });
    }
    applyBatch(batch);
  }, DEMO_TICK_INTERVAL_MS);
}

function stopDemo() {
  clearTimeout(demoStartTimer);
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = null;
  }
  setState({ demo: false });
}
