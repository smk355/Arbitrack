import { BUY_FEE_PCT, SELL_FEE_FLAT, GST_PCT, calcNetProfit, formatINR, formatPct } from "./utils";
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
  enteredAmount,
  pinned,
  onTogglePin,
  flashSymbol,
  rowRefs,
  onHistoryClick,
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
            <SortHeader label="BSE" sortKey="bse" sort={sort} onSort={onSort} className="num" />
            <SortHeader label="Spread" sortKey="diff" sort={sort} onSort={onSort} className="num" />
            <SortHeader label="Spread %" sortKey="spreadPct" sort={sort} onSort={onSort} className="num" />
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
  );
}
