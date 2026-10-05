import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAssessment, getIsSeniorMode } from "@/context/AssessmentContext";
import { isAssessmentPathwayEnabled, isDeveloperModeEnabled } from "@/lib/utils";
import { getAudioFormat, getAudioFileExtension } from "@/lib/audio-utils";
import { t } from "@/lib/i18n";
import {
  BASE_EXPECTED_ANALYSIS,
  BASE_FINAL_TAIL,
  tailStage,
  waitingStagePosition,
} from "@/lib/analysis-pacing";
import { detailAt, getStageContent } from "@/lib/analysis-stage-content";
import { getModelForPathway } from "@/lib/pathway-model-map";

// 6 Archetypes with their corresponding shapes
export type ArchetypeType = 
  | 'harmonic-connector'
  | 'kinetic-catalyst'
  | 'radiant-source'
  | 'grounded-anchor'
  | 'resonant-visionary'
  | 'ethereal-weaver';

export interface ArchetypeData {
  id: ArchetypeType;
  name: string;
  title: string;
  shape: 'circle' | 'triangle' | 'starburst' | 'square' | 'diamond' | 'hexagon';
  color: string; // Hex color for theming
  description: string;
  vitality: number;
  resonance: number;
  clarity: number;
}

export const ARCHETYPES: ArchetypeData[] = [
  {
    id: 'harmonic-connector',
    name: 'HARMONIC',
    title: 'HARMONIC CONNECTOR',
    shape: 'circle',
    color: '#00FF94', // Electric Teal
    description: 'Your acoustic signature reveals deep empathy and connection. You bridge gaps between ideas and people, creating unity through understanding and compassion.',
    vitality: 82,
    resonance: 95,
    clarity: 78,
  },
  {
    id: 'kinetic-catalyst',
    name: 'KINETIC',
    title: 'KINETIC CATALYST',
    shape: 'triangle',
    color: '#FFB800', // Solar Amber
    description: 'Your vocal energy suggests high adaptability and forward momentum. You are a catalyst for change, pushing boundaries and inspiring transformation.',
    vitality: 88,
    resonance: 72,
    clarity: 94,
  },
  {
    id: 'radiant-source',
    name: 'RADIANT',
    title: 'RADIANT SOURCE',
    shape: 'starburst',
    color: '#FF0055', // Crimson Ruby
    description: 'Your voice emanates warmth and inspiration. You are a beacon of creativity, illuminating paths for others and radiating positive energy.',
    vitality: 91,
    resonance: 85,
    clarity: 88,
  },
  {
    id: 'grounded-anchor',
    name: 'GROUNDED',
    title: 'GROUNDED ANCHOR',
    shape: 'square',
    color: '#2E5CFF', // Deep Sapphire
    description: 'Your voice carries the weight of stability and presence. You are a foundation for others, providing calm assurance and unwavering strength.',
    vitality: 76,
    resonance: 91,
    clarity: 83,
  },
  {
    id: 'resonant-visionary',
    name: 'RESONANT',
    title: 'RESONANT VISIONARY',
    shape: 'diamond',
    color: '#9D00FF', // Amethyst
    description: 'Your acoustic patterns reveal profound insight and foresight. You perceive what others cannot, translating vision into reality.',
    vitality: 84,
    resonance: 89,
    clarity: 96,
  },
  {
    id: 'ethereal-weaver',
    name: 'ETHEREAL',
    title: 'ETHEREAL WEAVER',
    shape: 'hexagon',
    color: '#1E5631', // Cyan
    description: 'Your voice carries ethereal qualities of interconnection. You weave together disparate elements into harmonious patterns.',
    vitality: 79,
    resonance: 93,
    clarity: 81,
  },
];

interface AnalysisAnimationProps {
  onComplete: (archetype: ArchetypeData) => void;
  onFailed?: () => void;
}

const TIMEOUT_DURATION = 120000; // 120 seconds timeout for API response
const PARTICLE_COUNT = 150;

// Stage pacing lives in @/lib/analysis-pacing, where it can be simulated
// against the job durations actually measured in production.

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
}

// Shape generators
const generateCirclePoints = (count: number, radius: number) => {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
};

const generateTrianglePoints = (count: number, radius: number) => {
  const points: { x: number; y: number }[] = [];
  const sides = 3;
  const pointsPerSide = Math.floor(count / sides);
  
  for (let side = 0; side < sides; side++) {
    const angle1 = (side / sides) * Math.PI * 2 - Math.PI / 2;
    const angle2 = ((side + 1) / sides) * Math.PI * 2 - Math.PI / 2;
    const x1 = Math.cos(angle1) * radius;
    const y1 = Math.sin(angle1) * radius;
    const x2 = Math.cos(angle2) * radius;
    const y2 = Math.sin(angle2) * radius;
    
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    }
  }
  while (points.length < count) points.push({ x: 0, y: -radius });
  return points;
};

