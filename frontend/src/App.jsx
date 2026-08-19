import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { connect, subscribe, getSnapshot } from "./ws";

const SPREAD_GOOD_THRESHOLD_PCT = 0.5;

// Approximate intraday equity cost model for the net-profit calculator.
// These are simplified round numbers, not exact brokerage/STT/exchange
// regulatory figures — tune as needed.
const BUY_FEE_PCT = 0.15; // % of capitalUsed — brokerage/stamp duty on buy leg
const SELL_FEE_FLAT = 20; // ₹ flat brokerage on sell leg
const GST_PCT = 18; // % GST, applied on (buyFee + sellFee)

const API_BASE = "http://localhost:8000";
const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_RESULTS_LIMIT = 15;
const FLASH_DURATION_MS = 1000;
const PINNED_STORAGE_KEY = "arbitrack-pinned";

const SORT_ACCESSORS = {
  nse: (q) => q.nsePrice,
  bse: (q) => q.bsePrice,
  diff: (q) => Math.abs(q.spread),
  spreadPct: (q) => Math.abs(q.spreadPct),
};

function formatINR(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.abs(n).toFixed(3)}%`;
}

function handleHistoryClick(e) {
  e.stopPropagation();
}

// shares === 0 means the entered amount can't buy a single share — signal
// that to the caller with null so the row can render "—" instead of a number.
function calcNetProfit(nsePrice, bsePrice, amount) {
  const buyPrice = Math.min(nsePrice, bsePrice);
  const sellPrice = Math.max(nsePrice, bsePrice);
  const shares = Math.floor(amount / buyPrice);
  if (shares === 0) return null;

  const capitalUsed = shares * buyPrice;
  const grossProfit = shares * (sellPrice - buyPrice);
  const buyFee = capitalUsed * (BUY_FEE_PCT / 100);
  const sellFee = SELL_FEE_FLAT;
  const gst = (buyFee + sellFee) * (GST_PCT / 100);

  return grossProfit - buyFee - sellFee - gst;
}

function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.direction === "desc" ? "▼" : "▲") : "↕";
  return (
    <th className={`sortable ${className ?? ""} ${active ? "sort-active" : ""}`} onClick={() => onSort(sortKey)}>
      {label} <span className="sort-arrow">{arrow}</span>
    </th>
  );
}

// Instant fallback shown while the debounced /search-symbols request is in
// flight — same ranking rule as the backend (prefix > symbol substring >
// name substring), run against whatever's already tracked client-side.
function fuzzyMatchLocal(query, quotesObj) {
  const q = query.toLowerCase();
  const matches = [];
  for (const quote of Object.values(quotesObj)) {
    const symbolL = quote.symbol.toLowerCase();
    const nameL = (quote.name || "").toLowerCase();
    let rank;
    if (symbolL.startsWith(q)) rank = 0;
    else if (symbolL.includes(q)) rank = 1;
    else if (nameL.includes(q)) rank = 2;
    else continue;
    matches.push({ rank, symbol: quote.symbol, name: quote.name, tracked: true });
  }
  matches.sort((a, b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));
  return matches.slice(0, SEARCH_RESULTS_LIMIT);
}

function loadPinnedFromStorage() {
  try {
    const raw = localStorage.getItem(PINNED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function PinIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        d="M12 21s-7-7.09-7-12a7 7 0 1 1 14 0c0 4.91-7 12-7 12z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const { quotes, connected, demo } = useSyncExternalStore(subscribe, getSnapshot);
  const [sort, setSort] = useState({ key: null, direction: "desc" });
  const [amountInput, setAmountInput] = useState("");
  const [pinned, setPinned] = useState(loadPinnedFromStorage);
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState(null);
  const [searchDismissed, setSearchDismissed] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const [flashSymbol, setFlashSymbol] = useState(null);
  const searchWrapRef = useRef(null);
  const rowRefs = useRef({});

  useEffect(() => {
    connect();
  }, []);

  const enteredAmount = useMemo(() => {
    const n = Number(amountInput);
    return amountInput.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
  }, [amountInput]);

  // Reset the "user dismissed the dropdown" flag whenever the query itself
  // changes (typing again should reopen it) — adjusting state during render
  // per React's guidance, rather than an effect that would just mirror a
  // prop/state change back into more state.
  if (searchQuery !== lastSearchQuery) {
    setLastSearchQuery(searchQuery);
    setSearchDismissed(false);
  }
  const searchOpen = searchQuery.trim() !== "" && !searchDismissed;

  // Debounced backend search — supersedes the instant local fallback below
  // once it lands for the current query. Tagging results with the query
  // they answer (rather than resetting state on every keystroke) means the
  // effect only ever calls setState from the async fetch callback.
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/search-symbols?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          // Leave remoteResults untouched on failure so displayResults keeps
          // falling back to the local match instead of showing a false "no
          // results" — the backend being unreachable shouldn't blank a
          // perfectly good instant answer.
          if (Array.isArray(data)) setRemoteResults({ query, results: data });
        })
        .catch(() => {});
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    function handlePointerDown(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setSearchDismissed(true);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const localResults = useMemo(() => {
    const query = searchQuery.trim();
    return query ? fuzzyMatchLocal(query, quotes) : [];
  }, [searchQuery, quotes]);

  const trimmedQuery = searchQuery.trim();
  const displayResults =
    remoteResults && remoteResults.query === trimmedQuery ? remoteResults.results : localResults;

  function handleTrackedResultClick(symbol) {
    setSearchDismissed(true);
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
    setSearchQuery("");
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

      <section className="table-section">
        <div className="table-header">
          <h2>Ranked by spread</h2>

          <div className="search-bar-wrap" ref={searchWrapRef}>
            <input
              type="text"
              className="search-input"
              placeholder="Search & add a stock…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchDismissed(false)}
            />
            {searchOpen && (
              <div className="search-dropdown">
                {displayResults.length === 0 ? (
                  <div className="search-row search-empty">No results</div>
                ) : (
                  displayResults.map((r) => (
                    <div key={r.symbol} className="search-row">
                      {r.tracked ? (
                        <button
                          type="button"
                          className="search-row-main"
                          onClick={() => handleTrackedResultClick(r.symbol)}
                        >
                          <span className="search-symbol">{r.symbol}</span>
                          <span className="search-name">{r.name}</span>
                        </button>
                      ) : (
                        <>
                          <span className="search-row-main search-row-static">
                            <span className="search-symbol">{r.symbol}</span>
                            <span className="search-name">{r.name}</span>
                          </span>
                          <button
                            type="button"
                            className="search-add-btn"
                            onClick={() => handleAddSymbol(r.symbol)}
                          >
                            + Add
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

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

        {ranked.length === 0 ? (
          <div className="empty">Waiting for ticks…</div>
        ) : (
          <div className="table-scroll">
            <table className="quote-table">
              <thead>
                <tr>
                  <th className="col-rank">Sr No</th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <SortHeader label="NSE" sortKey="nse" sort={sort} onSort={handleSort} className="num" />
                  <SortHeader label="BSE" sortKey="bse" sort={sort} onSort={handleSort} className="num" />
                  <SortHeader label="Spread" sortKey="diff" sort={sort} onSort={handleSort} className="num" />
                  <SortHeader label="Spread %" sortKey="spreadPct" sort={sort} onSort={handleSort} className="num" />
                  {enteredAmount !== null && (
                    <th className="num">
                      <span className="net-profit-header">
                        Net Profit
                        <span className="info-icon" tabIndex={0}>
                          ⓘ
                          <span className="info-tooltip">
                            Net Profit = Gross Profit − Buy Fee − Sell Fee − GST
                            <br />
                            Gross Profit = shares × (sell price − buy price)
                            <br />
                            Buy Fee = {BUY_FEE_PCT}% × capital used
                            <br />
                            Sell Fee = ₹{SELL_FEE_FLAT} flat
                            <br />
                            GST = {GST_PCT}% × (Buy Fee + Sell Fee)
                            <br />
                            Shares = floor(amount ÷ buy price)
                          </span>
                        </span>
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {ranked.map((q, i) => {
                  const netProfit = enteredAmount !== null ? calcNetProfit(q.nsePrice, q.bsePrice, enteredAmount) : null;
                  const deemphasize = Math.abs(q.spreadPct) <= SPREAD_GOOD_THRESHOLD_PCT;
                  const isPinned = pinned.has(q.symbol);
                  const rowClassName = [isPinned && "row-pinned", flashSymbol === q.symbol && "row-flash"]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <tr
                      key={q.symbol}
                      ref={(el) => {
                        rowRefs.current[q.symbol] = el;
                      }}
                      className={rowClassName || undefined}
                    >
                      <td className="col-rank">
                        <span className="rank-cell">
                          <button
                            type="button"
                            className={`pin-btn ${isPinned ? "pin-btn-active" : ""}`}
                            onClick={() => togglePin(q.symbol)}
                            aria-label={isPinned ? "Unpin" : "Pin to top"}
                            title={isPinned ? "Unpin" : "Pin to top"}
                          >
                            <PinIcon filled={isPinned} />
                          </button>
                          {i + 1}
                        </span>
                      </td>
                      <td className="sym">{q.symbol}</td>
                      <td className="name-cell">
                        <span>{q.name}</span>
                        <button className="history-btn" onClick={handleHistoryClick}>
                          History
                        </button>
                      </td>
                      <td className="num">₹{formatINR(q.nsePrice)}</td>
                      <td className="num">₹{formatINR(q.bsePrice)}</td>
                      <td className={`num diff-val ${q.spread >= 0 ? "diff-pos" : "diff-neg"}`}>
                        ₹{formatINR(Math.abs(q.spread))}
                      </td>
                      <td className={`num spread-val ${Math.abs(q.spreadPct) > SPREAD_GOOD_THRESHOLD_PCT ? "spread-good" : ""}`}>
                        {formatPct(q.spreadPct)}
                      </td>
                      {enteredAmount !== null && (
                        <td
                          className={`num net-profit-val ${
                            netProfit === null ? "" : netProfit > 0 ? "net-profit-pos" : "net-profit-neg"
                          } ${deemphasize ? "net-profit-muted" : ""}`}
                        >
                          {netProfit === null ? "—" : `${netProfit < 0 ? "-" : "+"}₹${formatINR(Math.abs(netProfit))}`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
