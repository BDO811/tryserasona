import { motion } from "framer-motion";
import type { ExtendedMetric, LabMetric, SignalSummary } from "@/lib/result-types";
import {
  bandColor,
  bandColorForSignal,
  bandForSignal,
  bandLabelForSignal,
  bandScaleOptions,
  signLabel,
} from "@/lib/signal-band";
import { readableSubDimensions } from "@/lib/sub-dimensions";
import {
  BODY_ZONE_LABEL,
  BODY_ZONES,
  type BodyZone,
  zoneForLabMetric,
  zoneForSignal,
  zoneForSubDimension,
} from "@/lib/body-zone-map";
import { OptionScale, type ScaleOption } from "./OptionScale";
import bodyFull from "@/assets/bodymap/body-full.png";
import iconBrain from "@/assets/bodymap/icon-brain.png";
import iconMouth from "@/assets/bodymap/icon-mouth.png";
import iconHeart from "@/assets/bodymap/icon-heart.png";
import iconLungs from "@/assets/bodymap/icon-lungs.png";
import iconBlood from "@/assets/bodymap/icon-blood.png";

interface BodyMapPanelProps {
  signals: SignalSummary[];
  extendedMetrics: ExtendedMetric[] | undefined;
  labMetrics: LabMetric[];
  showContent: boolean;
  isHighVis?: boolean;
  isSeniorMode?: boolean;
}

const ZONE_ICON: Record<BodyZone, string> = {
  brain: iconBrain,
  mouth: iconMouth,
  heart: iconHeart,
  lungs: iconLungs,
  blood: iconBlood,
};

/** Position of each zone's marker on body-full.png, as a fraction of its box. */
const ZONE_MARKER_POSITION: Record<BodyZone, { left: string; top: string }> = {
  brain: { left: "50%", top: "9.5%" },
  mouth: { left: "50%", top: "19.5%" },
  heart: { left: "42%", top: "28.6%" },
  lungs: { left: "58%", top: "28.6%" },
  blood: { left: "50%", top: "40.5%" },
};

/**
 * Mirrors SubDimensionPanel's DIRECTION_COLORS (unfavourable, middle,
 * favourable at indices 0/1/2 there; this scale is drawn favourable-left to
 * match every other scale on the report, so the order here is reversed).
 */
const SUBDIM_SCALE_COLOR: Array<{ dark: string; light: string }> = [
  { dark: "#c2608a", light: "#7b2d5e" }, // unfavourable
  { dark: "#3ba8b8", light: "#0d6a76" }, // middle
  { dark: "#4a90c9", light: "#1d5fa8" }, // favourable
];

interface SignalRow {
  kind: "signal";
  key: string;
  label: string;
  bandWord: string;
  scale: ScaleOption[];
  activeKey: string | null;
  isAbnormal: boolean;
}

interface SubDimRow {
  kind: "subdim";
  key: string;
  label: string;
  scoreMean: number;
  scoreStd: number;
  scale: ScaleOption[];
  activeKey: string;
  isAbnormal: boolean;
}

interface LabRow {
  kind: "lab";
  key: string;
  label: string;
  value: string;
  unit: string;
  reference: string;
  isAbnormal: boolean;
}

type ZoneRow = SignalRow | SubDimRow | LabRow;

interface ZoneGroup {
  zone: BodyZone;
  hasAbnormal: boolean;
  hasData: boolean;
  signalRows: SignalRow[];
  subDimRows: SubDimRow[];
  labRows: LabRow[];
}

