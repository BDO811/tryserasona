import { useState, useCallback, useEffect } from "react";
import { ParticleOrb } from "@/components/ParticleOrb";
import { QuestionFlowVisualizer } from "@/components/QuestionFlowVisualizer";
import { AnalysisAnimation, ArchetypeData } from "@/components/AnalysisAnimation";
import { HealthProfile } from "@/components/HealthProfile";
import { TriageFlow, TriageData } from "@/components/TriageFlow";
import { LanguageSelector } from "@/components/LanguageSelector";
import { TrySwaraHome } from "@/components/TrySwaraHome";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import { AnalysisFailed } from "@/pages/AnalysisFailed";
import { useAssessment, HEALTH_FOCUS_TO_PATHWAY } from "@/context/AssessmentContext";

type AppState = "home" | "language" | "triage" | "attract" | "capture" | "analysis" | "reveal" | "failed";

const Index = () => {
  const { pathway, isFastTrack, setPathway, setUserProfile, reset: resetAssessment, audioBlob, setApiStatus, setApiResult, apiStatus, visualizedResult, selectedArchetype, setSelectedArchetype } = useAssessment();
  const [appState, setAppState] = useState<AppState>("home");
  const [triageStep, setTriageStep] = useState(1);
  const [externalTriageStep, setExternalTriageStep] = useState<number | undefined>(undefined);
  const [triageKey, setTriageKey] = useState(0);

  useEffect(() => {
    if (apiStatus === "failed" && appState === "capture") {
      setAppState("failed");
    }
  }, [apiStatus, appState]);

  useEffect(() => {
    if (isFastTrack && pathway) {
      setAppState("capture");
    }
  }, [isFastTrack, pathway]);

  useEffect(() => {
    if (visualizedResult && selectedArchetype) {
      setAppState("reveal");
    }
  }, [visualizedResult, selectedArchetype]);

  const handleHomeComplete = useCallback(() => {
    setAppState("language");
  }, []);

  const handleLanguageComplete = useCallback(() => {
    setAppState("triage");
  }, []);

  const handleTriageComplete = useCallback((data: TriageData) => {
    setUserProfile({
      biologicalSex: data.biologicalSex,
      ageRange: data.ageRange,
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      consentGiven: data.consentGiven,
    });
    // Pathway follows the health focus picked in step 3, which in turn selects
    // which Amplifier v2 model the audio is sent to.
    setPathway(HEALTH_FOCUS_TO_PATHWAY[data.healthFocus] ?? "WELLNESS");
    setAppState("capture");
  }, [setPathway, setUserProfile]);

  const handleRecordingComplete = useCallback(() => {
    setAppState("analysis");
  }, []);

  const handleAnalysisComplete = useCallback((archetype: ArchetypeData) => {
    setSelectedArchetype(archetype);
    setAppState("reveal");
  }, []);

  const handleAnalysisFailed = useCallback(() => {
    setAppState("failed");
  }, []);

  const handleReset = useCallback(() => {
    setSelectedArchetype(null);
    setTriageStep(1);
    setExternalTriageStep(undefined);
    setTriageKey(prev => prev + 1);
    resetAssessment();
    setAppState("home");
  }, [resetAssessment, setSelectedArchetype]);

  const handleRestartCapture = useCallback(() => {
    setApiStatus(null);
    setSelectedArchetype(null);
    setAppState("capture");
  }, [setApiStatus, setSelectedArchetype]);

  const handleNavBack = useCallback(() => {
    if (appState === "triage" && triageStep > 1) {
      const newStep = triageStep - 1;
      setExternalTriageStep(newStep);
      setTriageStep(newStep);
    }
  }, [appState, triageStep]);

  const handleHomeReset = useCallback(() => {
    setSelectedArchetype(null);
    setTriageStep(1);
    setExternalTriageStep(1);
    setTriageKey(prev => prev + 1);
    resetAssessment();
    setAppState("home");
  }, [resetAssessment, setSelectedArchetype]);

  const handleTriageStepChange = useCallback((step: number) => {
    setTriageStep(step);
    if (externalTriageStep !== undefined) {
      setExternalTriageStep(undefined);
    }
  }, [externalTriageStep]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Navigation Overlay */}
      <NavigationOverlay
        appState={appState}
        triageStep={triageStep}
        onBack={handleNavBack}
        onHomeReset={handleHomeReset}
      />

      {/* Subtle ambient gradient */}
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, hsla(183, 100%, 50%, 0.03) 0%, transparent 60%)",
        }}
      />

      {/* Full-screen swap between steps. Deliberately NOT wrapped in AnimatePresence:
          with this many top-level states swapping in quick succession, framer-motion's
          exit-completion tracking would get stuck (an outgoing screen would
          stay mounted at full opacity forever, bleeding through behind whatever screen
          came after it). Each screen still gets its own enter fade; React unmounts the
          outgoing one immediately, which is what actually keeps this reliable. */}
      {appState === "home" && (
        <div
          key="home"
          className="absolute inset-0 animate-screen-in"
        >
          <TrySwaraHome onComplete={handleHomeComplete} />
        </div>
      )}

      {appState === "language" && (
        <div
          key="language"
          className="absolute inset-0 animate-screen-in"
        >
          {/* Background orb */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <ParticleOrb onClick={() => {}} />
          </div>
          <LanguageSelector onComplete={handleLanguageComplete} />
        </div>
      )}

      {appState === "triage" && (
        <div
          key="triage"
          className="absolute inset-0 animate-screen-in"
        >
          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
            <ParticleOrb onClick={() => {}} />
          </div>
          <TriageFlow
            key={triageKey}
            onComplete={handleTriageComplete}
            onStepChange={handleTriageStepChange}
            externalStep={externalTriageStep}
          />
        </div>
      )}

      {appState === "capture" && (
        <div
          key="capture"
          className="absolute inset-0 animate-screen-in"
        >
          <QuestionFlowVisualizer onComplete={handleRecordingComplete} />
        </div>
      )}

      {appState === "analysis" && (
        <div
          key="analysis"
          className="absolute inset-0 animate-screen-in"
        >
          <AnalysisAnimation
            onComplete={handleAnalysisComplete}
            onFailed={handleAnalysisFailed}
          />
        </div>
      )}

      {appState === "reveal" && selectedArchetype && (
        <div
          key="reveal"
          className="absolute inset-0 overflow-y-auto animate-screen-in"
        >
          <HealthProfile
            archetype={selectedArchetype}
            onReset={handleReset}
            onRecapture={handleRestartCapture}
          />
        </div>
      )}

      {appState === "failed" && (
        <div
          key="failed"
          className="absolute inset-0 animate-screen-in"
        >
          <AnalysisFailed onRestart={handleRestartCapture} />
        </div>
      )}
    </div>
  );
};

export default Index;
