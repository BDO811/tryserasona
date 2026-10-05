import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArchetypeData } from "./AnalysisAnimation";
import { useAssessment, AssessmentPathway, BRAND_COLOR, getIsHighVis, getIsSeniorMode } from "@/context/AssessmentContext";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SpectrogramWaveform } from "./report/SpectrogramWaveform";
import { BodyMapPanel } from "./report/BodyMapPanel";
import { RecommendationsPanel } from "./report/RecommendationsPanel";
import { SinceLastVisitPanel } from "./report/SinceLastVisitPanel";
import { SystemStatusBar } from "./report/SystemStatusBar";
import { useVoiceHistory } from "@/hooks/use-voice-history";
import { formatLikelihoodTierForDisplay } from "@/lib/result-types";
import { getProtocolId, getStatusColorFromLikelihoodTier } from "@/lib/assessment-display-utils";
import { RUNG_RECOMMENDATION, RUNG_SCALE, type HeadlineRung } from "@/lib/result-headline";
import { bandForSignal, bandLabelForSignal, isFlaggedBand, signLabel } from "@/lib/signal-band";
import { OptionScale } from "./report/OptionScale";
import { t } from "@/lib/i18n";

interface HealthProfileProps {
  archetype: ArchetypeData | null;
  onReset: () => void;
  onRecapture?: () => void;
}

const DEFAULT_REVEAL_METRICS_COUNT = 6;

const REVEAL_METRICS_COUNT = (() => {
  const rawValue = import.meta.env.VITE_REVEAL_METRICS_COUNT;

  if (rawValue == null) {
    return DEFAULT_REVEAL_METRICS_COUNT;
  }

  const parsed = Number.parseInt(String(rawValue), 10);

  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  console.warn(
    `[HealthProfile] Invalid VITE_REVEAL_METRICS_COUNT "${rawValue}", defaulting to ${DEFAULT_REVEAL_METRICS_COUNT}`,
  );

  return DEFAULT_REVEAL_METRICS_COUNT;
})();

