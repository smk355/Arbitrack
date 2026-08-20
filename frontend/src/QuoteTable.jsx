import {
  BROKERAGE_CAP,
  BROKERAGE_PCT,
  GST_PCT,
  STAMP_DUTY_PCT,
  STT_PCT,
  calcNetProfit,
  formatINR,
  formatPct,
  formatQty,
} from "./utils";
import PinIcon from "./PinIcon";

const SPREAD_GOOD_THRESHOLD_PCT = 0.5;

function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.direction === "desc" ? "▼" : "▲") : "↕";
  return (
    <th className={`sortable ${className ?? ""} ${active ? "sort-active" : ""}`} onClick={() => onSort(sortKey)}>
      {label} <span className="sort-arrow">{arrow}</span>
    </th>
  );
}

export default function QuoteTable({
  ranked,
  sort,
  onSort,
  pinned,
  onTogglePin,
  flashSymbol,
  rowRefs,
  onHistoryClick,
  selectedHistorySymbol,
}) {
  if (ranked.length === 0) {
    return <div className="empty">Waiting for ticks…</div>;
  }

  return (
    <div className="table-scroll">
      <table className="quote-table">
        <thead>
          <tr>
            <th className="col-rank">Sr No</th>
            <th>Symbol</th>
            <th>Name</th>
            <SortHeader label="NSE" sortKey="nse" sort={sort} onSort={onSort} className="num" />
            <th className="num">NSE Bid Qty</th>
            <th className="num">NSE Ask Qty</th>
            <SortHeader label="BSE" sortKey="bse" sort={sort} onSort={onSort} className="num" />
            <th className="num">BSE Bid Qty</th>
            <th className="num">BSE Ask Qty</th>
            <SortHeader label="Spread" sortKey="diff" sort={sort} onSort={onSort} className="num" />
            <SortHeader label="Spread %" sortKey="spreadPct" sort={sort} onSort={onSort} className="num" />
            <th className="num">
              <span className="net-profit-header">
                Net Profit
                <span className="info-icon" tabIndex={0}>
                  ⓘ
                  <span className="info-tooltip">
                    Net Profit = Gross Profit − Buy Leg Costs − Sell Leg Costs, where tradeable
                    quantity = min(Ask Qty on the cheaper exchange, Bid Qty on the pricier
                    exchange).
                    <br />
                    Costs include brokerage (min ₹{BROKERAGE_CAP} or {BROKERAGE_PCT}% per order),
                    STT ({STT_PCT}%, sell side only), exchange charges, SEBI charges, stamp duty (
                    {STAMP_DUTY_PCT}%, buy side only), and {GST_PCT}% GST on brokerage + exchange +
                    SEBI charges only.
                  </span>
                </span>
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((q, i) => {
            const netProfit = calcNetProfit(q);
            const deemphasize = Math.abs(q.spreadPct) <= SPREAD_GOOD_THRESHOLD_PCT;
            const isPinned = pinned.has(q.symbol);
            const isViewingHistory = q.symbol === selectedHistorySymbol;
            // Cheaper exchange is where you'd buy (consuming its Ask Qty);
            // the other exchange is where you'd sell into (consuming its
            // Bid Qty) to capture the spread — those two are the
            // actionable numbers for this row's current arb direction.
            const buyOnNse = q.nsePrice < q.bsePrice;
            const buyOnBse = q.bsePrice < q.nsePrice;
            const rowClassName = [
              isPinned && "row-pinned",
              flashSymbol === q.symbol && "row-flash",
              isViewingHistory && "row-history-viewing",
            ]
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
                      onClick={() => onTogglePin(q.symbol)}
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
                  <button
                    className="history-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHistoryClick(q.symbol);
                    }}
                  >
                    History
                  </button>
                </td>
                <td className="num">₹{formatINR(q.nsePrice)}</td>
                <td className={`num${buyOnBse ? " depth-actionable" : ""}`}>{formatQty(q.nseBidQty)}</td>
                <td className={`num${buyOnNse ? " depth-actionable" : ""}`}>{formatQty(q.nseAskQty)}</td>
                <td className="num">₹{formatINR(q.bsePrice)}</td>
                <td className={`num${buyOnNse ? " depth-actionable" : ""}`}>{formatQty(q.bseBidQty)}</td>
                <td className={`num${buyOnBse ? " depth-actionable" : ""}`}>{formatQty(q.bseAskQty)}</td>
                <td className={`num diff-val ${q.spread >= 0 ? "diff-pos" : "diff-neg"}`}>
                  ₹{formatINR(Math.abs(q.spread))}
                </td>
                <td className={`num spread-val ${Math.abs(q.spreadPct) > SPREAD_GOOD_THRESHOLD_PCT ? "spread-good" : ""}`}>
                  {formatPct(q.spreadPct)}
                </td>
                <td
                  className={`num net-profit-val ${
                    netProfit === null ? "" : netProfit > 0 ? "net-profit-pos" : "net-profit-neg"
                  } ${deemphasize ? "net-profit-muted" : ""}`}
                >
                  {netProfit === null ? "—" : `${netProfit < 0 ? "-" : "+"}₹${formatINR(Math.abs(netProfit))}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
