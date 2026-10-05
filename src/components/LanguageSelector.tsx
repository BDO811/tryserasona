import { motion } from "framer-motion";
import { useAssessment } from "@/context/AssessmentContext";
import { Language, LANGUAGE_OPTIONS, t } from "@/lib/i18n";
import { asset } from "@/lib/asset";

interface LanguageSelectorProps {
  onComplete: () => void;
}

export const LanguageSelector = ({ onComplete }: LanguageSelectorProps) => {
  const { setLanguage } = useAssessment();

  const handleSelect = (lang: Language) => {
    setLanguage(lang);
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center p-4 z-10 overflow-hidden" style={{ backgroundColor: "#DBCCB1" }}>
      {/* Background photo at low opacity */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: `url(${asset("images/voice-conversation.jpg")})` }}
      />
      <div className="absolute inset-0" style={{ backgroundColor: "#DBCCB1", opacity: 0.4 }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[500px] rounded-2xl bg-black/[0.92] p-8 backdrop-blur-md relative"
      >
        {/* Chrome Headers */}
        <div className="flex items-center justify-between mb-8">
          <img src={asset("brand/swara-mark-paper.svg")} alt="Swara" className="h-10 w-auto" />
          <span className="font-mono text-xs tracking-[0.25em] uppercase text-[#DBCCB1]/90">
            SWARA // 2026
          </span>
        </div>

        {/* Title */}
        <h1 className="font-serif text-3xl md:text-4xl text-center text-[#DBCCB1] leading-snug italic mb-10">
          {t("selectLanguage", "en")}
        </h1>

        {/* Language Options */}
        <div className="flex flex-col gap-4">
          {LANGUAGE_OPTIONS.map((option) => (
            <motion.button
              key={option.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSelect(option.id)}
              className="w-full px-[19.2px] py-4 rounded-full border border-[#DBCCB1]/20 bg-white/5 hover:bg-white/10 hover:border-[#DBCCB1]/50 transition-all duration-300 group text-center"
            >
              <span className="font-mono text-[14.4px] tracking-[0.1em] text-[#DBCCB1] transition-colors">
                {option.nativeLabel}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Subtitle */}
        <p className="text-center font-mono text-[10px] text-[#DBCCB1]/40 mt-8 tracking-wider uppercase">
          Swara · Voice Check-in
        </p>
      </motion.div>
    </div>
  );
};
