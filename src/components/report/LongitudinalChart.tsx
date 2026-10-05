import { useMemo } from "react";
import type { LongitudinalRead } from "@/lib/longitudinal";
import { MIN_SESSIONS_FOR_BASELINE, fitLine, formatSigned } from "@/lib/longitudinal";

/**
 * The baseline-and-deviation chart from the "longitudinal signal tracking"
 * explainer, rebuilt as a live component over the user's own history.
 *
 * Layers, back to front:
 *   - the no-baseline region covering the first sessions
 *   - the spread band: the range of the user's usual readings
 *   - the long-term drift of the baseline, dashed
 *   - the session polyline with a dot per session
 *   - the short-term trend across the recent window, in amber
 *   - the latest reading, and a bracket measuring its deviation from baseline
 *
 * Colours follow the Amplifier MASTER system on a black data canvas: the
 * lighter green tint, never lime, plus amber for the deviation layer.
 */

const GREEN = "#4CAF6E";
const AMBER = "#FFC163";
const TAN = "#B79862";

/** Trailing readings that count as the recent window, matching the engine. */
const RECENT_WINDOW = 3;

// viewBox units. Fixed so every label position can be reasoned about directly.
const W = 720;
const H = 260;
const PAD = { top: 26, right: 96, bottom: 34, left: 28 };
const PLOT = {
  x0: PAD.left,
  x1: W - PAD.right,
  y0: PAD.top,
  y1: H - PAD.bottom,
};

interface LongitudinalChartProps {
  read: LongitudinalRead;
  /** Signal name shown above the plot. */
  label: string;
}

