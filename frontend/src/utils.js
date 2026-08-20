// Pure helpers shared across components. (PinIcon lives in its own file,
// not here — mixing a JSX-returning component into a file of plain
// exports breaks Vite's react-refresh Fast Refresh boundary detection.)

// Approximate intraday equity cost model for the net-profit calculator.
// These are simplified round numbers, not exact brokerage/STT/exchange
// regulatory figures — tune as needed.
export const BUY_FEE_PCT = 0.15; // % of capitalUsed — brokerage/stamp duty on buy leg
export const SELL_FEE_FLAT = 20; // ₹ flat brokerage on sell leg
export const GST_PCT = 18; // % GST, applied on (buyFee + sellFee)

export const SEARCH_RESULTS_LIMIT = 15;

export function formatINR(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function formatPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.abs(n).toFixed(3)}%`;
}

// shares === 0 means the entered amount can't buy a single share — signal
// that to the caller with null so the row can render "—" instead of a number.
export function calcNetProfit(nsePrice, bsePrice, amount) {
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

// Instant fallback shown while the debounced /search-symbols request is in
// flight — same ranking rule as the backend (prefix > symbol substring >
// name substring), run against whatever's already tracked client-side.
export function fuzzyMatchLocal(query, quotesObj) {
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
