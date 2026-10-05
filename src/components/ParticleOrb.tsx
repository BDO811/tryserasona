import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useAssessment, getIsSeniorMode, getIsHighVis } from "@/context/AssessmentContext";
import { t } from "@/lib/i18n";

interface Particle {
  id: number;
  angle: number;
  radius: number;
  size: number;
  delay: number;
}

const CornerBracket = ({ position }: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => {
  const rotations = {
    'top-left': 'rotate-0',
    'top-right': 'rotate-90',
    'bottom-right': 'rotate-180',
    'bottom-left': '-rotate-90'
  };

  return (
    <div className={`absolute w-6 h-6 ${rotations[position]} ${
      position.includes('top') ? 'top-5' : 'bottom-5'
    } ${position.includes('left') ? 'left-5' : 'right-5'}`}>
      <div className="absolute top-0 left-0 w-full h-px bg-primary/30" />
      <div className="absolute top-0 left-0 w-px h-full bg-primary/30" />
    </div>
  );
};

export const ParticleOrb = ({ onClick }: { onClick: () => void }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const { pathwayConfig, userProfile, language } = useAssessment();
  
  const isSeniorMode = getIsSeniorMode(userProfile.ageRange);
  const isHighVis = getIsHighVis(userProfile.ageRange);

  const title = t("wellnessCheck", language);

  useEffect(() => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 120; i++) {
      newParticles.push({
        id: i,
        angle: (i / 120) * 360,
        radius: 80 + Math.random() * 40,
        size: 1 + Math.random() * 2,
        delay: Math.random() * 2,
      });
    }
    setParticles(newParticles);
  }, []);

  const glowColor = pathwayConfig?.color || "#1E5631";
  
  return (
    <motion.div
      className="relative w-full h-full flex flex-col items-center justify-center cursor-pointer"
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.5, filter: "blur(20px)" }}
      transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
      style={{
        // Subtle pathway-based ambient glow
        "--pathway-glow": glowColor,
      } as React.CSSProperties}
    >
      {/* Hardware Frame - Border */}
      <div className="absolute inset-5 border border-border/30 pointer-events-none" />
      
      {/* Corner Brackets */}
      <CornerBracket position="top-left" />
      <CornerBracket position="top-right" />
      <CornerBracket position="bottom-left" />
      <CornerBracket position="bottom-right" />
      
      {/* Status Indicators */}
      <div className={`absolute top-8 left-8 font-mono tracking-widest ${
        isSeniorMode ? 'text-sm font-medium text-primary/60' : 'text-[10px] text-primary/40'
      }`}>
        SYS.RDY
      </div>
      <div className={`absolute top-8 right-8 font-mono tracking-widest ${
        isSeniorMode ? 'text-sm font-medium text-primary/60' : 'text-[10px] text-primary/40'
      }`}>
        V.1.0
      </div>

      {/* Core orb with breathing effect + fluid color cycling */}
      <motion.div
        className="relative w-48 h-48 flex items-center justify-center"
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Outer glow rings */}
        <motion.div
          className="absolute w-64 h-64 rounded-full border border-black/10 orb-ring-glow"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-80 h-80 rounded-full border border-black/5 orb-ring-glow"
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.05, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
        
        {/* Layered color glow backgrounds - cross-fading for smooth transitions */}
        <div className="absolute inset-0 rounded-full blur-3xl orb-glow-cyan" />
        <div className="absolute inset-0 rounded-full blur-3xl orb-glow-amethyst" />
        <div className="absolute inset-0 rounded-full blur-3xl orb-glow-amber" />
        <div className="absolute inset-0 rounded-full blur-3xl orb-glow-teal" />
        
        {/* Core - layered colors */}
        <motion.div
          className="absolute w-24 h-24 rounded-full overflow-hidden"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 orb-core-cyan" />
          <div className="absolute inset-0 orb-core-amethyst" />
          <div className="absolute inset-0 orb-core-amber" />
          <div className="absolute inset-0 orb-core-teal" />
        </motion.div>

        {/* Particles - Galaxy rotation container */}
        <div className="absolute inset-0 flex items-center justify-center animate-galaxy-rotate">
          {particles.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute rounded-full orb-particle"
              style={{
                width: particle.size,
                height: particle.size,
              }}
              animate={{
                x: [
                  Math.cos((particle.angle * Math.PI) / 180) * particle.radius,
                  Math.cos((particle.angle * Math.PI) / 180) * (particle.radius + 10),
                  Math.cos((particle.angle * Math.PI) / 180) * particle.radius,
                ],
                y: [
                  Math.sin((particle.angle * Math.PI) / 180) * particle.radius,
                  Math.sin((particle.angle * Math.PI) / 180) * (particle.radius + 10),
                  Math.sin((particle.angle * Math.PI) / 180) * particle.radius,
                ],
                opacity: [0.3, 0.8, 0.3],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: particle.delay,
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Pathway-specific subtle ambient overlay */}
      {pathwayConfig && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          transition={{ duration: 1.5 }}
          style={{
            background: `radial-gradient(circle at 50% 50%, ${glowColor}20 0%, transparent 60%)`,
          }}
        />
      )}

      {/* Main Text - Museum Label Style */}
      <motion.p
        className={`mt-20 font-mono uppercase text-center px-8 ${
          isSeniorMode 
            ? 'text-lg font-bold tracking-[0.15em]' 
            : isHighVis 
              ? 'text-[14px] font-semibold tracking-[0.2em]' 
              : 'text-[12px] font-semibold tracking-[0.25em]'
        }`}
        style={{ color: isSeniorMode ? 'rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.85)' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        {title}
      </motion.p>

      {/* Sub-text - Utility instruction, recedes into background */}
      <motion.p
        className={`mt-5 font-mono uppercase ${
          isSeniorMode 
            ? 'text-base font-medium tracking-[0.1em]' 
            : isHighVis 
              ? 'text-sm font-medium tracking-[0.12em]' 
              : 'text-[10px] font-normal tracking-[0.15em]'
        }`}
        style={{ color: isSeniorMode ? 'rgba(0, 0, 0, 0.7)' : isHighVis ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.45)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isSeniorMode ? [0.7, 1, 0.7] : [0.3, 0.6, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        {t("tapToBegin", language)}
      </motion.p>
    </motion.div>
  );
};