export const HealthProfile = ({ archetype, onReset, onRecapture }: HealthProfileProps) => {
  const navigate = useNavigate();
  const { pathway, pathwayConfig, pathwayDisplayTitle, pathwayDisplaySubtitle, userProfile, visualizedResult, language, markAssessmentComplete } = useAssessment();
  const isHighVis = getIsHighVis(userProfile.ageRange);
  const isSeniorMode = getIsSeniorMode(userProfile.ageRange);
  const [showContent, setShowContent] = useState(false);
  const [currentDate, setCurrentDate] = useState("");

  // Persists this result against the user's email, then loads their history so
  // a returning member can see what moved. Called above the early return below,
  // because a hook behind a conditional return is a hook order violation.
  const voiceHistory = useVoiceHistory({ save: true });

  // Require visualized result - no fallback to hardcoded data
  if (!visualizedResult) {
    return null;
  }

  const classification = visualizedResult.classification;
  const likelihoodTier = visualizedResult.likelihoodTier;

  /*
    The subject line above the spectrogram and the "Assessment" line below it
    share one type scale so they bracket the result as a pair. Larger than the
    9-10px they each used to carry on their own.
  */
  const HERO_PAIR_TYPE = isSeniorMode
    ? "text-xl md:text-2xl font-bold tracking-[0.18em]"
    : isHighVis
      ? "text-lg md:text-xl font-semibold tracking-[0.18em]"
      : "text-base md:text-lg font-semibold tracking-[0.18em]";

  /*
    Phrase and colour both keyed to the rung, which is what the scale above the
    spectrogram lights. Reading one from the rung and the other from
    overall_level is how a STRONG result could sit above "Continue to Monitor".
  */
  const rung = visualizedResult.headlineRung as HeadlineRung | undefined;
  const rungPhrase = rung
    ? RUNG_RECOMMENDATION[rung]
    : formatLikelihoodTierForDisplay(likelihoodTier);
  const actionableSigns = (visualizedResult.signals ?? [])
    .map((sig) => {
      const band = bandForSignal(sig.name, sig.level);
      return { label: signLabel(sig.name, sig.label), band, word: bandLabelForSignal(sig.name, band) };
    })
    .filter((s) => isFlaggedBand(s.band))
    .map((s) => ({ label: s.label, band: s.band as string }));

  const rungColor =
    RUNG_SCALE.find((r) => r.key === rung)?.color ??
    getStatusColorFromLikelihoodTier(likelihoodTier, "dark");
  const protocolId = getProtocolId(pathway);
  const revealLabMetrics = visualizedResult.labMetrics.slice(0, REVEAL_METRICS_COUNT);
  const revealSignals = visualizedResult.signals ?? [];
  const hasDetailedReport = (visualizedResult.biomarkers?.length ?? 0) > 0;
  
  // Both assessments use the same tier presentation. The WELLNESS pathway used
  // to switch to a binary positive/negative headline coloured cyan #22d3ee, a
  // retired palette; routing the Wellness card here would have brought it back
  // and made the two assessments look unrelated to each other.
  const dataStatusColor = getStatusColorFromLikelihoodTier(likelihoodTier);
  
  // Use dynamic display title or fall back to pathway config
  const assessmentTitle = pathwayDisplayTitle || (pathwayConfig?.title || "Assessment");
  
  // Inconclusive state - show recapture option
  const isInconclusiveState = likelihoodTier.toUpperCase() === "INCONCLUSIVE";

  /*
    The footer card states the API's own recommended_action, using the meaning
    the docs give it, rather than a count of flags or a collapsed rewrite.

    The action is derived server-side from the full distribution of signal
    levels, with one elevated signal outranking several weak ones, so no count
    reproduces it. It was previously folded into three outcomes with invented
    headlines; that discarded the distinction between consider, review and
    escalate, which is the whole point of the field.
  */
  const flaggedCount = visualizedResult.flaggedCount ?? 0;
  const totalSignals = visualizedResult.totalSignals ?? flaggedCount;
  // Initialize date from visualized result or current date
  useEffect(() => {
    if (visualizedResult?.createdAt) {
      const date = new Date(visualizedResult.createdAt);
      setCurrentDate(date.toISOString().split('T')[0].replace(/-/g, '.'));
    } else {
      const now = new Date();
      setCurrentDate(now.toISOString().split('T')[0].replace(/-/g, '.'));
    }
  }, [visualizedResult]);

  // Animation sequence + fire ReportGenerated event
  useEffect(() => {
    const showTimer = setTimeout(() => {
      setShowContent(true);
      
      // Fire Meta Pixel custom event when report is shown
      if (typeof window !== 'undefined' && (window as any).fbq) {
        (window as any).fbq('trackCustom', 'ReportGenerated', {
          archetype: archetype?.id || 'unknown',
          vitality: archetype?.vitality || 0,
        });
      }
    }, 600);
    return () => clearTimeout(showTimer);
  }, [archetype]);

  
  if (!archetype) {
    return null;
  }

  const handleViewDetailedAnalysis = () => {
    if (pathway) {
      markAssessmentComplete(pathway);
    }
    navigate('/detailed-analysis');
  };

  const handleViewHistory = () => {
    navigate('/history');
  };

  return (
    <motion.div
      className="relative w-full flex items-start justify-center pt-20 pb-8 md:pt-24 md:pb-12"
      style={{ backgroundColor: "#fbf7f1" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Subtle ambient glow - uses data status color for score-based ambiance */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: showContent ? 0.1 : 0 }}
          transition={{ duration: 1.2 }}
          style={{
            background: `radial-gradient(circle at 50% 30%, ${dataStatusColor}15 0%, transparent 50%)`,
          }}
        />
      </div>

      {/* Sensor Chassis Container */}
      <motion.div
        className="relative z-10 w-full max-w-[500px] mx-4 md:mx-6 rounded-xl overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        style={{
          /*
            Was a 40% black scrim over the beige page, which produced a muddy
            mid-grey and left every white-alpha label sitting at 30-60% on top
            of it. Now the brand paper surface shows through and the chrome is
            near-black at full opacity, per the canon's rule for a cream ground.
            The data blocks inside keep their own black canvas.
          */
          background: 'rgba(0, 0, 0, 0.03)',
          border: '1px solid rgba(27, 21, 16, 0.15)',
        }}
      >
        {/* Measurement Grid Pattern Texture */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(27,21,16,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(27,21,16,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '24px 24px',
          }}
        />

        {/* System Status Bar — the capture values the job reports. */}
        <SystemStatusBar
          showContent={showContent}
          sampleRate={visualizedResult?.signalQuality?.sampleRate}
          modelName={visualizedResult?.modelName}
        />

        {/* Header Metadata Row */}
        <motion.div
          className="flex items-center justify-center gap-4 px-4 py-3 border-b border-[#1b1510]/10 flex-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: showContent ? 1 : 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <span className={`font-mono uppercase tracking-widest ${
            isHighVis ? 'text-[10px] md:text-xs font-semibold text-[#1b1510]' : 'text-[9px] md:text-[10px] text-[#1b1510]'
          }`}>
            {assessmentTitle} Assessment
          </span>
          <span className={'text-[#574b3f]/50'}>|</span>
          <span className={`font-mono uppercase tracking-widest ${
            isHighVis ? 'text-[10px] md:text-xs font-medium text-[#6f6254]' : 'text-[9px] md:text-[10px] text-[#6f6254]'
          }`}>
            Protocol: {protocolId}
          </span>
          <span className={'text-[#574b3f]/50'}>|</span>
          <span className={`font-mono uppercase tracking-widest ${
            isHighVis ? 'text-[10px] md:text-xs font-medium text-[#6f6254]' : 'text-[9px] md:text-[10px] text-[#6f6254]'
          }`}>
            Date: {currentDate}
          </span>
          <span className={'text-[#574b3f]/50'}>|</span>
          <span className={`font-mono uppercase tracking-widest ${
            isHighVis ? 'text-[10px] md:text-xs font-medium text-[#6f6254]' : 'text-[9px] md:text-[10px] text-[#6f6254]'
          }`}>
            Outcome: {formatLikelihoodTierForDisplay(visualizedResult.likelihoodTier)}
          </span>
          <span className={'text-[#574b3f]/50'}>|</span>
          <span className={`font-mono uppercase tracking-widest ${
            isHighVis ? 'text-[10px] md:text-xs font-medium text-[#6f6254]' : 'text-[9px] md:text-[10px] text-[#6f6254]'
          }`}>
            Job ID: {visualizedResult.jobId}
          </span>
        </motion.div>

        {/* Hero: subject, assessment scale, and the rung's phrase over the spectrogram */}
        <div className="relative px-4 py-4 md:py-5 border-b border-[#1b1510]/10">
          {/*
            The assessment subject, above the scale that grades it.

            This and the "Assessment" line below the spectrogram were swapped:
            the subject now opens the block and the word "Assessment" closes it,
            labelling what the reader has just looked at. Both carry the same
            type scale so they read as a matched pair bracketing the result
            rather than as a heading and a caption.
          */}
          <motion.h2
            className={`text-center font-mono uppercase ${HERO_PAIR_TYPE}`}
            style={{
              color: dataStatusColor,
              textShadow: `0 0 20px ${dataStatusColor}40`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ delay: 1.3, duration: 0.5 }}
          >
            {classification}
          </motion.h2>

          {/*
            Every possible outcome across the top, with the one this result
            landed on lit and the rest dimmed. Left to right runs LOW, MEDIUM,
            STRONG, OPTIMAL, matching the direction of every band scale below.
          */}
          {visualizedResult.headlineRung && (
            <motion.div
              className="mb-3 mt-2.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: showContent ? 1 : 0 }}
              transition={{ delay: 1.35, duration: 0.5 }}
            >
              <OptionScale
                options={RUNG_SCALE}
                activeKey={visualizedResult.headlineRung}
                size="lg"
                surface="light"
                ariaLabel="Assessment outcome"
              />
            </motion.div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#1b1510' }}>
            {/*
              The phrase and its colour both come from the rung, so they cannot
              disagree with the lit word on the scale above. Previously the
              phrase read the API's overall_level while the scale read the rung,
              two computations describing one result.
            */}
            <SpectrogramWaveform
              displayText={rungPhrase}
              statusColor={rungColor}
              showContent={showContent}
            />
          </div>

          <motion.div
            className={`text-center font-mono uppercase mt-2 ${HERO_PAIR_TYPE}`}
            style={{ color: '#574b3f' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            Assessment
          </motion.div>
          <p className={`text-center font-mono uppercase tracking-widest mt-0.5 ${
            isSeniorMode ? 'text-sm font-medium text-[#6f6254]' : isHighVis ? 'text-[10px] font-medium text-[#6f6254]' : 'text-[9px] text-[#6f6254]'
          }`}>
            {t("basedOnVocalAnalysis", language)}
          </p>

          {/*
            Offered on the NEEDS OPTIMIZATION rung only. That is the outcome that
            names something to work on without saying what, so it is the one
            where a reader is left without a next step.
          */}
          {rung === "steady" && (
            <RecommendationsPanel
              signs={actionableSigns}
              assessment={pathway === "SPORTS" ? "athletic" : "wellness"}
              showContent={showContent}
              isSeniorMode={isSeniorMode}
            />
          )}
        </div>

        {/*
          Body Map — every real measurement (signals, sub-dimensions, lab
          metrics) grouped under the body-part icon it reads on, replacing the
          three separate Voice Signals / Sub-Dimensions / Biometric Results
          sections that used to list the same data as plain text rows. See
          BodyMapPanel.tsx for the zone grouping and why it is single-column.
        */}
        <div className="px-4 py-3 border-b border-[#1b1510]/10">
          <motion.h3
            className={`font-mono uppercase tracking-widest mb-2 ${
              isHighVis ? 'text-[10px] md:text-xs font-semibold text-[#1b1510]' : 'text-[9px] font-medium text-[#1b1510]'
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ delay: 1.1 }}
          >
            Body Map
            {visualizedResult.totalSignals ? (
              <span className="text-[#574b3f]">
                {" "}· {visualizedResult.flaggedCount ?? 0} of {visualizedResult.totalSignals} flagged
              </span>
            ) : null}
          </motion.h3>
          <BodyMapPanel
            signals={revealSignals}
            extendedMetrics={visualizedResult.extendedMetrics}
            labMetrics={revealLabMetrics}
            showContent={showContent}
            isHighVis={isHighVis}
            isSeniorMode={isSeniorMode}
          />
        </div>

        {/* Returning member: what moved since their previous visit */}
        {voiceHistory.isReturning && voiceHistory.signals.length > 0 && (
          <div className="px-4 py-3 border-b border-[#1b1510]/10">
            <SinceLastVisitPanel
              signals={voiceHistory.signals}
              sessionCount={voiceHistory.sessions.length}
              showContent={showContent}
              isSeniorMode={isSeniorMode}
              onViewHistory={handleViewHistory}
            />
          </div>
        )}

        {/* Care Bridge: Clinical Recommendation Footer */}
        <div className="px-4 py-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 10 }}
            transition={{ duration: 0.5, delay: 1.6 }}
          >
            {/*
              Only the inconclusive recapture card renders here now.

              The monitoring card that sat on the other branch, headed by
              recommended_action ("Clinical follow-up recommended") with a Set
              Reminder button, is out of production: the reminder went nowhere,
              and the headline reads as clinical direction the voice model is not
              in a position to give. Its copy still exists in i18n and
              signal-band, so nothing had to be deleted to take it off screen.
            */}
            {isInconclusiveState ? (
              // Inconclusive State: Recapture Card
              <div 
                className="relative overflow-hidden rounded-lg p-5 md:p-6"
                style={{
                  background: 'rgba(27, 21, 16, 0.9)',
                  border: '1px solid rgba(217, 130, 47, 0.55)',
                }}
              >
                <div className="flex items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-mono text-xs md:text-sm uppercase tracking-widest font-semibold mb-2" style={{ color: '#d9822f' }}>
                      AUDIO QUALITY INSUFFICIENT
                    </h3>
                    <p className="font-mono text-[10px] md:text-xs text-white leading-relaxed mb-4">
                      {visualizedResult.clinicalSubtext || "The audio quality was below acceptable thresholds. Please recapture your voice sample in a quieter environment for optimal results."}
                    </p>
                    
                    {onRecapture && (
                      <button
                        onClick={onRecapture}
                        className={`w-full rounded-lg font-mono uppercase tracking-widest font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                          isSeniorMode ? 'py-5 text-base' : 'py-3 text-xs'
                        }`}
                        style={{
                          background: 'linear-gradient(135deg, #d9822f 0%, #a94e08 100%)',
                          color: 'white',
                          boxShadow: '0 4px 20px rgba(217, 130, 47, 0.3)',
                        }}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <RefreshCw className={isSeniorMode ? 'w-5 h-5' : 'w-4 h-4'} />
                          Recapture Audio Sample
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>

          {/* Secondary Actions */}
          <motion.div
            className="flex flex-col items-center gap-3 mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: showContent ? 1 : 0 }}
            transition={{ duration: 0.5, delay: 1.8 }}
          >
            {hasDetailedReport && !isInconclusiveState && (
              <button
                onClick={handleViewDetailedAnalysis}
                className={`px-6 rounded-lg font-mono uppercase tracking-widest transition-all duration-300 hover:scale-[1.02] ${
                  isSeniorMode
                    ? 'py-4 text-sm font-semibold'
                    : isHighVis
                      ? 'py-3.5 text-xs font-medium'
                      : 'py-2.5 text-[10px]'
                }`}
                style={{
                  backgroundColor: 'rgba(27, 21, 16, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  color: isSeniorMode ? 'rgba(255, 255, 255, 0.95)' : isHighVis ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.6)',
                }}
              >
                View Detailed Analysis →
              </button>
            )}

            <button
              onClick={onReset}
              className={`font-mono uppercase tracking-widest transition-colors ${
                isSeniorMode 
                  ? 'text-sm font-medium text-[#1b1510] hover:text-black' 
                  : isHighVis 
                    ? 'text-xs font-medium text-[#1b1510] hover:text-black' 
                    : 'text-[10px] text-[#6f6254] hover:text-black'
              }`}
            >
              {t("startNewScreening", language)}
            </button>
          </motion.div>
        </div>
      </motion.div>

    </motion.div>
  );
};