export const LongitudinalChart = ({ read, label }: LongitudinalChartProps) => {
  const geometry = useMemo(() => {
    const scores = read.readings.map((r) => r.score);

    // Scale to the data actually present, with headroom, rather than a fixed
    // 0-1 axis: these scores cluster in a narrow band and a full-range axis
    // would flatten every move into a straight line.
    const candidates = [
      ...scores,
      ...(read.band ? [read.band.low, read.band.high] : []),
      ...read.baselineSeries.filter((b): b is number => b !== null),
    ];
    const rawMin = Math.min(...candidates);
    const rawMax = Math.max(...candidates);
    const margin = Math.max((rawMax - rawMin) * 0.35, 0.04);
    const min = Math.max(0, rawMin - margin);
    const max = Math.min(1, rawMax + margin);
    const span = max - min || 1;

    const x = (index: number) =>
      read.readings.length === 1
        ? (PLOT.x0 + PLOT.x1) / 2
        : PLOT.x0 + (index / (read.readings.length - 1)) * (PLOT.x1 - PLOT.x0);
    const y = (score: number) => PLOT.y1 - ((score - min) / span) * (PLOT.y1 - PLOT.y0);

    return { x, y, min, max };
  }, [read]);

  const { x, y } = geometry;
  const points = read.readings.map((r, i) => ({ x: x(i), y: y(r.score), score: r.score }));
  const latestPoint = points[points.length - 1];

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Long-term drift is a straight fitted line through the baseline series, not
  // the series itself: the EWMA wobbles reading to reading, and tracing it
  // shows noise where the point is the direction the baseline is travelling.
  const driftLine = (() => {
    const known = read.baselineSeries
      .map((baseline, i) => (baseline === null ? null : { index: i, baseline }))
      .filter((p): p is { index: number; baseline: number } => p !== null);
    if (known.length < 2) return null;

    const fit = fitLine(known.map((p) => p.baseline));
    if (!fit) return null;

    const firstIndex = known[0].index;
    const lastIndex = known[known.length - 1].index;
    return {
      x1: x(firstIndex),
      y1: y(fit.intercept),
      x2: x(lastIndex),
      y2: y(fit.intercept + fit.slope * (known.length - 1)),
    };
  })();

  // The short-term trend is likewise a fitted line across the recent window.
  // Drawn through the readings themselves it would sit exactly on top of the
  // session polyline and be invisible.
  const trendLine = (() => {
    const recent = read.readings.slice(-RECENT_WINDOW);
    if (recent.length < 2) return null;

    const fit = fitLine(recent.map((r) => r.score));
    if (!fit) return null;

    const firstIndex = read.readings.length - recent.length;
    return {
      x1: x(firstIndex),
      y1: y(fit.intercept),
      x2: x(read.readings.length - 1),
      y2: y(fit.intercept + fit.slope * (recent.length - 1)),
    };
  })();

  // Where the "first sessions, no baseline yet" cover ends.
  const noBaselineEndsAt =
    read.readings.length > MIN_SESSIONS_FOR_BASELINE - 1
      ? x(MIN_SESSIONS_FOR_BASELINE - 1)
      : PLOT.x1;

  return (
    <div className="rounded-lg overflow-hidden" style={{ backgroundColor: "#000000" }}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3 pb-1 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: TAN }}>
          {label}
        </span>
        <span className="font-mono text-[10px] tracking-wide" style={{ color: TAN }}>
          {read.baseline === null
            ? `${read.sessions} session${read.sessions === 1 ? "" : "s"} · provisional`
            : `score ${read.latest.toFixed(2)} · baseline ${read.baseline.toFixed(2)} · deviation ${formatSigned(
                read.deviation ?? 0
              )} · ${read.direction} · sessions ${read.sessions}`}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${label} history`}>
        <defs>
          <marker
            id="driftArrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L7,4 L0,7 Z" fill={GREEN} fillOpacity={0.7} />
          </marker>
        </defs>

        {/* The first sessions, before a baseline exists */}
        {read.readings.length > 1 && (
          <>
            <rect
              x={PLOT.x0}
              y={PLOT.y0}
              width={Math.max(0, noBaselineEndsAt - PLOT.x0)}
              height={PLOT.y1 - PLOT.y0}
              fill="#FFFFFF"
              fillOpacity={0.04}
            />
            <text
              x={PLOT.x0 + 8}
              y={PLOT.y0 + 14}
              className="font-mono"
              fontSize="10"
              fill={TAN}
            >
              first {MIN_SESSIONS_FOR_BASELINE} sessions —
            </text>
            <text
              x={PLOT.x0 + 8}
              y={PLOT.y0 + 27}
              className="font-mono"
              fontSize="10"
              fill={TAN}
            >
              no baseline yet
            </text>
          </>
        )}

        {/* The spread of their usual readings */}
        {read.band && (
          <>
            <rect
              x={PLOT.x0}
              y={y(read.band.high)}
              width={PLOT.x1 - PLOT.x0}
              height={Math.max(2, y(read.band.low) - y(read.band.high))}
              fill={GREEN}
              fillOpacity={0.14}
            />
            <line
              x1={PLOT.x0}
              y1={y(read.baseline!)}
              x2={PLOT.x1}
              y2={y(read.baseline!)}
              stroke={GREEN}
              strokeWidth="1"
              strokeOpacity={0.75}
            />
            <text
              x={PLOT.x1 + 8}
              y={y(read.baseline!) - 3}
              className="font-mono"
              fontSize="11"
              fill="#FFFFFF"
              fillOpacity={0.85}
            >
              baseline
            </text>
            <text
              x={PLOT.x1 + 8}
              y={y(read.baseline!) + 10}
              className="font-mono"
              fontSize="11"
              fill="#FFFFFF"
              fillOpacity={0.85}
            >
              {read.baseline!.toFixed(2)}
            </text>
          </>
        )}

        {/* Long-term drift of the baseline */}
        {driftLine && (
          <line
            x1={driftLine.x1}
            y1={driftLine.y1}
            x2={driftLine.x2}
            y2={driftLine.y2}
            stroke={GREEN}
            strokeWidth="1.25"
            strokeDasharray="6 5"
            strokeOpacity={0.7}
            markerEnd="url(#driftArrow)"
          />
        )}

        {/* Session series */}
        <polyline points={polyline} fill="none" stroke={GREEN} strokeWidth="2" />
        {points.slice(0, -1).map((p, i) => (
          <circle key={read.readings[i].sessionId} cx={p.x} cy={p.y} r="4" fill={GREEN} />
        ))}

        {/* Short-term trend across the recent window */}
        {trendLine && (
          <line
            x1={trendLine.x1}
            y1={trendLine.y1}
            x2={trendLine.x2}
            y2={trendLine.y2}
            stroke={AMBER}
            strokeWidth="1.5"
            strokeDasharray="5 4"
            strokeOpacity={0.95}
          />
        )}

        {/* Deviation bracket: how far the latest sits from the baseline */}
        {read.baseline !== null && (
          <>
            <line
              x1={PLOT.x1 - 8}
              y1={y(read.baseline)}
              x2={PLOT.x1 - 8}
              y2={latestPoint.y}
              stroke={AMBER}
              strokeWidth="1.25"
            />
            <line
              x1={PLOT.x1 - 13}
              y1={y(read.baseline)}
              x2={PLOT.x1 - 3}
              y2={y(read.baseline)}
              stroke={AMBER}
              strokeWidth="1.25"
            />
            <line
              x1={PLOT.x1 - 13}
              y1={latestPoint.y}
              x2={PLOT.x1 - 3}
              y2={latestPoint.y}
              stroke={AMBER}
              strokeWidth="1.25"
            />
          </>
        )}

        {/* The latest reading */}
        <circle cx={latestPoint.x} cy={latestPoint.y} r="6.5" fill={AMBER} />
        {/*
          Latest reading and its deviation both live in the right-hand gutter.
          They were annotated in place first, which put the deviation label on
          top of the trend line and the spread caption on top of a data dot.
        */}
        <text
          x={PLOT.x1 + 8}
          y={latestPoint.y + (read.deviation !== null && read.deviation > 0 ? -16 : 14)}
          className="font-mono"
          fontSize="11"
          fill={AMBER}
        >
          latest {read.latest.toFixed(2)}
        </text>
        {read.deviation !== null && (
          <text
            x={PLOT.x1 + 8}
            y={latestPoint.y + (read.deviation > 0 ? -3 : 27)}
            className="font-mono"
            fontSize="10"
            fill={AMBER}
            fillOpacity={0.8}
          >
            dev {formatSigned(read.deviation)}
          </text>
        )}

        {/* Axis captions */}
        <line
          x1={PLOT.x0}
          y1={PLOT.y1 + 8}
          x2={PLOT.x1}
          y2={PLOT.y1 + 8}
          stroke="#FFFFFF"
          strokeOpacity={0.12}
          strokeWidth="1"
        />
        <text x={PLOT.x0} y={PLOT.y1 + 24} className="font-mono" fontSize="10" fill={TAN}>
          earlier sessions
        </text>
        <text
          x={PLOT.x1}
          y={PLOT.y1 + 24}
          textAnchor="end"
          className="font-mono"
          fontSize="10"
          fill={TAN}
        >
          most recent
        </text>
      </svg>

      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 pb-3 pt-1">
        <LegendKey color={GREEN} solid label="session scores" />
        <LegendKey color={GREEN} label="long-term drift of the baseline" />
        <LegendKey color={AMBER} label="short-term trend, recent window" />
        <LegendKey color={GREEN} band label="the spread of their usual readings" />
      </div>
    </div>
  );
};

const LegendKey = ({
  color,
  label,
  solid = false,
  band = false,
}: {
  color: string;
  label: string;
  solid?: boolean;
  /** Draw a filled swatch instead of a line, for the spread band. */
  band?: boolean;
}) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-wide" style={{ color: TAN }}>
    <svg width="16" height="8" aria-hidden="true">
      {band ? (
        <rect x="0" y="1" width="16" height="6" fill={color} fillOpacity={0.25} />
      ) : (
        <line
          x1="0"
          y1="4"
          x2="16"
          y2="4"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={solid ? undefined : "4 3"}
        />
      )}
    </svg>
    {label}
  </span>
);

export default LongitudinalChart;
