import { useEffect, useRef, useState } from "react";
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart } from "lightweight-charts";

const API_BASE = "http://localhost:8000";

// lightweight-charts renders to canvas, which can't resolve CSS var() refs —
// these are literal copies of index.css :root's --good/--bad/--surface/etc.
// and need to be kept in sync if those ever change.
const COLOR_GOOD = "#0ca30c"; // var(--good)
const COLOR_BAD = "#e5533d"; // var(--bad)
const COLOR_SURFACE = "#1a1a19"; // var(--surface)
const COLOR_GRID = "#2c2c2a"; // var(--grid)
const COLOR_INK_2 = "#c3c2b7"; // var(--ink-2)
const COLOR_BORDER = "rgba(255, 255, 255, 0.1)"; // var(--border)

const RANGES = [
  { key: "1m", label: "1M" },
  { key: "6m", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "5y", label: "5Y" },
];

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

// Range tabs are a client-side viewport preset over the full already-loaded
// series, not a data query — "5y" isn't computed here since it just means
// "everything," handled by fitContent() at the call site instead of a
// hardcoded 5-year window that would drift if HISTORY_YEARS_BACK changes.
function visibleWindowFor(rangeKey) {
  const to = new Date();
  const from = new Date(to);
  if (rangeKey === "6m") {
    from.setUTCMonth(from.getUTCMonth() - 6);
  } else if (rangeKey === "ytd") {
    from.setUTCMonth(0);
    from.setUTCDate(1);
  } else {
    from.setUTCMonth(from.getUTCMonth() - 1); // "1m" (also the fallback)
  }
  return { from: isoDate(from), to: isoDate(to) };
}

function sliceByWindow(series, { from, to }) {
  return series.filter(([date]) => date >= from && date <= to);
}

// series is [[dateStr, close], ...], ascending — color reflects that one
// series' own move over the currently-viewed window, independent of the
// other series and recomputed per range tab (not a fixed 5-year direction).
function seriesColor(series) {
  if (!series || series.length === 0) return COLOR_GOOD;
  const first = series[0][1];
  const last = series.at(-1)[1];
  return last >= first ? COLOR_GOOD : COLOR_BAD;
}

// param.time echoes back whatever shape the library normalizes business-day
// strings to internally — handle both the plain string and {year,month,day}
// forms rather than assuming one.
function formatCrosshairTime(time) {
  if (typeof time === "string") return time;
  if (time && typeof time === "object") {
    const { year, month, day } = time;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return "";
}

export default function HistoryPanel({ symbol, name, onClose }) {
  const [range, setRange] = useState("1m");
  // Tagged with the symbol it answers, same idea as the search dropdown's
  // remoteResults — lets loading/error/data be derived below instead of
  // reset with a synchronous setState at the top of the effect.
  const [result, setResult] = useState(null);

  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({ nse: null, bse: null });

  // Fetch the full series once per symbol — range tabs no longer trigger a
  // re-fetch, they just move the viewport over this same loaded data.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/history/${symbol}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "No history for this symbol yet" : "Failed to load history");
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setResult({ symbol, data: json, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ symbol, data: null, error: err.message || "Failed to load history" });
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const isCurrent = result && result.symbol === symbol;
  const data = isCurrent ? result.data : null;
  const error = isCurrent ? result.error : null;
  const loading = !isCurrent;

  // Chart instance lifecycle — one per symbol, not recreated on range change
  // (range change just moves the existing chart's viewport, below).
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: COLOR_SURFACE },
        textColor: COLOR_INK_2,
      },
      grid: {
        vertLines: { color: COLOR_GRID },
        horzLines: { color: COLOR_GRID },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: COLOR_BORDER },
      timeScale: { borderColor: COLOR_BORDER },
    });

    const nseSeries = chart.addSeries(LineSeries, { color: COLOR_GOOD, lineWidth: 2 });
    const bseSeries = chart.addSeries(LineSeries, {
      color: COLOR_GOOD,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
    });

    chartRef.current = chart;
    seriesRef.current = { nse: nseSeries, bse: bseSeries };

    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!param.point || !param.time) {
        tooltip.style.display = "none";
        return;
      }
      const nsePoint = param.seriesData.get(nseSeries);
      const bsePoint = param.seriesData.get(bseSeries);
      tooltip.style.display = "block";
      tooltip.style.left = `${param.point.x + 12}px`;
      tooltip.style.top = `${param.point.y + 12}px`;
      tooltip.textContent =
        formatCrosshairTime(param.time) +
        (nsePoint ? `  ·  NSE ₹${nsePoint.value.toFixed(2)}` : "") +
        (bsePoint ? `  ·  BSE ₹${bsePoint.value.toFixed(2)}` : "");
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = { nse: null, bse: null };
    };
  }, [symbol]);

  // Push the full fetched series into the series once — happens only when
  // new data arrives for this symbol, not on every range-tab click.
  useEffect(() => {
    if (!data || !chartRef.current) return;
    const { nse: nseSeries, bse: bseSeries } = seriesRef.current;
    if (!nseSeries || !bseSeries) return;

    nseSeries.setData(data.nse.map(([time, value]) => ({ time, value })));
    bseSeries.setData(data.bse.map(([time, value]) => ({ time, value })));
  }, [data]);

  // Range tabs move the viewport over the already-loaded full series (no
  // network round-trip) — recomputed whenever the tab changes or new data
  // arrives, so the default tab's window applies as soon as data loads.
  // Zooming/panning past this window is unrestricted since the full 5-year
  // series is already sitting in the chart.
  useEffect(() => {
    if (!data || !chartRef.current) return;
    const { nse: nseSeries, bse: bseSeries } = seriesRef.current;
    if (!nseSeries || !bseSeries) return;

    if (range === "5y") {
      chartRef.current.timeScale().fitContent();
      nseSeries.applyOptions({ color: seriesColor(data.nse) });
      bseSeries.applyOptions({ color: seriesColor(data.bse) });
      return;
    }

    const window = visibleWindowFor(range);
    chartRef.current.timeScale().setVisibleRange(window);
    nseSeries.applyOptions({ color: seriesColor(sliceByWindow(data.nse, window)) });
    bseSeries.applyOptions({ color: seriesColor(sliceByWindow(data.bse, window)) });
  }, [data, range]);

  return (
    <section className="history-panel">
      <div className="history-panel-header">
        <div>
          <div className="history-panel-symbol">{symbol}</div>
          <div className="history-panel-name">{name}</div>
        </div>
        <button type="button" className="history-panel-close" onClick={onClose} aria-label="Close history panel">
          ✕
        </button>
      </div>

      <div className="range-tabs">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`range-tab ${range === r.key ? "range-tab-active" : ""}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="history-chart-wrap">
        <div className="history-chart" ref={containerRef} />
        {(loading || error) && (
          <div className="history-chart-overlay">{loading ? "Loading…" : error}</div>
        )}
        <div className="history-tooltip" ref={tooltipRef} style={{ display: "none" }} />
      </div>
    </section>
  );
}
