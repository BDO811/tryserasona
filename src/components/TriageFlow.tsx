import { useState, useCallback, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Mail, Smartphone, Loader2, Zap, Heart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useAssessment, getIsSeniorMode } from "@/context/AssessmentContext";
import { isDeveloperModeEnabled, isPathwayEnabled } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { asset } from "@/lib/asset";
import { notifyLead } from "@/lib/notify-lead-client";

export interface TriageData {
  biologicalSex: "male" | "female";
  ageRange: "under30" | "30-45" | "46-60" | "60+";
  healthFocus: "wellness" | "sports";
  fullName: string;
  email: string;
  phone: string;
  consentGiven: boolean;
}

interface HealthFocusOption {
  id: TriageData["healthFocus"];
  label: string;
  subtitle: string;
  icon: typeof Heart;
}

/**
 * The health-focus cards. Two are offered, each running a different v2 model:
 *
 *   Wellness  ->  pulse   mood disruption, anxiety, stress, fatigue,
 *                         dehydration, elevated blood pressure
 *   Sports    ->  apex    head impact, cognitive load, cardiovascular strain,
 *                         plus fatigue, dehydration, stress and anxiety
 *
 * The pathway picks the model, and the model decides which signs come back.
 * Signs the two share are scored identically for the same audio, so the
 * assessments differ by what they report rather than by rescoring.
 */
const getDynamicPathways = (
  _age: TriageData["ageRange"] | undefined
): HealthFocusOption[] => {
  const wellness: HealthFocusOption = {
    id: "wellness",
    icon: Heart,
    label: "Wellness",
    subtitle: "Mood & Vitality",
  };

  const sports: HealthFocusOption = {
    id: "sports",
    icon: Zap,
    label: "Sports",
    subtitle: "Load & Recovery",
  };

  // Only offer a focus the analysis step will actually accept. Without this
  // filter a disabled pathway still rendered a card, and picking it failed the
  // run with a bare "ANALYSIS FAILED" after the user had already recorded.
  const enabled = [wellness, sports].filter((p) => isPathwayEnabled(p.id));
  return enabled.length > 0 ? enabled : [wellness];
};

interface TriageFlowProps {
  onComplete: (data: TriageData) => void;
  onStepChange?: (step: number) => void;
  externalStep?: number;
}