function buildZoneGroups(
  signals: SignalSummary[],
  extendedMetrics: ExtendedMetric[] | undefined,
  labMetrics: LabMetric[]
): Record<BodyZone, ZoneGroup> {
  const groups = Object.fromEntries(
    BODY_ZONES.map((zone) => [
      zone,
      { zone, hasAbnormal: false, hasData: false, signalRows: [], subDimRows: [], labRows: [] },
    ])
  ) as Record<BodyZone, ZoneGroup>;

  for (const sig of signals) {
    const band = bandForSignal(sig.name, sig.level);
    if (band === "INCONCLUSIVE") continue;
    const zone = zoneForSignal(sig.name);
    /*
      Not a raw isFlaggedBand check: fatigue/stress/anxiety display LOW in the
      same green as NORMAL (GREEN_THROUGH_LOW in signal-band.ts — "a faint
      indicator here is not something to act on"), so flashing them at LOW
      would blink a row the app itself is showing as fine. Comparing the row's
      actual displayed colour against NORMAL's is what the rest of the report
      already uses to decide this, so it is reused here rather than
      re-deriving the same exception.
    */
    const isAbnormal = bandColorForSignal(sig.name, band, "dark") !== bandColor("NORMAL", "dark");
    groups[zone].signalRows.push({
      kind: "signal",
      key: `signal-${sig.name}`,
      label: signLabel(sig.name, sig.label),
      bandWord: bandLabelForSignal(sig.name, band),
      scale: bandScaleOptions(sig.name),
      activeKey: band,
      isAbnormal,
    });
    groups[zone].hasData = true;
    if (isAbnormal) groups[zone].hasAbnormal = true;
  }

  for (const row of readableSubDimensions(extendedMetrics)) {
    const zone = zoneForSubDimension();
    const isAbnormal = !row.neutral && row.bandIndex === 2;
    const scale: ScaleOption[] = row.levels
      .map((label, i) => ({
        key: String(i),
        label,
        color: SUBDIM_SCALE_COLOR[i].dark,
        colorLight: SUBDIM_SCALE_COLOR[i].light,
      }))
      .reverse();
    groups[zone].subDimRows.push({
      kind: "subdim",
      key: `subdim-${row.id}`,
      label: row.label,
      scoreMean: row.scoreMean,
      scoreStd: row.scoreStd,
      scale,
      activeKey: String(row.bandIndex),
      isAbnormal,
    });
    groups[zone].hasData = true;
    if (isAbnormal) groups[zone].hasAbnormal = true;
  }

  for (const metric of labMetrics) {
    const zone = zoneForLabMetric(metric.label);
    const isAbnormal = metric.status !== "normal";
    groups[zone].labRows.push({
      kind: "lab",
      key: `lab-${metric.label}`,
      label: metric.label,
      value: metric.value,
      unit: metric.unit,
      reference: metric.reference,
      isAbnormal,
    });
    groups[zone].hasData = true;
    if (isAbnormal) groups[zone].hasAbnormal = true;
  }

  return groups;
}

/**
 * Groups every real measurement Sona-2 reports (signals, sub-dimensions, lab
 * metrics) under the body-part icon it reads on, with a marker on a full-body
 * graphic at the top showing where each group lives. A row or marker that is
 * off-normal breathes slowly (.animate-gentle-blink); everything in range
 * stays still, so stillness itself is informative.
 *
 * Single-column by design: the report chassis is a fixed max-w-[500px] at
 * every viewport (see HealthProfile.tsx), so there is no width to split the
 * body graphic and the measurement list side by side the way an earlier
 * desktop-width mock of this showed it. Correlation between a body marker and
 * its group is by colour (red = flagged, matching the group's own header dot)
 * rather than a drawn line.
 */
