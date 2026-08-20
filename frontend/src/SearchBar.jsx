import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyMatchLocal } from "./utils";

const API_BASE = "http://localhost:8000";
const SEARCH_DEBOUNCE_MS = 250;

export default function SearchBar({ quotes, onTrackedClick, onAddSymbol }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState(null);
  const [searchDismissed, setSearchDismissed] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const searchWrapRef = useRef(null);

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
    onTrackedClick(symbol);
  }

  async function handleAddSymbol(symbol) {
    await onAddSymbol(symbol);
    setSearchQuery("");
  }

  return (
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
  );
}