export const TriageFlow = ({ onComplete, onStepChange, externalStep }: TriageFlowProps) => {
  const { setPathwayDisplayInfo, language } = useAssessment();
  const [step, setStepInternal] = useState(1);
  const [data, setData] = useState<Partial<TriageData>>({});
  
  const isSeniorMode = getIsSeniorMode(data.ageRange);
  const isHighVis = data.ageRange === "60+" || data.ageRange === "46-60";
  
  // Step 3: Profile form state
  const [formData, setFormData] = useState({ fullName: '', email: '', phone: '' });
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; email?: string; phone?: string }>({});
  const [shakeField, setShakeField] = useState<'fullName' | 'email' | 'phone' | null>(null);
  const isDeveloperMode = isDeveloperModeEnabled();

  const setStep = useCallback((newStep: number | ((prev: number) => number)) => {
    setStepInternal((prev) => {
      const nextStep = typeof newStep === 'function' ? newStep(prev) : newStep;
      return nextStep;
    });
  }, []);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    if (externalStep !== undefined && externalStep !== step) {
      setStepInternal(externalStep);
    }
  }, [externalStep, step]);

  const handleSexSelect = useCallback((sex: "male" | "female") => {
    setData((prev) => ({ ...prev, biologicalSex: sex }));
    setTimeout(() => setStep(2), 400);
  }, []);

  const handleAgeSelect = useCallback((age: TriageData["ageRange"]) => {
    setData((prev) => ({ ...prev, ageRange: age }));
    setTimeout(() => setStep(3), 400);
  }, []);

  const handleFocusSelect = useCallback(
    (focus: TriageData["healthFocus"], displayLabel: string, displaySubtitle: string) => {
      setData((prev) => ({ ...prev, healthFocus: focus }));
      // The card's own wording carries through to the report header, so an
      // under-30 who picked "Performance" does not see "Longevity" on their result.
      setPathwayDisplayInfo(displayLabel, displaySubtitle);
      setTimeout(() => setStep(4), 400);
    },
    [setPathwayDisplayInfo]
  );

  const dynamicPathways = useMemo(
    () => getDynamicPathways(data.ageRange),
    [data.ageRange]
  );

  const validateForm = () => {
    const newErrors: { fullName?: string; email?: string; phone?: string } = {};
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = t("nameRequired", language);
    }
    
    if (!formData.email.trim()) {
      newErrors.email = t("emailRequired", language);
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t("emailRequired", language);
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = t("phoneRequired", language);
    } else {
      const digitsOnly = formData.phone.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        newErrors.phone = t("phoneRequired", language);
      }
    }
    
    setErrors(newErrors);
    
    if (newErrors.fullName) {
      setShakeField('fullName');
      setTimeout(() => setShakeField(null), 500);
    } else if (newErrors.email) {
      setShakeField('email');
      setTimeout(() => setShakeField(null), 500);
    } else if (newErrors.phone) {
      setShakeField('phone');
      setTimeout(() => setShakeField(null), 500);
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm() || !consentGiven) return;
    
    setIsSubmitting(true);
    const finalData: TriageData = {
      biologicalSex: data.biologicalSex!,
      ageRange: data.ageRange!,
      healthFocus: data.healthFocus!,
      fullName: formData.fullName.trim(),
      email: formData.email.trim(),
      phone: formData.phone.trim(),
      consentGiven,
    };
    

    // Save to Firestore and email on every submission. Fire and forget: a
    // notification failure must never block someone starting their recording.
    notifyLead({
      fullName: finalData.fullName,
      email: finalData.email,
      phone: finalData.phone,
      healthFocus: finalData.healthFocus,
      biologicalSex: finalData.biologicalSex,
      ageRange: finalData.ageRange,
      language,
      consentGiven: finalData.consentGiven,
    });

    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'CompleteRegistration', {
        content_name: 'wellness',
        content_category: 'Screening',
      });
    }
    
    onComplete(finalData);
  };

  const handleBypassForm = useCallback(async () => {
    if (!isDeveloperMode) return;
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const finalData: TriageData = {
      biologicalSex: data.biologicalSex!,
      ageRange: data.ageRange!,
      healthFocus: data.healthFocus!,
      fullName: '',
      email: '',
      phone: '',
      consentGiven: true,
    };
    
    onComplete(finalData);
  }, [data, onComplete]);

  const handleInputChange = (field: 'fullName' | 'email' | 'phone') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const isFormValid = consentGiven && formData.fullName.trim() && formData.email.trim() && formData.phone.trim();

  const shakeAnimation = {
    shake: {
      x: [0, -8, 8, -8, 8, -4, 4, 0],
      transition: { duration: 0.4 }
    }
  };

  const totalSteps = 4;

  const STEP_BACKGROUNDS = [asset("images/wellness-call.jpg"), asset("images/wellness-calm.jpg"), asset("images/voice-conversation.jpg"), asset("images/voice-studio.jpg")];

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 z-10 overflow-hidden" style={{ backgroundColor: "#fbf7f1" }}>
      {/* Background photo, washed with the brand beige so the card stays legible;
          changes per step. Deliberately NOT wrapped in AnimatePresence: under
          mode="sync" the outgoing layer never completes its exit, so each step
          stacked another image at 0.45 opacity and washed the card out. One
          layer with a CSS crossfade on the image gives the same effect and
          cannot accumulate. */}
      <div
        className="absolute inset-0 bg-cover bg-center pointer-events-none"
        style={{
          backgroundImage: `url(${STEP_BACKGROUNDS[(step - 1) % STEP_BACKGROUNDS.length]})`,
          opacity: 0.45,
        }}
      />
      <div className="absolute inset-0" style={{ backgroundColor: "#fbf7f1", opacity: 0.4 }} />

      {/* Plain div, not a motion.div: the card's framer-motion entry animation
          was observed freezing partway (stuck at ~0.31 opacity, washing the card
          out entirely). The card is always visible; it does not need to animate. */}
      <div
        className="w-full max-w-[500px] rounded-2xl bg-black/[0.92] p-8 backdrop-blur-md relative"
      >
        {/* Chrome Headers */}
        <div className="flex items-center justify-between mb-2">
          <img src={asset("brand/serasona-mark-paper.svg")} alt="Serasona" className="h-5 w-auto" />
          <span className="font-mono text-xs tracking-[0.2em] uppercase text-[#fbf7f1]/85">
            SERASONA // 2026
          </span>
        </div>

        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#fbf7f1]/20 overflow-hidden rounded-t-2xl">
          <motion.div
            className="h-full"
            style={{ backgroundColor: "#c2410c" }}
            initial={{ width: "33%" }}
            animate={{
              width: `${(step / totalSteps) * 100}%`,
              boxShadow: [
                "0 0 4px #c2410c, 0 0 8px #c2410c",
                "0 0 14px #c2410c, 0 0 26px #c2410c",
                "0 0 4px #c2410c, 0 0 8px #c2410c",
              ],
            }}
            transition={{
              width: { duration: 0.4, ease: "easeOut" },
              boxShadow: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        </div>

        {/* Step Indicator */}
        <div className="text-center mb-8 mt-2">
          <span className="font-mono text-xs tracking-[0.2em] text-[#fbf7f1]/50 uppercase">
            {t("stepOf", language)} {step} / {totalSteps}
          </span>
        </div>

        {/* No AnimatePresence around the step switcher. Under mode="sync" the
            outgoing step never completed its exit, so all four steps piled up in
            the card and it grew past the viewport. Each step keeps its own
            enter-fade; React unmounts the previous one immediately. */}
        {/* Step 1: Biological Sex */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-10"
            >
              <h2 className="font-serif text-3xl md:text-4xl text-center text-[#fbf7f1] leading-snug italic w-full">
    {t("personalizeScreening", language)}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <OptionButton label={t("male", language)} onClick={() => handleSexSelect("male")} />
                <OptionButton label={t("female", language)} onClick={() => handleSexSelect("female")} />
              </div>
            </motion.div>
          )}

          {/* Step 2: Age Range */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-10"
            >
              <h2 className="font-serif text-3xl md:text-4xl text-center text-[#fbf7f1] leading-snug italic w-full">
    {t("selectAgeBracket", language)}
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <OptionButton label="18–30" onClick={() => handleAgeSelect("under30")} />
                <OptionButton label="30–45" onClick={() => handleAgeSelect("30-45")} />
                <OptionButton label="46–60" onClick={() => handleAgeSelect("46-60")} />
                <OptionButton label="60+" onClick={() => handleAgeSelect("60+")} />
              </div>
            </motion.div>
          )}

          {/* Step 3: Health Focus */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-10 w-full"
            >
              <h2 className={`font-serif text-center text-[#fbf7f1] leading-snug italic w-full ${
                isSeniorMode ? 'text-3xl md:text-4xl font-medium' : 'text-3xl md:text-4xl'
              }`}>
                {t("primaryHealthFocus", language)}
              </h2>

              <div className={`grid grid-cols-2 ${isSeniorMode ? 'gap-5' : 'gap-4'}`}>
                {dynamicPathways.map((option) => (
                  <FocusCard
                    key={option.id}
                    icon={option.icon}
                    label={option.label}
                    subtitle={option.subtitle}
                    onClick={() => handleFocusSelect(option.id, option.label, option.subtitle)}
                    isHighVis={isHighVis}
                    isSeniorMode={isSeniorMode}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4: Profile & Consent */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-6"
            >
              <div className="text-center mb-2">
                <h2 className={`font-serif text-[#fbf7f1] leading-snug italic mb-3 ${
                  isSeniorMode ? 'text-2xl md:text-3xl font-medium' : 'text-2xl md:text-3xl'
                }`}>
                  {t("secureSession", language)}
                </h2>
                <p className={`text-[#fbf7f1]/65 leading-relaxed ${
                  isSeniorMode ? 'text-base' : 'text-sm'
                }`}>
                  {t("consentDescription", language)}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Full Name */}
                <div className="space-y-2">
                  <label className={`font-medium tracking-wider text-[#fbf7f1]/65 uppercase ${
                    isSeniorMode ? 'text-sm' : 'text-xs'
                  }`}>
                    {t("fullName", language)}
                  </label>
                  <motion.div
                    variants={shakeAnimation}
                    animate={shakeField === 'fullName' ? 'shake' : undefined}
                  >
                    <Input
                      type="text"
                      value={formData.fullName}
                      onChange={handleInputChange('fullName')}
                      placeholder={t("enterFullName", language)}
                      className={`bg-transparent border-b border-t-0 border-l-0 border-r-0 rounded-none text-[#fbf7f1] placeholder:text-[#fbf7f1]/40 focus:ring-0 transition-colors ${
                        errors.fullName ? 'border-destructive focus:border-destructive' : 'border-[#fbf7f1]/25 focus:border-[#fbf7f1]/60'
                      } ${isSeniorMode ? 'h-16 text-lg' : 'h-12'}`}
                    />
                  </motion.div>
                  {errors.fullName && (
                    <motion.p 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-destructive ${isSeniorMode ? 'text-sm' : 'text-xs'}`}
                    >
                      {errors.fullName}
                    </motion.p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className={`font-medium tracking-wider text-[#fbf7f1]/65 uppercase flex items-center gap-2 ${
                    isSeniorMode ? 'text-sm' : 'text-xs'
                  }`}>
                    <Mail className={isSeniorMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    {t("emailAddress", language)}
                  </label>
                  <motion.div
                    variants={shakeAnimation}
                    animate={shakeField === 'email' ? 'shake' : undefined}
                  >
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange('email')}
                      placeholder={t("enterEmail", language)}
                      className={`bg-transparent border-b border-t-0 border-l-0 border-r-0 rounded-none text-[#fbf7f1] placeholder:text-[#fbf7f1]/40 focus:ring-0 transition-colors ${
                        errors.email ? 'border-destructive focus:border-destructive' : 'border-[#fbf7f1]/25 focus:border-[#fbf7f1]/60'
                      } ${isSeniorMode ? 'h-16 text-lg' : 'h-12'}`}
                    />
                  </motion.div>
                  {errors.email && (
                    <motion.p 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-destructive ${isSeniorMode ? 'text-sm' : 'text-xs'}`}
                    >
                      {errors.email}
                    </motion.p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className={`font-medium tracking-wider text-[#fbf7f1]/65 uppercase flex items-center gap-2 ${
                    isSeniorMode ? 'text-sm' : 'text-xs'
                  }`}>
                    <Smartphone className={isSeniorMode ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
                    {t("phoneNumber", language)}
                  </label>
                  <motion.div
                    variants={shakeAnimation}
                    animate={shakeField === 'phone' ? 'shake' : undefined}
                  >
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={handleInputChange('phone')}
                      placeholder={t("enterPhone", language)}
                      className={`bg-transparent border-b border-t-0 border-l-0 border-r-0 rounded-none text-[#fbf7f1] placeholder:text-[#fbf7f1]/40 focus:ring-0 transition-colors ${
                        errors.phone ? 'border-destructive focus:border-destructive' : 'border-[#fbf7f1]/25 focus:border-[#fbf7f1]/60'
                      } ${isSeniorMode ? 'h-16 text-lg' : 'h-12'}`}
                    />
                  </motion.div>
                  {errors.phone && (
                    <motion.p 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-destructive ${isSeniorMode ? 'text-sm' : 'text-xs'}`}
                    >
                      {errors.phone}
                    </motion.p>
                  )}
                </div>

                {/* Consent */}
                <div className="flex items-start gap-3 pt-2">
                  <Checkbox
                    id="consent"
                    checked={consentGiven}
                    onCheckedChange={(checked) => setConsentGiven(checked === true)}
                    className={`mt-0.5 border-[#fbf7f1]/40 ${
                      isSeniorMode ? 'h-6 w-6' : ''
                    }`}
                  />
                  <label
                    htmlFor="consent"
                    className={`text-[#fbf7f1]/65 leading-relaxed cursor-pointer ${
                      isSeniorMode ? 'text-base' : 'text-xs'
                    }`}
                  >
                    {t("consentText", language)}{' '}
                    <span className="text-[#fbf7f1] underline hover:text-white cursor-pointer">{t("termsOfService", language)}</span>
                    {' '}{t("and", language)}{' '}
                    <span className="text-[#fbf7f1] underline hover:text-white cursor-pointer">{t("privacyPolicy", language)}</span>.
                  </label>
                </div>

                {/* Submit */}
                <div className="pt-4">
                  <Button
                    type="submit"
                    disabled={isSubmitting || !isFormValid}
                    className={`w-full font-medium uppercase transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-[#fbf7f1] text-black hover:bg-white ${
                      isSeniorMode ? 'h-16 text-base tracking-[0.15em]' : 'h-14 text-sm tracking-[0.15em]'
                    }`}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-3">
                        <Loader2 className={isSeniorMode ? 'w-5 h-5 animate-spin' : 'w-4 h-4 animate-spin'} />
                        {t("preparingSession", language)}
                      </span>
                    ) : (
                      t("beginScreening", language)
                    )}
                  </Button>
                </div>
              </form>

              <p className={`text-[#fbf7f1]/40 text-center ${
                isSeniorMode ? 'text-sm' : 'text-[10px]'
              }`}>
                {t("encryptionNote", language)}
              </p>
            </motion.div>
          )}
      </div>

      {/* Developer tools */}
      {isDeveloperMode && step === 4 && (
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 text-[10px] font-mono uppercase tracking-[0.15em]">
          <button
            type="button"
            onClick={handleBypassForm}
            className="px-3 py-1.5 rounded border border-white/20 bg-black/40 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/40 transition-colors"
          >
            Dev: Bypass Contact Form
          </button>
        </div>
      )}
    </div>
  );
};

interface FocusCardProps {
  icon: typeof Heart;
  label: string;
  subtitle: string;
  onClick: () => void;
  isHighVis?: boolean;
  isSeniorMode?: boolean;
}

const FocusCard = ({ icon: Icon, label, subtitle, onClick, isHighVis = false, isSeniorMode = false }: FocusCardProps) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`rounded-xl border border-[#fbf7f1]/20 bg-white/5 hover:bg-white/10 hover:border-[#fbf7f1]/50 transition-all duration-300 flex flex-col items-center text-center gap-3 group min-w-0 ${
      isSeniorMode ? 'p-5 py-7' : isHighVis ? 'p-4 py-6' : 'p-4'
    }`}
  >
    <div className={`rounded-full bg-[#fbf7f1]/10 flex items-center justify-center group-hover:bg-[#fbf7f1]/20 transition-colors flex-shrink-0 ${
      isSeniorMode ? 'w-12 h-12' : 'w-10 h-10'
    }`}>
      <Icon className={`text-[#fbf7f1] ${isSeniorMode ? 'w-6 h-6' : 'w-5 h-5'}`} />
    </div>
    <div className="space-y-1 w-full min-w-0">
      {/* Card labels are short but demographic variants ("Male Vitality",
          "Testosterone") are the longest — keep them on one line rather than
          letting a two-word label wrap and change the card height. */}
      <span className={`font-mono tracking-[0.1em] text-[#fbf7f1] block truncate whitespace-nowrap ${
        isSeniorMode ? 'text-base font-semibold' : isHighVis ? 'text-sm font-medium' : 'text-xs'
      }`}>
        {label}
      </span>
      <span className={`font-mono tracking-[0.1em] uppercase text-[#fbf7f1]/60 block truncate whitespace-nowrap ${
        isSeniorMode ? 'text-sm font-medium' : isHighVis ? 'text-xs font-medium' : 'text-[10px] md:text-xs'
      }`}>
        {subtitle}
      </span>
    </div>
  </motion.button>
);

interface OptionButtonProps {
  label: string;
  onClick: () => void;
}

const OptionButton = ({ label, onClick }: OptionButtonProps) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="px-6 py-4 rounded-full border border-[#fbf7f1]/20 bg-white/5 hover:bg-white/10 hover:border-[#fbf7f1]/50 transition-all duration-300 group"
  >
    <span className="font-mono text-sm tracking-[0.15em] text-[#fbf7f1] transition-colors">
      {label}
    </span>
  </motion.button>
);
