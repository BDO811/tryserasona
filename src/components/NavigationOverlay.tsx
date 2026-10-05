import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Home } from "lucide-react";
import { useAssessment } from "@/context/AssessmentContext";
import { t } from "@/lib/i18n";

type AppState = "home" | "language" | "triage" | "attract" | "capture" | "analysis" | "reveal" | "failed";

interface NavigationOverlayProps {
  appState: AppState;
  triageStep: number;
  onBack: () => void;
  onHomeReset: () => void;
}

export const NavigationOverlay = ({
  appState,
  triageStep,
  onBack,
  onHomeReset,
}: NavigationOverlayProps) => {
  const { language } = useAssessment();
  
  // Hide during analysis animation, language selection, the home screen, and
  // recording (QuestionFlowVisualizer renders its own chrome header there)
  if (appState === "analysis" || appState === "language" || appState === "home" || appState === "capture") return null;

  const showBackButton = appState === "triage" && triageStep > 1;
  const showHomeButton = !(appState === "triage" && triageStep === 1) && appState !== "attract";

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-6 md:p-8 pointer-events-none">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left Side: Logo + Back Button */}
        <div className="flex items-center gap-4 pointer-events-auto">
          <AnimatePresence>
            {showHomeButton && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                onClick={onHomeReset}
                className="group flex items-center gap-2 transition-all duration-300"
                aria-label="Return to home"
              >
                <Home className="w-4 h-4 text-foreground/40 group-hover:text-foreground/60 transition-colors" />
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showBackButton && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                onClick={onBack}
                className="flex items-center gap-1 font-mono text-xs tracking-widest text-foreground/40 hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t("back", language)}</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Right Side: Chrome Headers */}
        <div className="flex items-center gap-6 pointer-events-none">
          <span
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/90 hidden md:block"
            style={{ textShadow: "0 1px 4px rgba(219,204,177,0.9), 0 0 8px rgba(219,204,177,0.7)" }}
          >
            SWARA
          </span>
          <span
            className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/90"
            style={{ textShadow: "0 1px 4px rgba(219,204,177,0.9), 0 0 8px rgba(219,204,177,0.7)" }}
          >
            SWARA // 2026
          </span>
        </div>
      </div>
    </div>
  );
};
