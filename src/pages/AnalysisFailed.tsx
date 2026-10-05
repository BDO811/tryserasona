import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useAssessment, BRAND_COLOR } from "@/context/AssessmentContext";

interface AnalysisFailedProps {
  onRestart: () => void;
}

export const AnalysisFailed = ({ onRestart }: AnalysisFailedProps) => {
  const { pathwayDisplayTitle, visualizedResult } = useAssessment();
  const assessmentTitle = pathwayDisplayTitle || "Assessment";

  const isInconclusive = visualizedResult?.likelihoodTier === "INCONCLUSIVE";
  const signalQuality = visualizedResult?.signalQuality;

  return (
    <motion.div
      className="relative min-h-screen w-full overflow-hidden bg-background flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Subtle ambient gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, hsla(0, 100%, 50%, 0.03) 0%, transparent 60%)",
        }}
      />

      {/* Main content */}
      <motion.div
        className="relative z-10 w-full max-w-2xl mx-4 md:mx-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        {/* Error Icon */}
        <motion.div
          className="flex justify-center mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
        >
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '2px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
        </motion.div>

        {/* Error Message */}
        <motion.h1
          className="font-mono text-2xl md:text-3xl uppercase tracking-[0.15em] font-semibold mb-4"
          style={{ color: BRAND_COLOR }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {isInconclusive ? "Inconclusive Results" : "Analysis Failed"}
        </motion.h1>

        <motion.p
          className="font-mono text-sm md:text-base text-black/60 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {isInconclusive 
            ? "We were unable to complete a full analysis of your voice sample."
            : `We encountered an issue while processing your ${assessmentTitle.toLowerCase()} assessment.`
          }
        </motion.p>

        <motion.p
          className="font-mono text-xs md:text-sm text-black/50 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {isInconclusive
            ? "Audio quality metrics are available below. Please try recording again with better audio conditions."
            : "This may be due to audio quality, network connectivity, or a temporary service issue."
          }
        </motion.p>

        {/* Audio Quality Metrics for Inconclusive Results */}
        {isInconclusive && signalQuality && (
          <motion.div
            className="w-full max-w-md mb-6 rounded-lg p-4"
            style={{ background: "rgba(11, 11, 10, 0.9)", border: "1px solid rgba(255,255,255,0.1)" }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-white mb-3">
              Recording quality
            </h3>

            {/*
              The two fields the v2 API actually reports, with the thresholds the
              docs publish for them: voice_percentage below 30 corresponds to
              insufficient_speech, audio_clarity below 50 to
              high_background_noise.

              This block previously showed PESQ and STOI against thresholds of
              1.1 and 0.5. Those are v1 fields; v2 never returns them, so the
              rows could not render and the screen showed no reason at all.
            */}
            {signalQuality.voicePercentage !== undefined &&
              (() => {
                const pct = signalQuality.voicePercentage * 100;
                const ok = pct >= 30;
                return (
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="font-mono text-[11px] text-white">Speech detected</span>
                    <span className="flex items-center gap-2">
                      <span
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: ok ? "#4CAF6E" : "#FF6173" }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                      <span className="font-mono text-[9px] text-white">(needs 30%)</span>
                      {ok ? (
                        <CheckCircle className="w-3 h-3" style={{ color: "#4CAF6E" }} />
                      ) : (
                        <XCircle className="w-3 h-3" style={{ color: "#FF6173" }} />
                      )}
                    </span>
                  </div>
                );
              })()}

            {signalQuality.audioClarity !== undefined &&
              (() => {
                const ok = signalQuality.audioClarity >= 50;
                return (
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <span className="font-mono text-[11px] text-white">Background noise</span>
                    <span className="flex items-center gap-2">
                      <span
                        className="font-mono text-[11px] tabular-nums"
                        style={{ color: ok ? "#4CAF6E" : "#FF6173" }}
                      >
                        {signalQuality.audioClarity.toFixed(1)} / 100
                      </span>
                      <span className="font-mono text-[9px] text-white">(needs 50)</span>
                      {ok ? (
                        <CheckCircle className="w-3 h-3" style={{ color: "#4CAF6E" }} />
                      ) : (
                        <XCircle className="w-3 h-3" style={{ color: "#FF6173" }} />
                      )}
                    </span>
                  </div>
                );
              })()}

            {/* The API's own issue codes, which name the problem directly. */}
            {signalQuality.issues && signalQuality.issues.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <span className="font-mono text-[9px] uppercase tracking-wider text-white block mb-1">
                  Reported
                </span>
                <span className="font-mono text-[11px] text-white">
                  {signalQuality.issues.map((code) => code.replace(/_/g, " ")).join(" · ")}
                </span>
              </div>
            )}

            <p className="font-mono text-[10px] text-white leading-relaxed mt-3">
              {signalQuality.duration.toFixed(1)}s recorded. Records of at least 15 seconds
              are accepted; 20 seconds or more is the range the models are tuned for.
            </p>
          </motion.div>
        )}

        {/* Restart Button */}
        <motion.button
          onClick={onRestart}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-lg font-mono text-sm uppercase tracking-widest font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${BRAND_COLOR} 0%, #00D4FF 100%)`,
            color: '#000',
            boxShadow: `0 4px 20px ${BRAND_COLOR}40`,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isInconclusive ? 0.9 : 0.7 }}
          whileHover={{ boxShadow: `0 6px 30px ${BRAND_COLOR}60` }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className="w-5 h-5" />
          <span>Restart Capture</span>
        </motion.button>

        {/* Help Text */}
        <motion.p
          className="font-mono text-[10px] text-black/40 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: isInconclusive ? 1.0 : 0.8 }}
        >
          Please ensure you have a stable internet connection and try again.
        </motion.p>
      </motion.div>
    </motion.div>
  );
};

export default AnalysisFailed;
