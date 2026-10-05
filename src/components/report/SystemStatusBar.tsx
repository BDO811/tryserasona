import { motion } from "framer-motion";
import { useEffect, useState } from "react";

// Brand color for static UI frame elements
const BRAND_COLOR = "#c2410c";

interface SystemStatusBarProps {
  showContent: boolean;
  /** `audio_sample_rate` off the job, already formatted. */
  sampleRate?: string;
  /** `model_name` off the job. */
  modelName?: string;
}

export const SystemStatusBar = ({ showContent, sampleRate, modelName }: SystemStatusBarProps) => {
  const [blinkOn, setBlinkOn] = useState(true);

  // Blink effect for status indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinkOn((prev) => !prev);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="flex items-center justify-between px-4 py-2 border-b border-[#1b1510]/10 font-mono text-[9px] md:text-[10px] uppercase tracking-wider"
      initial={{ opacity: 0 }}
      animate={{ opacity: showContent ? 1 : 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      {/* Sensor Status - Uses brand color (static UI) */}
      <div className="flex items-center gap-2">
        <motion.span
          className="w-1.5 h-1.5 rounded-full"
          style={{ 
            backgroundColor: BRAND_COLOR,
            boxShadow: blinkOn ? `0 0 8px ${BRAND_COLOR}` : 'none',
          }}
          animate={{ opacity: blinkOn ? 1 : 0.4 }}
          transition={{ duration: 0.15 }}
        />
        <span className="text-[#6f6254]">
          Sensor: <span style={{ color: BRAND_COLOR }}>Active</span>
        </span>
      </div>

      {/* Divider */}
      <span className="hidden md:block text-[#574b3f]/50">|</span>

      {/* Sample Rate */}
      <div className="hidden md:flex items-center gap-2">
        <span className="text-[#6f6254]">
          Sample Rate: <span className="text-[#1b1510] font-medium">{sampleRate || "—"}</span>
        </span>
      </div>

      {/* Divider */}
      <span className="text-[#574b3f]/50">|</span>

      {/* Model Version */}
      <div className="hidden md:flex items-center gap-2">
        <span className="text-[#6f6254]">
          Model: <span className="text-[#1b1510] font-medium">
            {(modelName || "—").toUpperCase()}
          </span>
        </span>
      </div>
    </motion.div>
  );
};