export const BodyMapPanel = ({
  signals,
  extendedMetrics,
  labMetrics,
  showContent,
  isHighVis = false,
  isSeniorMode = false,
}: BodyMapPanelProps) => {
  const groups = buildZoneGroups(signals, extendedMetrics, labMetrics);
  const zonesWithData = BODY_ZONES.filter((z) => groups[z].hasData);
  if (zonesWithData.length === 0) return null;

  const labelSize = isSeniorMode
    ? "text-sm font-semibold text-white"
    : isHighVis
      ? "text-[11px] font-medium text-white"
      : "text-[10px] font-medium text-white";
  const zoneNameSize = isSeniorMode ? "text-sm" : isHighVis ? "text-[11px]" : "text-[10px]";

  return (
    <div>
      {/* Full-body graphic with a marker per zone that has data. */}
      <div
        className="relative mx-auto mb-3 rounded-lg overflow-hidden"
        style={{ backgroundColor: "#1b1510", maxWidth: 220 }}
      >
        <img src={bodyFull} alt="" className="w-full h-auto block" />
        {zonesWithData.map((zone) => {
          const g = groups[zone];
          const pos = ZONE_MARKER_POSITION[zone];
          return (
            <span
              key={zone}
              className={`absolute rounded-full ${g.hasAbnormal ? "animate-gentle-blink" : ""}`}
              style={{
                left: pos.left,
                top: pos.top,
                width: 9,
                height: 9,
                transform: "translate(-50%, -50%)",
                background: g.hasAbnormal ? "#c2608a" : "rgba(200,230,230,0.9)",
                boxShadow: g.hasAbnormal
                  ? "0 0 10px 3px rgba(194,96,138,0.6)"
                  : "0 0 8px 3px rgba(200,230,230,0.4)",
              }}
            />
          );
        })}
      </div>

      {/* One section per zone, icon header first, then every row it carries. */}
      <div className="flex flex-col gap-3">
        {zonesWithData.map((zone, zoneIndex) => {
          const g = groups[zone];
          const rows: ZoneRow[] = [...g.signalRows, ...g.subDimRows, ...g.labRows];
          return (
            <motion.div
              key={zone}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 8 }}
              transition={{ delay: 1.15 + zoneIndex * 0.08, duration: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <img src={ZONE_ICON[zone]} alt="" className="w-6 h-6 opacity-90" />
                <span className={`font-mono uppercase tracking-widest ${zoneNameSize} text-[#1b1510]`}>
                  {BODY_ZONE_LABEL[zone]}
                </span>
                {g.hasAbnormal && (
                  <span
                    className="w-1.5 h-1.5 rounded-full animate-gentle-blink"
                    style={{ background: "#c2608a" }}
                  />
                )}
              </div>

              <div className="flex flex-col gap-px bg-[#1b1510]/15 rounded-lg overflow-hidden">
                {rows.map((row) => {
                  if (row.kind === "lab") {
                    return (
                      <div
                        key={row.key}
                        className={`bg-black/85 flex items-baseline gap-2 ${
                          isSeniorMode ? "px-4 py-3" : isHighVis ? "px-3.5 py-2.5" : "px-3 py-2"
                        } ${row.isAbnormal ? "animate-gentle-blink" : ""}`}
                      >
                        <span className={`font-mono uppercase tracking-wider ${labelSize}`}>{row.label}</span>
                        <span
                          className="font-mono text-[11px] font-semibold"
                          style={{ color: row.isAbnormal ? "#d9822f" : "#3ba8b8" }}
                        >
                          {row.value}
                        </span>
                        <span className="font-mono text-[9px] text-white/50">{row.unit}</span>
                        <span className="font-mono text-[8px] text-white/35 ml-auto">{row.reference}</span>
                      </div>
                    );
                  }

                  const scoreText =
                    row.kind === "subdim" ? (
                      <span className="font-mono tabular-nums text-white/70 text-[9px] flex-shrink-0">
                        {row.scoreMean.toFixed(2)}
                        <span className="text-white/50"> &plusmn;{row.scoreStd.toFixed(2)}</span>
                      </span>
                    ) : null;

                  return (
                    <div
                      key={row.key}
                      className={`bg-black/85 ${
                        isSeniorMode ? "px-4 py-4" : isHighVis ? "px-3.5 py-3" : "px-3 py-2.5"
                      } ${row.isAbnormal ? "animate-gentle-blink" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-2">
                        <span className={`font-mono uppercase tracking-wider truncate ${labelSize}`}>
                          {row.label}
                        </span>
                        {row.kind === "signal" ? (
                          <span
                            className={`font-mono flex-shrink-0 ${isSeniorMode ? "text-xs" : "text-[10px]"}`}
                            style={{ color: "#4a90c9" }}
                          >
                            {row.bandWord}
                          </span>
                        ) : (
                          scoreText
                        )}
                      </div>
                      <OptionScale
                        options={row.scale}
                        activeKey={row.activeKey}
                        ariaLabel={`${row.label}: ${row.kind === "signal" ? row.bandWord : ""}`}
                        {...(row.kind === "subdim" ? { dimOpacity: 0.8 } : {})}
                      />
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default BodyMapPanel;