const generateStarburstPoints = (count: number, radius: number) => {
  const points: { x: number; y: number }[] = [];
  const spikes = 8;
  const innerRadius = radius * 0.4;
  
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const spikeIndex = Math.floor((i / count) * spikes * 2);
    const isOuter = spikeIndex % 2 === 0;
    const r = isOuter ? radius : innerRadius;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return points;
};

const generateSquarePoints = (count: number, size: number) => {
  const points: { x: number; y: number }[] = [];
  const half = size / 2;
  const perSide = Math.floor(count / 4);
  
  // Top
  for (let i = 0; i < perSide; i++) points.push({ x: -half + (size * i / perSide), y: -half });
  // Right
  for (let i = 0; i < perSide; i++) points.push({ x: half, y: -half + (size * i / perSide) });
  // Bottom
  for (let i = 0; i < perSide; i++) points.push({ x: half - (size * i / perSide), y: half });
  // Left
  for (let i = 0; i < perSide; i++) points.push({ x: -half, y: half - (size * i / perSide) });
  
  while (points.length < count) points.push({ x: -half, y: -half });
  return points;
};

const generateDiamondPoints = (count: number, radius: number) => {
  const points: { x: number; y: number }[] = [];
  const sides = 4;
  const pointsPerSide = Math.floor(count / sides);
  const vertices = [
    { x: 0, y: -radius },      // Top
    { x: radius * 0.7, y: 0 }, // Right
    { x: 0, y: radius },       // Bottom
    { x: -radius * 0.7, y: 0 } // Left
  ];
  
  for (let side = 0; side < sides; side++) {
    const v1 = vertices[side];
    const v2 = vertices[(side + 1) % sides];
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({ x: v1.x + (v2.x - v1.x) * t, y: v1.y + (v2.y - v1.y) * t });
    }
  }
  while (points.length < count) points.push({ x: 0, y: -radius });
  return points;
};

const generateHexagonPoints = (count: number, radius: number) => {
  const points: { x: number; y: number }[] = [];
  const sides = 6;
  const pointsPerSide = Math.floor(count / sides);
  
  for (let side = 0; side < sides; side++) {
    const angle1 = (side / sides) * Math.PI * 2 - Math.PI / 2;
    const angle2 = ((side + 1) / sides) * Math.PI * 2 - Math.PI / 2;
    const x1 = Math.cos(angle1) * radius;
    const y1 = Math.sin(angle1) * radius;
    const x2 = Math.cos(angle2) * radius;
    const y2 = Math.sin(angle2) * radius;
    
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    }
  }
  while (points.length < count) points.push({ x: radius, y: 0 });
  return points;
};

// Stage-specific formations
const generateScatteredCloud = (count: number, radius: number) => {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  });
};

const generateFrequencyBars = (count: number, width: number, height: number) => {
  const bars = 12;
  const pointsPerBar = Math.floor(count / bars);
  const points: { x: number; y: number }[] = [];
  
  for (let bar = 0; bar < bars; bar++) {
    const barHeight = (0.3 + Math.random() * 0.7) * height;
    const x = (bar / (bars - 1) - 0.5) * width;
    
    for (let i = 0; i < pointsPerBar; i++) {
      const y = (i / pointsPerBar - 0.5) * barHeight;
      points.push({ x, y });
    }
  }
  while (points.length < count) points.push({ x: 0, y: 0 });
  return points;
};

const generateSineWave = (count: number, width: number, amplitude: number) => {
  return Array.from({ length: count }, (_, i) => {
    const x = (i / count - 0.5) * width;
    const y = Math.sin((i / count) * Math.PI * 4) * amplitude;
    return { x, y };
  });
};

const generateClusters = (count: number, radius: number) => {
  const clusters = 3;
  const pointsPerCluster = Math.floor(count / clusters);
  const points: { x: number; y: number }[] = [];
  
  for (let c = 0; c < clusters; c++) {
    const clusterAngle = (c / clusters) * Math.PI * 2;
    const cx = Math.cos(clusterAngle) * radius * 0.5;
    const cy = Math.sin(clusterAngle) * radius * 0.5;
    
    for (let i = 0; i < pointsPerCluster; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
  }
  while (points.length < count) points.push({ x: 0, y: 0 });
  return points;
};

const generateGrid = (count: number, size: number) => {
  const gridSize = Math.ceil(Math.sqrt(count));
  const spacing = size / gridSize;
  const points: { x: number; y: number }[] = [];
  
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (points.length >= count) break;
      points.push({
        x: (col - gridSize / 2 + 0.5) * spacing,
        y: (row - gridSize / 2 + 0.5) * spacing,
      });
    }
  }
  return points;
};

