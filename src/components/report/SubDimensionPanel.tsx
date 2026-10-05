import { motion } from "framer-motion";
import type { ExtendedMetric } from "@/lib/result-types";
import { readableSubDimensions, type ReadableSubDimension } from "@/lib/sub-dimensions";
import { OptionScale, type ScaleOption } from "./OptionScale";

interface SubDimensionPanelProps {
  metrics: ExtendedMetric[] | undefined;
  showContent: boolean;
  isHighVis?: boolean;
  isSeniorMode?: boolean;
}

/**
 * `result.extended_metrics`, one row per sub-dimension.
 *
 * A sub-dimension has no flag and no threshold, only a position between two
 * named anchors, so the three cells are coloured by direction: blue at the
 * favourable anchor, green in the middle, red at the far end.
 *
 * Which rows appear, what they are called, and the three words each one uses are
 * all decided in lib/sub-dimensions.ts, not here.
 */

/**
 * Colour by band index: blue at the favourable anchor, green in the middle, red
 * at the unfavourable one. Indexed by the row's own band, not by screen
 * position, so it stays correct however the scale is ordered.
 *
 * Blue is Breath #99E4FF from the brand palette. It marks the favourable end as
 * better than ordinary rather than merely safe, which green alone could not do
 * once green moved to the middle.
 */
const DIRECTION_COLORS: Array<{ dark: string; light: string }> = [
  { dark: "#99E4FF", light: "#12657F" },
  { dark: "#4CAF6E", light: "#1E5631" },
  { dark: "#FF6173", light: "#8E1220" },
];

/**
 * The three cells left to right: unfavourable, middle, favourable.
 *
 * Reversed from the config order, which runs low score to high score to line up
 * with the API's anchors. Drawing it that way put the favourable end on the
 * left, and every scale on the page runs unfavourable-left.
 */
function scaleFor(row: ReadableSubDimension): ScaleOption[] {
  return row.levels
    .map((label, i) => ({
      key: String(i),
      label,
      color: DIRECTION_COLORS[i].dark,
      colorLight: DIRECTION_COLORS[i].light,
    }))
    .reverse();
}

export const SubDimensionPanel = ({
  metrics,
  showContent,
  isHighVis = false,
  isSeniorMode = false,
}: SubDimensionPanelProps) => {
  const rows = readableSubDimensions(metrics);
  if (rows.length === 0) return null;

  return (
    /*
      One column at every width.

      A two-column layout was tried and reverted: md: keys off the viewport, but
      this panel sits inside the fixed-width report chassis, so a wider window
      halved the cell width instead of widening it. At 1280px that left 54px per
      cell against the 71px UNDER-RECOVERED needs, clipping ten of the
      twenty-four cells. Container width here is set by the chassis, so a
      viewport breakpoint is the wrong lever.
    */
    <div className="flex flex-col gap-px bg-[#231200]/15 rounded-lg overflow-hidden">
      {rows.map((row, index) => (
        <motion.div
          key={row.id}
          className={`bg-black/85 ${
            isSeniorMode ? "px-4 py-3.5" : isHighVis ? "px-3.5 py-3" : "px-3 py-2.5"
          }`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 8 }}
          transition={{ delay: 1.2 + index * 0.05, duration: 0.3 }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <span
              className={`font-mono uppercase tracking-wider truncate ${
                isSeniorMode
                  ? "text-sm font-semibold text-white"
                  : isHighVis
                    ? "text-[11px] font-medium text-white"
                    : "text-[10px] font-medium text-white"
              }`}
            >
              {row.label}
            </span>
            {/*
              score_mean, plus the segment spread the API reports alongside it.
              The spread is the reason the middle band is 0.40-0.60 rather than
              tighter, so showing it lets a reader see why a row near an edge
              still reads NORMAL.
            */}
            <span
              className={`font-mono tabular-nums text-white/70 flex-shrink-0 ${
                isSeniorMode ? "text-[11px]" : "text-[9px]"
              }`}
            >
              {row.scoreMean.toFixed(2)}
              <span className="text-white/50"> ±{row.scoreStd.toFixed(2)}</span>
            </span>
          </div>

          <OptionScale
            options={scaleFor(row)}
            activeKey={String(row.bandIndex)}
            dimOpacity={0.8}
            ariaLabel={`${row.label}: ${row.level}`}
          />
        </motion.div>
      ))}
    </div>
  );
};

export default SubDimensionPanel;
