import { SubDimensionPanel } from "@/components/report/SubDimensionPanel";
import { AnalysisAnimation } from "@/components/AnalysisAnimation";
import { SignalPanel } from "@/components/report/SignalPanel";
import { BodyMapPanel } from "@/components/report/BodyMapPanel";
import { SpectrogramWaveform } from "@/components/report/SpectrogramWaveform";
import { OptionScale } from "@/components/report/OptionScale";
import { RUNG_RECOMMENDATION, RUNG_SCALE, type HeadlineRung } from "@/lib/result-headline";
import type { SignalSummary } from "@/lib/result-types";
import type { ExtendedMetric, LabMetric } from "@/lib/result-types";

/**
 * Renders a report panel on its own, at the width it occupies in the report, so
 * layout can be checked without recording audio.
 *
 * Gated on ?dev=true like /api-debug. The sample below is a real apex run, not
 * invented numbers, so the bands it lands in are the bands a real recording
 * produces — every sub-dimension between 0.413 and 0.534, which is the case the
 * 0.40-0.60 middle band was chosen for.
 */

const APEX_RUN: ExtendedMetric[] = [
  { metric_id: "sleep-disturbance", label: "Sleep Disturbance", score_mean: 0.534, score_std: 0.0721, low_anchor: "rested", high_anchor: "sluggish" },
  { metric_id: "fatigue", label: "Fatigue", score_mean: 0.4966, score_std: 0.0577, low_anchor: "invigorated", high_anchor: "exhausted" },
  { metric_id: "anhedonia", label: "Anhedonia", score_mean: 0.4919, score_std: 0.0617, low_anchor: "engaged", high_anchor: "disengaged" },
  { metric_id: "energy-level", label: "Energy Level", score_mean: 0.4854, score_std: 0.0591, low_anchor: "exuberant", high_anchor: "spiritless" },
  { metric_id: "burnout", label: "Burnout", score_mean: 0.4831, score_std: 0.0601, low_anchor: "engaged", high_anchor: "burned out" },
  { metric_id: "psychomotor-state", label: "Psychomotor State", score_mean: 0.4404, score_std: 0.0351, low_anchor: "calm", high_anchor: "frantic" },
  { metric_id: "concentration", label: "Concentration", score_mean: 0.4231, score_std: 0.0713, low_anchor: "focused", high_anchor: "inattentive" },
  { metric_id: "motivation", label: "Motivation", score_mean: 0.4133, score_std: 0.075, low_anchor: "driven", high_anchor: "unmotivated" },
  { metric_id: "vad-arousal", label: "Arousal", score_mean: 0.4312, score_std: 0.044, low_anchor: "calm", high_anchor: "activated" },
  { metric_id: "vad-dominance", label: "Sense of Dominance", score_mean: 0.4678, score_std: 0.0425, low_anchor: "submissive", high_anchor: "dominant" },
];

/** The same run pushed past both edges, so the end words can be checked too. */
const AT_THE_EDGES: ExtendedMetric[] = APEX_RUN.map((m, i) => ({
  ...m,
  score_mean: i % 2 === 0 ? 0.12 : 0.88,
}));

/** The pulse signal set from a live run, including the renamed sign. */
const LIVE_SIGNALS: SignalSummary[] = [
  { name: "fatigue", label: "Fatigue", score: 0.318, level: "consider", flagged: true },
  { name: "stress", label: "Stress", score: 0.284, level: "consider", flagged: true },
  { name: "anxiety", label: "Anxiety", score: 0.512, level: "moderate", flagged: true },
  { name: "head-impact", label: "Head Impact", score: 0.14, level: "low", flagged: false },
  {
    name: "elevated-blood-pressure",
    label: "Elevated Blood Pressure",
    score: 0.308,
    level: "low",
    flagged: false,
  },
];

/** One elevated reading (Jitter) so the body map's abnormal-only blink has something to show. */
const SAMPLE_LAB_METRICS: LabMetric[] = [
  { label: "PITCH", value: "142", unit: "Hz", reference: "85-255 Hz", status: "normal" },
  { label: "PITCH VAR", value: "0.14", unit: "", reference: "0.05-0.25", status: "normal" },
  { label: "LOUDNESS", value: "-18", unit: "dB", reference: "-30 to -10 dB", status: "normal" },
  { label: "LOUD VAR", value: "0.52", unit: "", reference: "0.30-0.80", status: "normal" },
  { label: "SPEECH RATE", value: "5.1", unit: "syl/s", reference: "3.5-7.5 syl/s", status: "normal" },
  { label: "ARTIC RATE", value: "5.9", unit: "syl/s", reference: "4.0-8.0 syl/s", status: "normal" },
  { label: "JITTER", value: "1.8", unit: "%", reference: "< 1.0 %", status: "elevated" },
  { label: "SHIMMER", value: "2.1", unit: "dB", reference: "< 3.8 dB", status: "normal" },
  { label: "HNR", value: "9.2", unit: "dB", reference: "> 7 dB", status: "normal" },
  { label: "PAUSE", value: "0.31", unit: "s", reference: "0.15-0.60 s", status: "normal" },
  { label: "BREATHINESS", value: "24", unit: "dB", reference: "20-35 dB", status: "normal" },
];