// Each of the 6 stages gets its own color and its own particle-mark shape,
// so the graphic reads as 6 distinct moments rather than one repeating loop.
// These are deliberately dark and saturated: the screen sits on beige #DBCCB1,
// and a mid-tone or bright hue (the old orange and yellow especially) sank into
// that background instead of reading against it.
const STAGE_COLORS = ["#1E5631", "#123A75", "#8E1220", "#4A1C82", "#8A3B08", "#0E4C57"];
const STAGE_SHAPES: Array<"circle" | "star" | "triangle" | "square" | "diamond"> = [
  "circle",
  "star",
  "triangle",
  "square",
  "diamond",
  "circle",
];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 30, g: 86, b: 49 }; // fall back to the brand dark green
}

/**
 * Beige #DBCCB1 is a light surface, so anything above roughly 40% luminance
 * stops reading as ink and starts blending in. The archetype palette is neon by
 * design (#00FF94, #FFB800), which is why the final stage used to wash out.
 * Scale any color down to that ceiling, preserving its hue, so every stage stays
 * bold and dark against the background.
 */
const MAX_LUMINANCE_ON_BEIGE = 0.42;
function inkOnBeige({ r, g, b }: Rgb): Rgb {
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (luminance <= MAX_LUMINANCE_ON_BEIGE) return { r, g, b };
  const scale = MAX_LUMINANCE_ON_BEIGE / luminance;
  return {
    r: Math.round(r * scale),
    g: Math.round(g * scale),
    b: Math.round(b * scale),
  };
}

const rgbCss = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`;
const rgbaCss = ({ r, g, b }: Rgb, alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

/** SVG path for a small particle-mark shape, centered at the origin. Circles are drawn separately as <circle>. */
function getMarkPath(shape: "star" | "triangle" | "square" | "diamond", size: number): string {
  switch (shape) {
    case "triangle": {
      const pts = [0, 1, 2].map((k) => {
        const a = -Math.PI / 2 + k * ((2 * Math.PI) / 3);
        return [size * Math.cos(a), size * Math.sin(a)];
      });
      return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]} L${pts[2][0]},${pts[2][1]} Z`;
    }
    case "square": {
      const s = size * 0.85;
      return `M${-s},${-s} L${s},${-s} L${s},${s} L${-s},${s} Z`;
    }
    case "diamond": {
      const s = size * 1.1;
      return `M0,${-s} L${s},0 L0,${s} L${-s},0 Z`;
    }
    case "star": {
      const spikes = 5;
      const outerR = size * 1.15;
      const innerR = size * 0.5;
      let d = "";
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = -Math.PI / 2 + (i * Math.PI) / spikes;
        d += `${i === 0 ? "M" : "L"}${r * Math.cos(a)},${r * Math.sin(a)} `;
      }
      return `${d}Z`;
    }
  }
}

// Stage copy lives in @/lib/analysis-stage-content, keyed to the v2 model the
// pathway selected, so each stage names what the API actually reports.

/**
 * True below Tailwind's md breakpoint.
 *
 * This screen positions nine absolutely-placed elements against the viewport,
 * several through inline calc() that a class prefix cannot reach, so the
 * breakpoint is read here rather than expressed only in CSS. Listening to the
 * query rather than reading width once keeps it correct through a rotation.
 */
const MOBILE_QUERY = "(max-width: 767px)";

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

/*
  Vertical bands for this screen, mobile against desktop.

  Every value below was checked against a 375 by 690 viewport, which is what an
  iPhone leaves after the browser chrome. The elements are laid out as bands
  with clearance between them: at 20px type and desktop offsets they all landed
  in the same three bands and printed over each other. The graphic shrinks on
  mobile as well, because 300px of it left no room for the four telemetry
  blocks plus the headline and the rotating detail line.
*/
const LAYOUT = {
  mobile: {
    graphic: 200,
    pillOffset: -135,
    detailTop: "74%",
    titleTop: "top-3",
    cornerTop: "top-12",
    cornerBottom: "bottom-14",
    headlineBottom: "bottom-28",
    dotsBottom: "bottom-6",
    edgeX: "left-3",
    edgeXRight: "right-3",
    cornerWidth: "max-w-[45%]",
  },
  desktop: {
    graphic: 300,
    pillOffset: -230,
    detailTop: "calc(75% - 12px)",
    titleTop: "md:top-8",
    cornerTop: "md:top-8",
    cornerBottom: "md:bottom-24",
    headlineBottom: "md:bottom-36",
    dotsBottom: "md:bottom-12",
    edgeX: "md:left-8",
    edgeXRight: "md:right-8",
    cornerWidth: "md:max-w-none",
  },
} as const;

