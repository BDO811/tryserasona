import { motion } from "framer-motion";
import { asset } from "@/lib/asset";
import { SiteHeader } from "@/components/SiteHeader";

interface SerasonaHomeProps {
  onComplete: () => void;
}

const STATS = [
  { value: "2.4M", label: "World's Largest Dataset" },
  { value: "14,000", label: "Physician-Labeled Conditions & States" },
  { value: "75+", label: "Production Indicators" },
  { value: "40+", label: "Languages" },
];

const WAVEFORM_BARS = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  // Layered sine waves for an organic voice-waveform silhouette
  const h = 0.25 + Math.abs(Math.sin(t * Math.PI * 3.2)) * 0.55 + Math.abs(Math.sin(t * Math.PI * 9)) * 0.2;
  return Math.min(1, h);
});

export const SerasonaHome = ({ onComplete }: SerasonaHomeProps) => {
  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      style={{ backgroundColor: "#fbf7f1" }}
    >
      <SiteHeader overlay />

      <div className="mx-auto flex max-w-[900px] flex-col items-center px-6 pb-24 pt-16 text-center md:pt-24">
        {/* Eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-mono text-sm tracking-[0.25em] uppercase text-black/90"
        >
          Twenty Seconds Of Speech
        </motion.span>

        {/* Hero headline */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 font-serif text-[13vw] leading-[0.95] tracking-tight text-black sm:text-6xl md:text-7xl"
        >
          Hear what your voice
          <br />
          <span className="italic">already knows.</span>
        </motion.h1>

        {/* Waveform accent */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-10 flex h-14 w-full max-w-md items-center justify-center gap-[3px]"
        >
          {WAVEFORM_BARS.map((h, i) => (
            <motion.div
              key={i}
              className="w-[3px] rounded-full bg-black/70"
              style={{ height: `${h * 100}%`, transformOrigin: "center" }}
              animate={{ scaleY: [0.4, 1.2, 0.4] }}
              transition={{
                duration: 1.1 + (i % 5) * 0.15,
                repeat: Infinity,
                ease: "easeInOut",
                delay: (i % 12) * 0.06,
              }}
            />
          ))}
        </motion.div>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-10 max-w-[560px] text-lg leading-relaxed text-black/70 md:text-xl"
        >
          Your voice carries a read on how you're doing, alongside the words you
          say. Try it yourself, in under two minutes.
        </motion.p>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onComplete}
          className="mt-12 rounded-full bg-black px-10 py-5 font-mono text-sm font-medium uppercase tracking-[0.2em] text-[#fbf7f1] transition-colors hover:bg-black/[0.85]"
        >
          Try Serasona
        </motion.button>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-20 grid w-full grid-cols-2 gap-x-6 gap-y-10 border-t border-black/15 pt-12 md:grid-cols-4"
        >
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div className="font-serif text-3xl text-black md:text-4xl">{stat.value}</div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-black/55">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Brand signature: the audio bands alone, closing the page the way
            they open it in the nav, this time without the wordmark. */}
        <motion.img
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          src={asset("brand/serasona-logo-bands.svg")}
          alt=""
          aria-hidden="true"
          className="mt-20 h-16 w-auto max-w-full md:h-20"
        />
      </div>
    </div>
  );
};

export default SerasonaHome;
