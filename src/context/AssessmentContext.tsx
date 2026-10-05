import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { VisualizedResult } from "@/lib/result-types";
import { Language } from "@/lib/i18n";

export type AssessmentPathway =
  | "BRAIN_AGE"
  | "LONGEVITY"
  | "MENTAL_HEALTH"
  | "FERTILITY"
  | "WELLNESS"
  | "SPORTS"
  | null;

export interface PathwayConfig {
  id: AssessmentPathway;
  title: string;
  color: string;
  colorHSL: string;
  metadata: {
    topLeft: { label: string; value: string };
    topRight: { label: string; value: string };
    bottomLeft: { label: string; value: string };
    bottomRight: { label: string; value: string };
  };
}

// Unified Brand Color
export const BRAND_COLOR = "#1E5631";
export const BRAND_COLOR_HSL = "140 48% 23%";

export const SAMPLE_RATE_LABEL = "48kHz";

const DEFAULT_PATHWAY_METADATA: PathwayConfig["metadata"] = {
  topLeft: { label: "SIGNAL", value: "ACTIVE" },
  topRight: { label: "CHANNEL", value: "MONO" },
  bottomLeft: { label: "ANALYSIS", value: "UNDERWAY" },
  bottomRight: { label: "SAMPLE", value: SAMPLE_RATE_LABEL },
};

export const PATHWAY_CONFIGS: Record<NonNullable<AssessmentPathway>, PathwayConfig> = {
  BRAIN_AGE: {
    id: "BRAIN_AGE",
    title: "Establish your Cognitive Baseline.",
    color: BRAND_COLOR,
    colorHSL: BRAND_COLOR_HSL,
    metadata: DEFAULT_PATHWAY_METADATA,
  },
  LONGEVITY: {
    id: "LONGEVITY",
    title: "Measure your Vitality Score.",
    color: BRAND_COLOR,
    colorHSL: BRAND_COLOR_HSL,
    metadata: DEFAULT_PATHWAY_METADATA,
  },
  MENTAL_HEALTH: {
    id: "MENTAL_HEALTH",
    title: "Assess your Emotional Resonance.",
    color: BRAND_COLOR,
    colorHSL: BRAND_COLOR_HSL,
    metadata: DEFAULT_PATHWAY_METADATA,
  },
  FERTILITY: {
    id: "FERTILITY",
    title: "Analyze Hormonal Vocal Correlates.",
    color: BRAND_COLOR,
    colorHSL: BRAND_COLOR_HSL,
    metadata: DEFAULT_PATHWAY_METADATA,
  },
  WELLNESS: {
    id: "WELLNESS",
    title: "Wellness Check",
    color: BRAND_COLOR,
    colorHSL: BRAND_COLOR_HSL,
    metadata: {
      topLeft: { label: "METABOLIC", value: "SCAN" },
      topRight: { label: "RESPIRATORY", value: "DETECT" },
      bottomLeft: { label: "STAMINA", value: "MEASURE" },
      bottomRight: { label: "SAMPLE", value: SAMPLE_RATE_LABEL },
    },
  },
  // Athletic readiness, run against the apex model: head impact, cognitive
  // load, cardiovascular strain, plus the shared load signs.
  SPORTS: {
    id: "SPORTS",
    title: "Check your Athletic Readiness.",
    color: BRAND_COLOR,
    colorHSL: BRAND_COLOR_HSL,
    metadata: {
      topLeft: { label: "LOAD", value: "SCAN" },
      topRight: { label: "RECOVERY", value: "DETECT" },
      bottomLeft: { label: "STRAIN", value: "MEASURE" },
      bottomRight: { label: "SAMPLE", value: SAMPLE_RATE_LABEL },
    },
  },
};

export type AgeRange = "under30" | "30-45" | "46-60" | "60+";

export interface UserProfile {
  biologicalSex?: "male" | "female";
  ageRange?: AgeRange;
  fullName?: string;
  email?: string;
  phone?: string;
  consentGiven?: boolean;
}

export const getIsHighVis = (ageRange?: AgeRange): boolean => {
  return ageRange === "60+" || ageRange === "46-60";
};

export const getIsSeniorMode = (ageRange?: AgeRange): boolean => {
  return ageRange === "60+";
};

interface AssessmentContextType {
  language: Language;
  pathway: AssessmentPathway;
  pathwayConfig: PathwayConfig | null;
  pathwayDisplayTitle: string | null;
  pathwayDisplaySubtitle: string | null;
  userProfile: UserProfile;
  isHighVis: boolean;
  isSeniorMode: boolean;
  isFastTrack: boolean;
  audioBlob: Blob | null;
  apiResult: any | null;
  apiStatus: "pending" | "processing" | "completed" | "done" | "failed" | null;
  visualizedResult: VisualizedResult | null;
  selectedArchetype: any | null;
  completedAssessments: NonNullable<AssessmentPathway>[];
  setLanguage: (lang: Language) => void;
  setPathway: (pathway: AssessmentPathway) => void;
  setPathwayDisplayInfo: (title: string, subtitle: string) => void;
  setUserProfile: (profile: UserProfile) => void;
  setAudioBlob: (blob: Blob | null) => void;
  setApiResult: (result: any | null) => void;
  setApiStatus: (status: "pending" | "processing" | "completed" | "done" | "failed" | null) => void;
  setVisualizedResult: (result: VisualizedResult | null) => void;
  setSelectedArchetype: (archetype: any | null) => void;
  markAssessmentComplete: (pathway: NonNullable<AssessmentPathway>) => void;
  isAssessmentCompleted: (pathway: NonNullable<AssessmentPathway>) => boolean;
  reset: () => void;
}

