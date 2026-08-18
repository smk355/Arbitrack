import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { connect, subscribe, getSnapshot } from "./ws";

const SPARK_COLOR = "#3987e5";

function formatINR(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function formatPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(3)}%`;
}

function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function Sparkline({ points, color = SPARK_COLOR, formatValue }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const width = 320;
  const height = 72;
  const padding = 6;

  if (points.length < 2) {
    return <div className="spark-empty">Waiting for more ticks…</div>;
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = padding + (i / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p.value - min) / span) * (height - padding * 2);
    return [x, y];
  });

  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let best = Infinity;
    coords.forEach(([x], i) => {
      const d = Math.abs(x - relX);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  const hover = hoverIdx != null ? { point: points[hoverIdx], coord: coords[hoverIdx] } : null;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" fill={color} />
      {hover && (
        <>
          <line x1={hover.coord[0]} x2={hover.coord[0]} y1={padding} y2={height - padding} stroke="#383835" strokeWidth="1" />
          <circle cx={hover.coord[0]} cy={hover.coord[1]} r="4" fill={color} stroke="#0d0d0d" strokeWidth="1.5" />
          <foreignObject x={Math.min(Math.max(hover.coord[0] - 40, 0), width - 80)} y={0} width="80" height="18">
            <div className="spark-tooltip">{formatValue(hover.point.value)}</div>
          </foreignObject>
        </>
      )}
    </svg>
  );
}

export default function App() {
  const { quotes, history, connected, demo } = useSyncExternalStore(subscribe, getSnapshot);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    connect();
  }, []);

  const ranked = useMemo(
    () => Object.values(quotes).sort((a, b) => b.spreadPct - a.spreadPct),
    [quotes],
  );

  const maxSpread = ranked.length ? ranked[0].spreadPct || 1 : 1;
  const selectedQuote = selected ? quotes[selected] : null;
  const selectedHistory = selected ? history[selected] || [] : [];

  const statusLabel = connected ? "LIVE" : demo ? "DEMO DATA — backend not connected" : "CONNECTING…";
  const statusClass = connected ? "status-live" : demo ? "status-demo" : "status-connecting";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">ARBITRACK</div>
        <div className={`status ${statusClass}`}>
          <span className="dot" />
          {statusLabel}
        </div>
      </header>

      <div className="layout">
        <main className="table-wrap">
          {ranked.length === 0 ? (
            <div className="empty">Waiting for ticks…</div>
          ) : (
            <table className="quote-table">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th>Symbol</th>
                  <th>Exch</th>
                  <th className="num">LTP</th>
                  <th className="num">Bid</th>
                  <th className="num">Ask</th>
                  <th className="num">Spread %</th>
                  <th className="col-bar" />
                </tr>
              </thead>
              <tbody>
                {ranked.map((q, i) => (
                  <tr
                    key={q.symbol}
                    className={q.symbol === selected ? "selected" : ""}
                    onClick={() => setSelected(q.symbol)}
                  >
                    <td className="col-rank">{i + 1}</td>
                    <td className="sym">{q.symbol}</td>
                    <td className="muted">{q.exchange}</td>
                    <td className="num">{formatINR(q.ltp)}</td>
                    <td className="num">{formatINR(q.bid)}</td>
                    <td className="num">{formatINR(q.ask)}</td>
                    <td className="num spread-val">{formatPct(q.spreadPct)}</td>
                    <td className="col-bar">
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{ width: `${Math.min(100, (q.spreadPct / maxSpread) * 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </main>

        {selectedQuote && (
          <aside className="detail">
            <div className="detail-head">
              <div>
                <div className="detail-symbol">{selectedQuote.symbol}</div>
                <div className="muted">{selectedQuote.exchange}</div>
              </div>
              <button className="close-btn" onClick={() => setSelected(null)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="detail-hero">
              <div className="hero-value">{formatPct(selectedQuote.spreadPct)}</div>
              <div className="muted">current spread</div>
            </div>

            <div className="stat-row">
              <div className="stat">
                <div className="stat-label">LTP</div>
                <div className="stat-value">₹{formatINR(selectedQuote.ltp)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Bid</div>
                <div className="stat-value">₹{formatINR(selectedQuote.bid)}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Ask</div>
                <div className="stat-value">₹{formatINR(selectedQuote.ask)}</div>
              </div>
            </div>

            <div className="chart-block">
              <div className="chart-label">Price history (session)</div>
              <Sparkline
                points={selectedHistory.map((h) => ({ value: h.ltp }))}
                formatValue={(v) => `₹${formatINR(v)}`}
              />
            </div>

            <div className="chart-block">
              <div className="chart-label">Spread % history (session)</div>
              <Sparkline
                points={selectedHistory.map((h) => ({ value: h.spreadPct }))}
                formatValue={(v) => formatPct(v)}
              />
            </div>

            <div className="muted small">Last tick {timeAgo(selectedQuote.ts)}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
