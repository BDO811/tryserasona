import { motion } from "framer-motion";
import { SignalSummary } from "@/lib/result-types";
import {
  bandForSignal,
  bandLabelForSignal,
  bandScaleOptions,
  signLabel,
} from "@/lib/signal-band";
import { OptionScale } from "./OptionScale";

interface SignalPanelProps {
  signals: SignalSummary[];
  showContent: boolean;
  isHighVis?: boolean;
  isSeniorMode?: boolean;
}

/**
 * The per-sign read from a v2 model job: one row per sign the model measures,
 * ranked most-severe first, each reported as a band.
 *
 * Each row shows every band in fixed order with only its own lit, so a signal's
 * position is read in place. The previous single-word-plus-bar treatment could
 * not do that: the word came from the level and the bar from the raw score, two
 * different scales, so five rows reading MEDIUM carried five different bar
 * lengths. The raw score is no longer drawn at all — it is a per-sign
 * probability, not a common one, so comparing it across rows invited a false
 * reading. See lib/signal-band.ts.
 */
/** Breath #99E4FF, the brand palette's blue. Dark rows only, which is all of these. */
const READOUT_BLUE = "#99E4FF";

export const SignalPanel = ({
  signals,
  showContent,
  isHighVis = false,
  isSeniorMode = false,
}: SignalPanelProps) => {
  if (!signals || signals.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-px bg-[#231200]/15 rounded-lg overflow-hidden">
      {signals.map((signal, index) => {
        const band = bandForSignal(signal.name, signal.level);
        // head-impact reads NONE rather than NORMAL; the band itself is
        // unchanged so counts and the grade are unaffected.
        const bandWord = bandLabelForSignal(signal.name, band);
        const label = signLabel(signal.name, signal.label);
        const scale = bandScaleOptions(signal.name).map((o) => ({
          ...o,
          label: bandLabelForSignal(signal.name, o.key),
        }));

        return (
          <motion.div
            key={signal.name}
            className={`bg-black/85 ${
              isSeniorMode ? "px-4 py-4" : isHighVis ? "px-3.5 py-3" : "px-3 py-2.5"
            }`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 8 }}
            transition={{ delay: 1.15 + index * 0.06, duration: 0.3 }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span
                className={`font-mono uppercase tracking-wider truncate ${
                  isSeniorMode
                    ? "text-sm font-semibold text-white"
                    : isHighVis
                      ? "text-[11px] font-medium text-white"
                      : "text-[10px] font-medium text-white"
                }`}
              >
                {label}
              </span>
              {/*
                The band word only. The raw score used to sit beside it, and the
                docs class score as internal use with `level` as the display
                field, so printing three decimals invited a reader to compare
                numbers that are calibrated per sign and not comparable across
                rows.

                Blue rather than white, so the readout separates from the sign
                name on the left and does not compete with the lit cell below,
                which already carries the band's own colour.
              */}
              <span
                className={`font-mono flex-shrink-0 ${isSeniorMode ? "text-xs" : "text-[10px]"}`}
                style={{ color: READOUT_BLUE }}
              >
                {bandWord}
              </span>
            </div>

            <OptionScale
              options={scale}
              activeKey={band === "INCONCLUSIVE" ? null : band}
              ariaLabel={`${label}: ${bandWord}`}
            />
          </motion.div>
        );
      })}
    </div>
  );
};
