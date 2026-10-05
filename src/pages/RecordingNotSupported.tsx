import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { BRAND_COLOR } from "@/context/AssessmentContext";

interface RecordingNotSupportedProps {
  onBack: () => void;
}

export const RecordingNotSupported = ({ onBack }: RecordingNotSupportedProps) => {
  const location = useLocation();
  const reason = (location.state as { reason?: string } | null)?.reason ?? "codec";
  const isPermission = reason === "permission";

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
          background:
            "radial-gradient(circle at 50% 50%, hsla(0, 100%, 50%, 0.03) 0%, transparent 60%)",
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
              background: "rgba(239, 68, 68, 0.1)",
              border: "2px solid rgba(239, 68, 68, 0.3)",
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
          {isPermission ? "Microphone Access Needed" : "Browser Not Supported"}
        </motion.h1>

        <motion.p
          className="font-mono text-sm md:text-base text-black/60 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {isPermission ? (
            <>Swara needs permission to use your microphone to run the voice check-in.</>
          ) : (
            <>
              Voice capture requires <strong className="text-black/80">WebM with Opus</strong> at{" "}
              <strong className="text-black/80">48&nbsp;kHz</strong>, which this browser or device does not support.
            </>
          )}
        </motion.p>

        <motion.p
          className="font-mono text-xs md:text-sm text-black/50 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {isPermission
            ? "Please allow microphone access in your browser's site settings, then try again."
            : "Please use a supported browser (e.g. Chrome, Edge, or Firefox on desktop) and ensure your microphone can record at 48 kHz."}
        </motion.p>

        {/* Back Button */}
        <motion.button
          onClick={onBack}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-lg font-mono text-sm uppercase tracking-widest font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${BRAND_COLOR} 0%, #f2994a 100%)`,
            color: "#000",
            boxShadow: `0 4px 20px ${BRAND_COLOR}40`,
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          whileHover={{ boxShadow: `0 6px 30px ${BRAND_COLOR}60` }}
          whileTap={{ scale: 0.98 }}
        >
          <RefreshCw className="w-5 h-5" />
          <span>Go Back</span>
        </motion.button>

        <motion.p
          className="font-mono text-[10px] text-black/40 mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          {isPermission ? "Required: microphone access" : "Required: audio/webm;codecs=opus at 48 kHz"}
        </motion.p>
      </motion.div>
    </motion.div>
  );
};

export default RecordingNotSupported;
