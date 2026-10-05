import { motion } from "framer-motion";
import { AssessmentPathway } from "@/context/AssessmentContext";
import { LabMetric } from "@/lib/result-types";

interface BiometricLabGridProps {
  pathway: AssessmentPathway;
  statusColor: string;
  showContent: boolean;
  labMetrics?: LabMetric[]; // Required: must come from API result
  isHighVis?: boolean;
  isSeniorMode?: boolean;
}

const getStatusIndicator = (status: "normal" | "elevated" | "low"): { color: string; symbol: string } => {
  // If we have z-score, use it to determine color based on new thresholds
  
  // Fallback to original logic if no z-score
  switch (status) {
    case "elevated":
      return { color: "#F59E0B", symbol: "▲" };
    case "low":
      return { color: "#EF4444", symbol: "▼" };
    default:
      return { color: "#10B981", symbol: "●" };
  }
};

export const BiometricLabGrid = ({ pathway, statusColor, showContent, labMetrics, isHighVis = false, isSeniorMode = false }: BiometricLabGridProps) => {
  // Require labMetrics from API - no fallback to hardcoded data
  if (!labMetrics || labMetrics.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="grid grid-cols-2 md:grid-cols-3 gap-px bg-[#231200]/15 rounded-lg overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: showContent ? 1 : 0 }}
      transition={{ delay: 1.4, duration: 0.5 }}
    >
      {labMetrics.map((metric, index) => {
        const indicator = getStatusIndicator(metric.status);
        
        return (
          <motion.div
            key={`${metric.label}-${index}`}
            className={`bg-black/85 ${
              isSeniorMode ? 'px-3 py-4 md:px-4 md:py-5' : isHighVis ? 'px-2.5 py-3 md:px-3 md:py-3' : 'px-2.5 py-2 md:px-3 md:py-2.5'
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: showContent ? 1 : 0, y: showContent ? 0 : 10 }}
            transition={{ delay: 1.4 + index * 0.05, duration: 0.3 }}
          >
            {/* Label */}
            <span className={`block font-mono uppercase tracking-wider mb-1 ${
              isSeniorMode 
                ? 'text-xs md:text-sm font-semibold text-white' 
                : isHighVis 
                  ? 'text-[9px] md:text-[10px] font-medium text-white' 
                  : 'text-[7px] md:text-[8px] text-white'
            }`}>
              {metric.label}
            </span>
            
            {/* Value Row */}
            <div className="flex items-baseline gap-1">
              <span 
                className={`font-mono leading-none ${
                  isSeniorMode ? 'text-2xl md:text-3xl font-bold' : isHighVis ? 'text-lg md:text-xl font-semibold' : 'text-base md:text-lg font-medium'
                }`}
                style={{ color: indicator.color }}
              >
                {metric.value}
              </span>
              <span className={`font-mono ${
                isSeniorMode ? 'text-sm text-white' : isHighVis ? 'text-[10px] text-white' : 'text-[9px] text-white'
              }`}>
                {metric.unit}
              </span>
              <span 
                className={`font-mono ml-auto ${
                  isSeniorMode ? 'text-sm' : isHighVis ? 'text-[10px]' : 'text-[9px]'
                }`}
                style={{ color: indicator.color }}
              >
                {indicator.symbol}
              </span>
            </div>
            
            {/* Reference Range - Enhanced clinical styling */}
            <span className={`block font-mono tracking-wide border-t border-white/5 pt-1 mt-1 ${
              isSeniorMode 
                ? 'text-sm md:text-base font-medium text-white' 
                : isHighVis 
                  ? 'text-[10px] md:text-xs font-medium text-white' 
                  : 'text-[8px] text-white'
            }`}>
              {index === 0 ? (
                <>
                  <span className="text-white">Typical: </span>
                  {metric.reference}
                </>
              ) : (
                metric.reference
              )}
            </span>
          </motion.div>
        );
      })}
    </motion.div>
  );
};