export const AnalysisAnimation = ({ onComplete, onFailed }: AnalysisAnimationProps) => {
  const { pathwayConfig, pathwayDisplayTitle, apiStatus, pathway, userProfile, audioBlob, language } = useAssessment();
  const isSeniorMode = getIsSeniorMode(userProfile.ageRange);
  
  // Senior mode: 50% slower animations
  const EXPECTED_ANALYSIS = isSeniorMode ? BASE_EXPECTED_ANALYSIS * 1.5 : BASE_EXPECTED_ANALYSIS;
  const FINAL_TAIL = isSeniorMode ? BASE_FINAL_TAIL * 1.5 : BASE_FINAL_TAIL;
  const [stage, setStage] = useState(0);
  const [detailIndex, setDetailIndex] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);
  const [pulseScale, setPulseScale] = useState(1);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [flickerValues, setFlickerValues] = useState({ freq: 124, jitter: 0.04, shimmer: 2.1 });
  const [elapsedTime, setElapsedTime] = useState(0);

  // When the API result landed, and which stage was showing at that moment, so
  // the tail can be spread over the stages that remain. Refs rather than state:
  // the animation loop reads them every frame and must not restart on a change.
  const resultAtRef = useRef<number | null>(null);
  const stageAtResultRef = useRef(0);
  const lastStageRef = useRef(0);
  const stageEnteredAtRef = useRef(0);

  /**
   * Start of the run, held across effect re-runs. The animation effect depends
   * on apiStatus, so it tears down and restarts every time the status moves
   * (processing, then done). A startTime local to the effect would reset to
   * zero at that moment and throw the stage counter back to the beginning.
   */
  const startTimeRef = useRef<number | null>(null);

  // Stage copy for the model this pathway runs against. Held in a ref too, so
  // the animation loop can read it without being a dependency of the effect.
  const stageContent = useMemo(() => getStageContent(getModelForPathway(pathway)), [pathway]);
  const stageContentRef = useRef(stageContent);
  stageContentRef.current = stageContent;
  
  // If pathway is disabled, show error and complete immediately
  useEffect(() => {
    if (!isAssessmentPathwayEnabled(pathway) && pathway) {
      console.warn(`[AnalysisAnimation] Pathway ${pathway} is disabled by feature flag`);
      // Complete with a default archetype to prevent blocking the flow
      const defaultArchetype = ARCHETYPES[0];
      setTimeout(() => {
        onComplete(defaultArchetype);
      }, 1000);
    }
  }, [pathway, onComplete]);
  
  // Pathway-specific metadata
  const metadata = pathwayConfig?.metadata || {
    topLeft: { label: "FREQ", value: "SCAN" },
    topRight: { label: "JITTER", value: "DETECT" },
    bottomLeft: { label: "STAGE", value: "1/6" },
    bottomRight: { label: "CONF", value: "0%" },
  };
  
  // Use dynamic display title or fall back to pathway config
  const analysisTitle = pathwayDisplayTitle || (pathwayConfig?.title || "Analysis");
  
  // Randomly select archetype on mount
  const selectedArchetype = useMemo(() => {
    const index = Math.floor(Math.random() * ARCHETYPES.length);
    return ARCHETYPES[index];
  }, []);

  // Generate all formation points
  const formations = useMemo(() => {
    const radius = 96;
    const scattered = generateScatteredCloud(PARTICLE_COUNT, radius * 1.5);
    const cloud = generateScatteredCloud(PARTICLE_COUNT, radius * 0.8);
    const bars = generateFrequencyBars(PARTICLE_COUNT, 192, 120);
    const wave = generateSineWave(PARTICLE_COUNT, 216, 48);
    const clusters = generateClusters(PARTICLE_COUNT, radius);
    const grid = generateGrid(PARTICLE_COUNT, 168);
    
    // Final shape based on archetype
    let finalShape: { x: number; y: number }[];
    switch (selectedArchetype.shape) {
      case 'circle': finalShape = generateCirclePoints(PARTICLE_COUNT, radius); break;
      case 'triangle': finalShape = generateTrianglePoints(PARTICLE_COUNT, radius); break;
      case 'starburst': finalShape = generateStarburstPoints(PARTICLE_COUNT, radius); break;
      case 'square': finalShape = generateSquarePoints(PARTICLE_COUNT, radius * 1.4); break;
      case 'diamond': finalShape = generateDiamondPoints(PARTICLE_COUNT, radius); break;
      case 'hexagon': finalShape = generateHexagonPoints(PARTICLE_COUNT, radius); break;
      default: finalShape = generateCirclePoints(PARTICLE_COUNT, radius);
    }
    
    return { scattered, cloud, bars, wave, clusters, grid, final: finalShape };
  }, [selectedArchetype]);

  // Brownian motion state - slower, wider drift for viscous feel
  const isMobile = useIsMobileViewport();
  const L = isMobile ? LAYOUT.mobile : LAYOUT.desktop;

  const particlesRef = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: formations.scattered[i].x,
      y: formations.scattered[i].y,
      vx: (Math.random() - 0.5) * 0.08, // 70% slower initial velocity
      vy: (Math.random() - 0.5) * 0.08,
      baseX: formations.scattered[i].x,
      baseY: formations.scattered[i].y,
    }))
  );
  const [particles, setParticles] = useState(particlesRef.current);

  // Get target positions for current stage
  const getTargetFormation = useCallback((currentStage: number) => {
    switch (currentStage) {
      case 0: return formations.cloud;
      case 1: return formations.bars;
      case 2: return formations.wave;
      case 3: return formations.clusters;
      case 4: return formations.grid;
      case 5: return formations.final;
      default: return formations.final;
    }
  }, [formations]);

  // Main animation loop - continues until API returns or timeout
  useEffect(() => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    const startTime = startTimeRef.current;
    let animationFrame: number;
    let isComplete = false;

    const animate = () => {
      if (isComplete) return;

      const elapsed = Date.now() - startTime;
      
      // Update elapsed time for timeout progress display
      setElapsedTime(elapsed);
      
      // While waiting, walk stages 1-5 on the decelerating curve. Once the
      // result lands, spend FINAL_TAIL walking whatever stages are left — which
      // is normally just stage 6, since a real job almost always outlasts the
      // curve's handover point. Passing through the remainder rather than
      // jumping keeps the counter monotonic if the job comes back early.
      const resultAt = resultAtRef.current;
      let currentStage: number;
      let newStageProgress: number;
      let tailDone = false;

      if (resultAt === null) {
        const position = waitingStagePosition(elapsed, EXPECTED_ANALYSIS);
        currentStage = Math.floor(position);
        newStageProgress = position - currentStage;
      } else {
        const tail = tailStage(Date.now() - resultAt, stageAtResultRef.current, FINAL_TAIL);
        currentStage = tail.stage;
        tailDone = tail.done;
        newStageProgress = 1;
      }

      if (currentStage !== lastStageRef.current) {
        lastStageRef.current = currentStage;
        stageEnteredAtRef.current = elapsed;
      }

      // The particle morph wants real time on the current stage, not a curve
      // position that clamps once stage 5 starts absorbing the wait.
      const stageElapsed = elapsed - stageEnteredAtRef.current;

      setStage(currentStage);
      setStageProgress(newStageProgress);

      // Rotate the detail line so there is something new to read every couple
      // of seconds instead of one label held for the whole stage.
      const details = stageContentRef.current[currentStage]?.details ?? [];
      setDetailIndex(detailAt(details, stageElapsed).index);

      // Update target positions with viscous Brownian motion
      const targets = getTargetFormation(currentStage);
      
      // Viscous physics: slow drift, gentle magnetic pull
      // Reduced Brownian strength (70% less jitter) + wider drift radius
      const brownianStrength = currentStage < 5 ? 0.06 : 0.02; // Much gentler random motion
      
      // Slow magnetic pull - takes ~2s to fully morph (viscous gel effect)
      // Ease-in-out curve approximation through progressive strength
      const morphProgress = Math.min(stageElapsed / 2000, 1); // 2 second morph duration
      const easedProgress = morphProgress < 0.5 
        ? 2 * morphProgress * morphProgress  // ease-in
        : 1 - Math.pow(-2 * morphProgress + 2, 2) / 2; // ease-out
      const magneticStrength = 0.008 + (easedProgress * 0.025); // Very gentle pull
      
      particlesRef.current = particlesRef.current.map((p, i) => {
        // Slow, wide-drift Brownian motion (like smoke)
        const brownianX = (Math.random() - 0.5) * brownianStrength;
        const brownianY = (Math.random() - 0.5) * brownianStrength;
        
        // Viscous magnetic attraction to target
        const target = targets[i];
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        
        // Heavy damping (0.98) for smooth, liquid-like deceleration
        const newVx = p.vx * 0.98 + brownianX + dx * magneticStrength;
        const newVy = p.vy * 0.98 + brownianY + dy * magneticStrength;
        
        return {
          ...p,
          x: p.x + newVx,
          y: p.y + newVy,
          vx: newVx,
          vy: newVy,
          baseX: target.x,
          baseY: target.y,
        };
      });
      
      setParticles([...particlesRef.current]);

      // Flickering values
      if (currentStage < 5) {
        const flickerSpeed = Math.max(0.1, 1 - newStageProgress);
        if (Math.random() < flickerSpeed * 0.3) {
          setFlickerValues({
            freq: Math.floor(80 + Math.random() * 200),
            jitter: Math.floor(Math.random() * 100) / 100,
            shimmer: Math.floor(Math.random() * 50) / 10,
          });
        }
      }

      // Final stage pulse
      if (currentStage === 5 && newStageProgress > 0.5) {
        const pulsePhase = Math.sin((elapsed / 600) * Math.PI);
        setPulseScale(1 + pulsePhase * 0.05);
      }

      // The result landing starts the tail rather than ending the screen. Note
      // the stage it landed on, so the remaining stages can be spread across
      // FINAL_TAIL and the run always ends the same 4s after the answer.
      if (apiStatus === "done" && resultAtRef.current === null) {
        resultAtRef.current = Date.now();
        // The stage on screen, not one recomputed here, so the tail always
        // starts from what the user is actually looking at.
        stageAtResultRef.current = lastStageRef.current;
      }

      if (tailDone) {
        isComplete = true;
        setFlashOpacity(1);
        setTimeout(() => {
          onComplete(selectedArchetype);
        }, 150);
        return;
      }

      if (apiStatus === "failed") {
        isComplete = true;
        if (onFailed) {
          onFailed();
        }
        return;
      }

      // Timeout check - if TIMEOUT_DURATION elapsed without API response, fail
      if (elapsed >= TIMEOUT_DURATION) {
        isComplete = true;
        if (onFailed) {
          onFailed();
        }
        return;
      }
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => {
      isComplete = true;
      cancelAnimationFrame(animationFrame);
    };
  }, [getTargetFormation, onComplete, onFailed, selectedArchetype, apiStatus]);

  // Connection lines for grid stage
  const connectionLines = useMemo(() => {
    if (stage !== 4 && stage !== 5) return [];
    
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const gridSize = Math.ceil(Math.sqrt(PARTICLE_COUNT));
    
    for (let i = 0; i < Math.min(40, PARTICLE_COUNT); i++) {
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      
      // Horizontal
      if (col < gridSize - 1 && i + 1 < PARTICLE_COUNT) {
        lines.push({
          x1: particles[i].x,
          y1: particles[i].y,
          x2: particles[i + 1].x,
          y2: particles[i + 1].y,
        });
      }
      // Vertical
      if (row < gridSize - 1 && i + gridSize < PARTICLE_COUNT) {
        lines.push({
          x1: particles[i].x,
          y1: particles[i].y,
          x2: particles[i + gridSize].x,
          y2: particles[i + gridSize].y,
        });
      }
    }
    return lines;
  }, [stage, particles]);

  // One color drives the whole screen. Each stage gets its own entry from
  // STAGE_COLORS, interpolating into the revealed archetype color during the
  // final stage, and every particle and every piece of text reads off it — so
  // when the graphic changes color, the type changes with it.
  const archetypeRgb = useMemo(() => inkOnBeige(hexToRgb(selectedArchetype.color)), [selectedArchetype.color]);
  const stageColorRgb = useMemo(() => hexToRgb(STAGE_COLORS[stage] ?? STAGE_COLORS[0]), [stage]);

  const stageRgb = useMemo(() => {
    if (stage < 5) return stageColorRgb;
    const t = stageProgress; // 0 to 1 over the final stage
    return inkOnBeige({
      r: Math.round(stageColorRgb.r + (archetypeRgb.r - stageColorRgb.r) * t),
      g: Math.round(stageColorRgb.g + (archetypeRgb.g - stageColorRgb.g) * t),
      b: Math.round(stageColorRgb.b + (archetypeRgb.b - stageColorRgb.b) * t),
    });
  }, [stage, stageProgress, archetypeRgb, stageColorRgb]);

  // Particles are drawn at full opacity. They used to sit at 0.6 alpha with a
  // brightness boost, which lifted them toward the beige and made the graphic
  // look like a faint smudge.
  const particleColor = rgbCss(stageRgb);
  const stageColor = rgbCss(stageRgb);
  const stageColorSoft = rgbaCss(stageRgb, 0.62);

  // Flash color tracks the archetype, toned to the same ceiling as everything else
  const flashColor = rgbCss(archetypeRgb);
  
  const currentConfig = stageContent[stage] ?? stageContent[stageContent.length - 1];
  // Guard the modulo: a stage change lands before the loop's next frame, so the
  // index can briefly point past a shorter list.
  const safeDetailIndex =
    currentConfig.details.length > 0 ? detailIndex % currentConfig.details.length : 0;
  const detailNumber = String(safeDetailIndex + 1).padStart(2, "0");
  const detailLabel = currentConfig.details[safeDetailIndex] ?? "";
  const isDeveloperMode = isDeveloperModeEnabled();

  // Developer-only: click animation to download captured audio
  const handleDownloadCapturedAudio = useCallback(() => {
    if (!isDeveloperMode) return;
    if (!audioBlob) {
      console.warn("[AnalysisAnimation] No captured audio available to download");
      return;
    }

    try {
      const format = getAudioFormat();
      const extension = getAudioFileExtension(format);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `sona-capture-${timestamp}${extension}`;
      const url = URL.createObjectURL(audioBlob);

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[AnalysisAnimation] Failed to trigger audio download:", error);
    }
  }, [audioBlob, isDeveloperMode]);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#DBCCB1" }}
      initial={{ opacity: 1 }}
    >
      {/* Flash overlay - uses archetype color */}
      <motion.div 
        className="absolute inset-0 pointer-events-none z-50"
        style={{ 
          opacity: flashOpacity,
          backgroundColor: flashColor,
        }}
      />

      {/* Grain overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Assessment Title - Top Center */}
      <motion.div
        className="absolute top-3 md:top-8 left-1/2 -translate-x-1/2 max-w-[92%] font-mono text-[10px] md:text-[20px] uppercase tracking-[0.16em] md:tracking-[0.25em] text-center whitespace-nowrap"
        style={{ color: stageColorSoft }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ duration: 1, delay: 0.5 }}
      >
        {t("analysisTitle", language)}
      </motion.div>

      {/* Corner telemetry - Top Left - pathway specific */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={`tl-${stage}`}
          className="absolute top-12 md:top-8 left-3 md:left-8 font-mono text-[10px] md:text-[20px] leading-tight uppercase tracking-wider max-w-[45%] md:max-w-none"
          style={{ color: stageColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        >
          <div>{metadata.topLeft.label}: <span style={{ color: stageColor }}>{metadata.topLeft.value}</span></div>
          <div className="mt-1" style={{ color: stageColorSoft }}>{flickerValues.freq}Hz</div>
        </motion.div>
      </AnimatePresence>

      {/* Corner telemetry - Top Right - pathway specific */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={`tr-${stage}`}
          className="absolute top-12 md:top-8 right-3 md:right-8 text-right font-mono text-[10px] md:text-[20px] leading-tight uppercase tracking-wider max-w-[45%] md:max-w-none"
          style={{ color: stageColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
        >
          <div>{metadata.topRight.label}: <span style={{ color: stageColor }}>{metadata.topRight.value}</span></div>
          <div className="mt-1" style={{ color: stageColorSoft }}>{flickerValues.jitter.toFixed(2)}%</div>
        </motion.div>
      </AnimatePresence>

      {/* Corner telemetry - Bottom Left - pathway specific */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={`bl-${stage}`}
          className="absolute bottom-14 md:bottom-24 left-3 md:left-8 font-mono text-[10px] md:text-[20px] leading-tight uppercase tracking-wider max-w-[45%] md:max-w-none"
          style={{ color: stageColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
        >
          <div>{metadata.bottomLeft.label}: <span style={{ color: stageColor }}>{metadata.bottomLeft.value}</span></div>
          <div className="mt-1" style={{ color: stageColorSoft }}>STAGE {stage + 1}/6</div>
        </motion.div>
      </AnimatePresence>

      {/* Corner telemetry - Bottom Right - pathway specific */}
      <AnimatePresence mode="wait">
        <motion.div 
          key={`br-${stage}`}
          className="absolute bottom-14 md:bottom-24 right-3 md:right-8 text-right font-mono text-[10px] md:text-[20px] leading-tight uppercase tracking-wider max-w-[45%] md:max-w-none"
          style={{ color: stageColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
        >
          <div>{metadata.bottomRight.label}: <span style={{ color: stageColor }}>{metadata.bottomRight.value}</span></div>
          <div className="mt-1" style={{ color: stageColorSoft }}>{Math.min(Math.floor((elapsedTime / TIMEOUT_DURATION) * 100), 99)}%</div>
        </motion.div>
      </AnimatePresence>

      {/* Stage indicator — prominent, directly above the particle graphic, so progress is unmistakable */}
      <div
        className="absolute left-1/2 flex items-center gap-2 rounded-full border font-mono text-lg md:text-2xl font-bold px-4 md:px-5 py-1.5 md:py-2"
        style={{
          top: '50%',
          transform: `translate(-50%, ${L.pillOffset}px)`,
          borderColor: rgbaCss(stageRgb, 0.45),
          backgroundColor: rgbaCss(stageRgb, 0.12),
          color: stageColor,
        }}
      >
        {stage + 1}<span className="opacity-50">/6</span>
      </div>

      {/* Central particle system */}
      <motion.div 
        className="relative"
        style={{ 
          width: L.graphic,
          height: L.graphic,
          transform: `scale(${pulseScale})`,
          transition: 'transform 0.3s ease-out',
        }}
      >
        <svg 
          width="300" 
          height="300" 
          viewBox="-150 -150 300 300"
          className="overflow-visible"
        >
          {/* Glow gradient */}
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={particleColor} stopOpacity="0.2" />
              <stop offset="100%" stopColor={particleColor} stopOpacity="0" />
            </radialGradient>
          </defs>
          
          <circle 
            cx="0" 
            cy="0" 
            r="90" 
            fill="url(#coreGlow)"
            style={{ opacity: 0.4 + stageProgress * 0.2 }}
          />

          {/* Connection lines (for grid stage) */}
          {(stage === 4 || stage === 5) && connectionLines.map((line, i) => (
            <motion.line
              key={`line-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={particleColor}
              strokeWidth="0.3"
              strokeOpacity={stage === 4 ? stageProgress * 0.4 : 0.4 - stageProgress * 0.3}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.01 }}
            />
          ))}

          {/* Particles - shape and size change per stage; balls & triangles run 50% larger */}
          {(() => {
            const shape = STAGE_SHAPES[stage] ?? "circle";
            const baseSize = stage === 5 && stageProgress > 0.8 ? 1.9 : 1.6;
            const size = shape === "circle" || shape === "triangle" ? baseSize * 1.5 : baseSize;
            // No brightness boost here. On a light background it lifted the
            // particles toward the beige; a same-color shadow adds weight instead.
            const glowFilter = `drop-shadow(0 0 ${stage === 5 ? 3 + stageProgress * 3 : 2.5}px ${rgbaCss(stageRgb, 0.55)})`;

            if (shape === "circle") {
              return particles.map((p) => (
                <circle
                  key={p.id}
                  cx={p.x}
                  cy={p.y}
                  r={size}
                  fill={particleColor}
                  style={{ filter: glowFilter, transition: 'filter 2s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              ));
            }

            const d = getMarkPath(shape, size);
            return particles.map((p) => (
              <path
                key={p.id}
                d={d}
                transform={`translate(${p.x} ${p.y})`}
                fill={particleColor}
                style={{ filter: glowFilter, transition: 'filter 2s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            ));
          })()}
        </svg>
      </motion.div>

      {/*
        Detail line, sitting directly under the graphic rather than down with
        the headline. Positioned off the viewport centre like the stage counter
        above it — the counter is at -230px, the graphic is 300px tall, so +168
        clears its lower edge and keeps the trio reading as one column.

        Keyed on the detail as well as the stage so each rotation crossfades;
        keyed on the stage alone the text would swap with no transition. The
        fade is quicker than the headline's, because this line changes every
        DETAIL_ROTATE_MS and a 1.5s fade would still be running.
      */}
      <div
        className="absolute left-1/2 w-full px-6 text-center pointer-events-none"
        style={{
          /*
            The midpoint between the graphic's lower edge and the headline's top
            edge, so the line sits evenly between the two rather than crowding
            one of them.

            Graphic is 300px tall centred on the viewport, so its bottom edge is
            at 50% + 150px. The headline is anchored bottom-36 (144px) and runs
            about 29px tall, putting its top edge at 100% - 173px. The midpoint
            of those two is 75% - 11.5px, and it holds at any viewport height
            rather than only the one it was eyeballed on.
          */
          top: L.detailTop,
          transform: "translate(-50%, -50%)",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`${stage}-${safeDetailIndex}`}
            className="font-mono text-[10px] md:text-[20px] leading-snug tracking-[0.14em] md:tracking-[0.2em] uppercase"
            style={{ color: stageColorSoft }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            [{detailNumber}] {detailLabel}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Stage text - smooth 1s fade transitions */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stage}
          className="absolute bottom-28 md:bottom-36 left-0 right-0 px-5 md:px-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        >
          <span
            className="font-mono text-[13px] md:text-[24px] leading-snug tracking-[0.16em] md:tracking-[0.25em] uppercase"
            style={{ color: stageColor }}
          >
            {currentConfig.text}
          </span>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots - gentle breathing */}
      <div className="absolute bottom-6 md:bottom-12 left-1/2 -translate-x-1/2">
        <div className="flex gap-2 md:gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: stage >= i ? stageColor : rgbaCss(stageRgb, 0.25)
              }}
              initial={{ opacity: 0.2 }}
              animate={{
                opacity: stage > i ? 1 : stage === i ? [0.55, 1, 0.55] : 0.3,
                scale: stage === i ? [1, 1.2, 1] : 1,
              }}
              transition={{
                duration: 3, // Slow breathing
                repeat: stage === i ? Infinity : 0,
                ease: [0.4, 0, 0.2, 1],
              }}
            />
          ))}
        </div>
      </div>

      {/* Developer tools - bottom-right controls */}
      {isDeveloperMode && (
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 text-[10px] font-mono uppercase tracking-[0.15em]">
          <button
            type="button"
            onClick={handleDownloadCapturedAudio}
            className="px-3 py-1.5 rounded border border-white/20 bg-black/40 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/40 transition-colors"
          >
            Dev: Download Audio
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default AnalysisAnimation;