const AssessmentContext = createContext<AssessmentContextType | null>(null);

const PATHWAY_MAP: Record<string, AssessmentPathway> = {
  brain: "BRAIN_AGE",
  longevity: "LONGEVITY",
  mental: "MENTAL_HEALTH",
  fertility: "FERTILITY",
  wellness: "WELLNESS",
};

const HEALTH_FOCUS_TO_PATHWAY: Record<string, AssessmentPathway> = {
  cognitive: "BRAIN_AGE",
  longevity: "LONGEVITY",
  mood: "MENTAL_HEALTH",
  reproductive: "FERTILITY",
  wellness: "WELLNESS",
  sports: "SPORTS",
};

export const AssessmentProvider = ({ children }: { children: ReactNode }) => {
  const [searchParams] = useSearchParams();
  const [language, setLanguageState] = useState<Language>("en");
  const [pathway, setPathwayState] = useState<AssessmentPathway>(null);
  const [pathwayDisplayTitle, setPathwayDisplayTitle] = useState<string | null>(null);
  const [pathwayDisplaySubtitle, setPathwayDisplaySubtitle] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile>({});
  const [isFastTrack, setIsFastTrack] = useState(false);
  const [audioBlob, setAudioBlobState] = useState<Blob | null>(null);
  const [apiResult, setApiResultState] = useState<any | null>(null);
  const [apiStatus, setApiStatusState] = useState<"pending" | "processing" | "completed" | "done" | "failed" | null>(null);
  const [visualizedResult, setVisualizedResultState] = useState<VisualizedResult | null>(null);
  const [selectedArchetype, setSelectedArchetypeState] = useState<any | null>(null);
  const [completedAssessments, setCompletedAssessments] = useState<NonNullable<AssessmentPathway>[]>([]);

  const pathwayConfig = pathway ? PATHWAY_CONFIGS[pathway] : null;
  const isHighVis = getIsHighVis(userProfile.ageRange);
  const isSeniorMode = getIsSeniorMode(userProfile.ageRange);

  useEffect(() => {
    const pathwayParam = searchParams.get("pathway");
    if (pathwayParam && PATHWAY_MAP[pathwayParam]) {
      setPathwayState(PATHWAY_MAP[pathwayParam]);
      setIsFastTrack(true);
    }
  }, [searchParams]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const setPathway = useCallback((newPathway: AssessmentPathway) => {
    setPathwayState(newPathway);
  }, []);

  const setPathwayDisplayInfo = useCallback((title: string, subtitle: string) => {
    setPathwayDisplayTitle(title);
    setPathwayDisplaySubtitle(subtitle);
  }, []);

  const setAudioBlob = useCallback((blob: Blob | null) => {
    setAudioBlobState(blob);
  }, []);

  const setApiResult = useCallback((result: any | null) => {
    setApiResultState(result);
  }, []);

  const setApiStatus = useCallback((status: "pending" | "processing" | "completed" | "done" | "failed" | null) => {
    setApiStatusState(status);
  }, []);

  const setVisualizedResult = useCallback((result: VisualizedResult | null) => {
    setVisualizedResultState(result);
  }, []);

  const setSelectedArchetype = useCallback((archetype: any | null) => {
    setSelectedArchetypeState(archetype);
  }, []);

  const markAssessmentComplete = useCallback((assessmentPathway: NonNullable<AssessmentPathway>) => {
    setCompletedAssessments(prev => {
      if (prev.includes(assessmentPathway)) return prev;
      return [...prev, assessmentPathway];
    });
  }, []);

  const isAssessmentCompleted = useCallback((assessmentPathway: NonNullable<AssessmentPathway>) => {
    return completedAssessments.includes(assessmentPathway);
  }, [completedAssessments]);

  const reset = useCallback(() => {
    setPathwayState(null);
    setPathwayDisplayTitle(null);
    setPathwayDisplaySubtitle(null);
    setUserProfile({});
    setIsFastTrack(false);
    setAudioBlobState(null);
    setApiResultState(null);
    setApiStatusState(null);
    setVisualizedResultState(null);
    setSelectedArchetypeState(null);
    // Note: language and completedAssessments persist across resets
  }, []);

  return (
    <AssessmentContext.Provider
      value={{
        language,
        pathway,
        pathwayConfig,
        pathwayDisplayTitle,
        pathwayDisplaySubtitle,
        userProfile,
        isHighVis,
        isSeniorMode,
        isFastTrack,
        audioBlob,
        apiResult,
        apiStatus,
        visualizedResult,
        selectedArchetype,
        completedAssessments,
        setLanguage,
        setPathway,
        setPathwayDisplayInfo,
        setUserProfile,
        setAudioBlob,
        setApiResult,
        setApiStatus,
        setVisualizedResult,
        setSelectedArchetype,
        markAssessmentComplete,
        isAssessmentCompleted,
        reset,
      }}
    >
      {children}
    </AssessmentContext.Provider>
  );
};

export const useAssessment = () => {
  const context = useContext(AssessmentContext);
  if (!context) {
    throw new Error("useAssessment must be used within AssessmentProvider");
  }
  return context;
};

export { HEALTH_FOCUS_TO_PATHWAY };
