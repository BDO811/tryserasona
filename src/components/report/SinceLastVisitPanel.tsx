import { motion } from "framer-motion";
import type { SignalHistory } from "@/hooks/use-voice-history";
import { formatSigned } from "@/lib/longitudinal";

const TAN = "#B79862";
const AMBER = "#FFC163";
const GREEN = "#4CAF6E";

/** A move smaller than this reads as unchanged rather than as a direction. */
const FLAT_THRESHOLD = 0.02;

interface SinceLastVisitPanelProps {
  signals: SignalHistory[];
  sessionCount: number;
  showContent: boolean;
  isSeniorMode?: boolean;
  onViewHistory: () => void;
}

/**
 * Shown to a returning member: what moved since their last visit, per signal.
 *
 * This is the plain visit-to-visit change, deliberately not the deviation from
 * baseline. The two answer different questions, and the baseline read lives on
 * the history page where there is room to show the series behind it.
 */
export const SinceLastVisitPanel = ({
  signals,
  sessionCount,
  showContent,
  isSeniorMode = false,
  onViewHistory,
}: SinceLastVisitPanelProps) => {
  const moved = signals
    .filter((s) => s.sinceLastVisit !== null)
    .sort((a, b) => Math.abs(b.sinceLastVisit!.change) - Math.abs(a.sinceLastVisit!.change));

  if (moved.length === 0) return null;

  const changedCount = moved.filter(
    (s) => Math.abs(s.sinceLastVisit!.change) >= FLAT_THRESHOLD
  ).length;

  return (
    <motion.div
      className="rounded-lg overflow-hidden"
      style={{
        background: "rgba(11, 11, 10, 0.9)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 8 }}
      transition={{ duration: 0.5, delay: 1.5 }}
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2 flex-wrap">
        <h3 className="font-mono text-xs uppercase tracking-widest text-white">
          Since your last visit
        </h3>
        <span className="font-mono text-[9px] uppercase tracking-[0.15em]" style={{ color: TAN }}>
          visit {sessionCount} ·{" "}
          {changedCount === 0
            ? "nothing moved past your usual range"
            : `${changedCount} signal${changedCount === 1 ? "" : "s"} moved`}
        </span>
      </div>

      <div className="flex flex-col gap-px">
        {moved.map((signal) => {
          const { change, previous, latest } = signal.sinceLastVisit!;
          const isFlat = Math.abs(change) < FLAT_THRESHOLD;
          // Lower is better for these signals, so a fall is the good direction.
          const color = isFlat ? TAN : change > 0 ? AMBER : GREEN;

          return (
            <div
              key={signal.name}
              className={`flex items-baseline justify-between gap-3 bg-black/70 ${
                isSeniorMode ? "px-4 py-3.5" : "px-4 py-2.5"
              }`}
            >
              <span
                className={`font-mono uppercase tracking-wider text-white truncate ${
                  isSeniorMode ? "text-xs" : "text-[10px]"
                }`}
              >
                {signal.label}
              </span>

              <span className="flex items-baseline gap-2 flex-shrink-0">
                <span
                  className={`font-mono tabular-nums ${isSeniorMode ? "text-[11px]" : "text-[10px]"}`}
                  style={{ color: "rgba(255,255,255,0.75)" }}
                >
                  {previous.toFixed(2)} → {latest.toFixed(2)}
                </span>
                <span
                  className={`font-mono tabular-nums ${isSeniorMode ? "text-sm" : "text-xs"}`}
                  style={{ color }}
                >
                  {isFlat ? "no change" : formatSigned(change)}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3">
        <button
          onClick={onViewHistory}
          className="font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
          style={{ color: TAN }}
        >
          View full history →
        </button>
      </div>
    </motion.div>
  );
};

export default SinceLastVisitPanel;