const HERO_TYPE = "text-base md:text-lg font-semibold tracking-[0.18em]";

const Hero = ({ rung }: { rung: HeadlineRung }) => (
  <div className="relative px-4 py-4">
    <h2
      className={`text-center font-mono uppercase ${HERO_TYPE}`}
      style={{ color: "#8A3B08" }}
    >
      Athletic Profile
    </h2>
    <div className="mb-3 mt-2.5">
      <OptionScale
        options={RUNG_SCALE}
        activeKey={rung}
        size="lg"
        surface="light"
        ariaLabel="Assessment outcome"
      />
    </div>
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#0B0B0A" }}>
      <SpectrogramWaveform
        displayText={RUNG_RECOMMENDATION[rung]}
        statusColor={RUNG_SCALE.find((r) => r.key === rung)!.color}
        showContent
      />
    </div>
    <div className={`text-center font-mono uppercase mt-2 ${HERO_TYPE}`} style={{ color: "#4B2700" }}>
      Assessment
    </div>
  </div>
);

const PanelPreview = () => {
  const isDevMode = new URLSearchParams(window.location.search).get("dev") === "true";

  if (!isDevMode) {
    return (
      <div className="min-h-screen bg-[#F0EAE0] p-8">
        <p className="font-mono text-xs text-[#2E2E2E]">Add ?dev=true to enable.</p>
      </div>
    );
  }

  // ?screen=analysis renders the analysis screen full-bleed, which is the only
  // way to inspect its layout without recording audio.
  if (new URLSearchParams(window.location.search).get("screen") === "analysis") {
    return (
      <div className="fixed inset-0">
        <AnalysisAnimation onComplete={() => {}} onFailed={() => {}} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0EAE0] py-8">
      {/*
        The report's entry animation is driven by requestAnimationFrame, which
        does not run while a tab is hidden — and a headless or embedded browser
        reports itself hidden, so every row would screenshot at opacity 0. This
        harness exists to be looked at, so it pins the settled state.
      */}
      <style>{`
        [data-panel-preview] [style*="opacity"] {
          opacity: 1 !important;
          transform: none !important;
        }
      `}</style>

      {/* 420px is the report's own content width. */}
      <div className="mx-auto" data-panel-preview style={{ maxWidth: 420 }}>
        <h1 className="font-mono text-[10px] uppercase tracking-widest text-[#231200] mb-1 px-4">
          Hero · every rung
        </h1>
        {(["clean", "good", "steady", "focus"] as HeadlineRung[]).map((r) => (
          <Hero key={r} rung={r} />
        ))}

        <h1 className="font-mono text-[10px] uppercase tracking-widest text-[#231200] mb-1 mt-6 px-4">
          Signal rows · live pulse set
        </h1>
        <div className="px-4 py-3">
          <SignalPanel signals={LIVE_SIGNALS} showContent />
        </div>

        <h1 className="font-mono text-[10px] uppercase tracking-widest text-[#231200] mb-1 mt-6 px-4">
          Sub-Dimensions · real apex run
        </h1>
        <div className="px-4 py-3">
          <SubDimensionPanel metrics={APEX_RUN} showContent />
        </div>

        <h1 className="font-mono text-[10px] uppercase tracking-widest text-[#231200] mb-1 mt-6 px-4">
          Same run forced to both edges
        </h1>
        <div className="px-4 py-3">
          <SubDimensionPanel metrics={AT_THE_EDGES} showContent />
        </div>

        <h1 className="font-mono text-[10px] uppercase tracking-widest text-[#231200] mb-1 mt-6 px-4">
          Senior mode
        </h1>
        <div className="px-4 py-3">
          <SubDimensionPanel metrics={APEX_RUN} showContent isSeniorMode />
        </div>

        <h1 className="font-mono text-[10px] uppercase tracking-widest text-[#231200] mb-1 mt-6 px-4">
          Body map · same data, grouped by icon · one abnormal per section
        </h1>
        <div className="px-4 py-3">
          <BodyMapPanel
            signals={LIVE_SIGNALS}
            extendedMetrics={AT_THE_EDGES}
            labMetrics={SAMPLE_LAB_METRICS}
            showContent
          />
        </div>
      </div>
    </div>
  );
};

export default PanelPreview;
