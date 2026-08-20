import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { connect, subscribe, getSnapshot } from "./ws";
import SearchBar from "./SearchBar";
import QuoteTable from "./QuoteTable";
import HistoryPanel from "./HistoryPanel";

const API_BASE = "http://localhost:8000";
const FLASH_DURATION_MS = 1000;
const PINNED_STORAGE_KEY = "arbitrack-pinned";

const SORT_ACCESSORS = {
  nse: (q) => q.nsePrice,
  bse: (q) => q.bsePrice,
  diff: (q) => Math.abs(q.spread),
  spreadPct: (q) => Math.abs(q.spreadPct),
};

function loadPinnedFromStorage() {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export default function App() {
  const { quotes, connected, demo } = useSyncExternalStore(subscribe, getSnapshot);
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const [amountInput, setAmountInput] = useState("");
  const [pinned, setPinned] = useState(loadPinnedFromStorage);
  const [flashSymbol, setFlashSymbol] = useState(null);
  const [selectedHistorySymbol, setSelectedHistorySymbol] = useState(null);
  const rowRefs = useRef({});

  useEffect(() => {
    connect();
  }, []);

  const enteredAmount = useMemo(() => {
    const n = Number(amountInput);
    return amountInput.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
  }, [amountInput]);

  function handleTrackedResultClick(symbol) {
    const node = rowRefs.current[symbol];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setFlashSymbol(symbol);
    window.setTimeout(() => {
      setFlashSymbol((cur) => (cur === symbol ? null : cur));
    }, FLASH_DURATION_MS);
  }

  async function handleAddSymbol(symbol) {
    try {
      await fetch(`${API_BASE}/watchlist/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
    } catch {
      // best effort — if this fails the stock just won't show up in the table
    }
  }

  function togglePin(symbol) {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      try {
        localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // localStorage unavailable (e.g. private mode) — pin still works in-session
      }
      return next;
    });
  }

  function handleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "desc" };
      return { key, direction: prev.direction === "desc" ? "asc" : "desc" };
    });
  }

  const ranked = useMemo(() => {
    const list = Object.values(quotes);
    let sorted;
    if (!sort.key) {
      sorted = list.sort((a, b) => Math.abs(b.spreadPct) - Math.abs(a.spreadPct));
    } else {
      const getValue = SORT_ACCESSORS[sort.key];
      const dir = sort.direction === "asc" ? 1 : -1;
      sorted = list.sort((a, b) => (getValue(a) - getValue(b)) * dir);
    }
    // Stable sort, so this only reorders pinned-vs-unpinned and leaves each
    // group's relative order (from the sort pass above) untouched.
    return sorted.sort((a, b) => (pinned.has(b.symbol) ? 1 : 0) - (pinned.has(a.symbol) ? 1 : 0));
  }, [quotes, sort, pinned]);

  const statusLabel = connected ? "LIVE" : demo ? "DEMO DATA" : "CONNECTING…";
  const statusClass = connected ? "status-live" : demo ? "status-demo" : "status-connecting";

  return (
    <div className="app">
      <section className="hero">
        <div className={`status ${statusClass}`}>
          <span className="dot" />
          {statusLabel}
        </div>
        <h1 className="brand">ARBITRACK</h1>
        <p className="tagline">
          Real-time arbitrage tracker for India's dual-listed stocks. We watch NSE and BSE
          prices side by side, every few seconds, and rank every stock by how far its price
          has drifted apart between the two exchanges.
        </p>
        <div className="scroll-cue">↓ live spreads below</div>
      </section>

      <div className={`content-row ${selectedHistorySymbol ? "history-open" : ""}`}>
        <section className="table-section">
          <div className="table-header">
            <h2>Ranked by spread</h2>

            <SearchBar quotes={quotes} onTrackedClick={handleTrackedResultClick} onAddSymbol={handleAddSymbol} />

            <div className="table-header-right">
              <input
                type="number"
                className="amount-input"
                placeholder="Enter amt for profit calc"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              <span className="muted">{ranked.length} stocks tracked</span>
            </div>
          </div>

          <QuoteTable
            ranked={ranked}
            sort={sort}
            onSort={handleSort}
            enteredAmount={enteredAmount}
            pinned={pinned}
            onTogglePin={togglePin}
            flashSymbol={flashSymbol}
            rowRefs={rowRefs}
            onHistoryClick={setSelectedHistorySymbol}
          />
        </section>

        {selectedHistorySymbol && (
          <HistoryPanel
            symbol={selectedHistorySymbol}
            name={quotes[selectedHistorySymbol]?.name ?? selectedHistorySymbol}
            onClose={() => setSelectedHistorySymbol(null)}
          />
        )}
      </div>
    </div>
  );
}
