// Pure helpers shared across components. (PinIcon lives in its own file,
// not here — mixing a JSX-returning component into a file of plain
// exports breaks Vite's react-refresh Fast Refresh boundary detection.)

// Intraday equity cost model for the net-profit calculator, matching real
// Zerodha/Upstox-style discount-broker charges (not simplified round
// numbers) — see calcLegCost below for how each applies.
export const BROKERAGE_CAP = 20; // ₹ flat cap per executed order
export const BROKERAGE_PCT = 0.03; // % of turnover — whichever is LOWER than the cap wins
export const STT_PCT = 0.025; // % of turnover, sell side only (intraday equity rate)
export const NSE_EXCHANGE_PCT = 0.00307; // % exchange transaction charge on NSE
export const BSE_EXCHANGE_PCT = 0.00375; // % exchange transaction charge on BSE
export const SEBI_PCT = 0.0001; // % of turnover, both legs
export const STAMP_DUTY_PCT = 0.003; // % of turnover, buy side only
export const GST_PCT = 18; // % GST — applied ONLY to (brokerage + exchange charge + SEBI
// charge), NOT to STT or stamp duty, since those are themselves government
// taxes rather than broker service fees.

export const SEARCH_RESULTS_LIMIT = 15;

export function formatINR(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function formatPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${Math.abs(n).toFixed(3)}%`;
}

// Share counts, not currency — no decimals (unlike formatINR).
export function formatQty(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN");
}

function calcLegCost(turnover, exchangePct, { isBuyLeg, isSellLeg }) {
  const brokerage = Math.min(BROKERAGE_CAP, turnover * (BROKERAGE_PCT / 100));
  const exchangeCharge = turnover * (exchangePct / 100);
  const sebiCharge = turnover * (SEBI_PCT / 100);
  const stt = isSellLeg ? turnover * (STT_PCT / 100) : 0;
  const stampDuty = isBuyLeg ? turnover * (STAMP_DUTY_PCT / 100) : 0;
  const gst = (brokerage + exchangeCharge + sebiCharge) * (GST_PCT / 100);
  return brokerage + exchangeCharge + sebiCharge + stt + stampDuty + gst;
}

// Sized from real order-book depth, not a typed amount — executableQty is
// the most shares actually tradeable right now, capped by whichever leg
// (buying from the cheaper exchange, selling into the pricier one) has
// less liquidity. executableQty === 0 means the row can render "—" instead
// of a number.
export function calcNetProfit(q) {
  const buyOnNse = q.nsePrice < q.bsePrice;
  const buyPrice = buyOnNse ? q.nsePrice : q.bsePrice;
  const sellPrice = buyOnNse ? q.bsePrice : q.nsePrice;

  // Direction-correct depth pair only — buying FROM the cheaper exchange
  // consumes ITS ask depth; selling TO the pricier exchange consumes ITS
  // bid depth. Never mix these up or compare the other two depth columns —
  // they aren't part of this row's actionable trade.
  const askQty = buyOnNse ? q.nseAskQty : q.bseAskQty;
  const bidQty = buyOnNse ? q.bseBidQty : q.nseBidQty;
  const executableQty = Math.min(askQty, bidQty);

  if (executableQty === 0) return null;

  const buyTurnover = executableQty * buyPrice;
  const sellTurnover = executableQty * sellPrice;
  const grossProfit = executableQty * (sellPrice - buyPrice);

  const buyExchangePct = buyOnNse ? NSE_EXCHANGE_PCT : BSE_EXCHANGE_PCT;
  const sellExchangePct = buyOnNse ? BSE_EXCHANGE_PCT : NSE_EXCHANGE_PCT;

  const buyCost = calcLegCost(buyTurnover, buyExchangePct, { isBuyLeg: true, isSellLeg: false });
  const sellCost = calcLegCost(sellTurnover, sellExchangePct, { isBuyLeg: false, isSellLeg: true });

  return grossProfit - buyCost - sellCost;
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
