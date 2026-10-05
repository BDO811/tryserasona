import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAssessment, getIsSeniorMode, getIsHighVis } from "@/context/AssessmentContext";
import { convertAudioBufferToBlob, decodeBlobToAudioBuffer, mergeAudioBuffers } from "@/lib/audio-utils";
import { leadgenWellnessAnalyzeAudioSync, leadgenRootHealthCheck } from "@/lib/leadgen-api-client";
import { isAssessmentPathwayEnabled } from "@/lib/utils";
import { isV2Result, transformV2ResultToVisualization, V2JobDetail } from "@/lib/v2-api-visual-mapping";
import { getModelForPathway } from "@/lib/pathway-model-map";
import { t, getQuestionPool } from "@/lib/i18n";
import { asset } from "@/lib/asset";

const RECORDING_MIME_TYPE = "audio/webm;codecs=opus";
const RECORDING_SAMPLE_RATE = 48000;
const RECORDING_DURATION_SECONDS = 15;
// How many questions the user is asked. Everything downstream — the initial
// draw from the pool, the re-ask cursor, the per-question audio buffers and the
// "N of M" label — derives from this, so changing it here changes all of them.
const QUESTION_COUNT = 2;
const MIN_SPEECH_SECONDS = 10;
const SPEECH_GAIN_THRESHOLD = 0.15;
const QUESTION_BACKGROUNDS = [
  asset("images/talk-laugh-outdoors.jpg"),
  asset("images/talk-conversation-dinner.jpg"),
  asset("images/voice-friends.jpg"),
];

function runLeadGenHealthCheck(): void {
  leadgenRootHealthCheck().then((ok) => {
    if (!ok) console.warn("[QuestionFlowVisualizer] LeadGen API health check failed");
  });
}

interface QuestionFlowVisualizerProps {
  onComplete: () => void;
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
      <div className="absolute top-0 left-0 w-full h-px bg-black/20" />
      <div className="absolute top-0 left-0 w-px h-full bg-black/20" />
    </div>
  );
};

interface Ripple {
  id: number;
  startTime: number;
  intensity: number;
}

function getTextClasses(
  isSeniorMode: boolean,
  isHighVis: boolean,
  variant: 'question' | 'instruction' | 'countdown' | 'button' | 'footer' | 'progress'
): string {
  const baseClasses = 'font-mono uppercase font-bold';

  switch (variant) {
    case 'question':
      if (isSeniorMode) return `${baseClasses} text-3xl tracking-[0.1em] leading-[1.5]`;
      if (isHighVis) return `${baseClasses} text-2xl tracking-[0.12em] leading-[1.4]`;
      return `${baseClasses} text-xl tracking-[0.15em] leading-[1.5]`;

    case 'instruction':
      if (isSeniorMode) return `${baseClasses} text-lg tracking-[0.15em]`;
      if (isHighVis) return `${baseClasses} text-base tracking-[0.18em]`;
      return `${baseClasses} text-sm tracking-[0.2em]`;

    case 'countdown':
      if (isSeniorMode) return `${baseClasses} text-base tracking-[0.1em]`;
      return `${baseClasses} text-sm tracking-[0.15em]`;

    case 'button':
      if (isSeniorMode) return `${baseClasses} text-xl tracking-[0.15em]`;
      return `${baseClasses} text-lg tracking-[0.15em]`;

    case 'footer':
      if (isSeniorMode) return `${baseClasses} text-sm tracking-[0.1em]`;
      return `${baseClasses} text-[10px] tracking-[0.15em]`;

    case 'progress':
      if (isSeniorMode) return `${baseClasses} text-sm tracking-[0.1em]`;
      return `${baseClasses} text-xs tracking-[0.15em]`;

    default:
      return baseClasses;
  }
}

export const QuestionFlowVisualizer = ({ onComplete }: QuestionFlowVisualizerProps) => {
  const navigate = useNavigate();
  const { pathwayConfig, setAudioBlob, pathway, userProfile, setApiStatus, setApiResult, setVisualizedResult, language } = useAssessment();

  // Question pool: draw QUESTION_COUNT to start; a fresh unused one is pulled in
  // if a take doesn't capture enough speech and that question needs re-asking.
  const questionPoolRef = useRef<string[]>(getQuestionPool(language));
  const poolCursorRef = useRef(QUESTION_COUNT);
  const [QUESTIONS, setQuestions] = useState<string[]>(() =>
    questionPoolRef.current.slice(0, QUESTION_COUNT)
  );

  const getNextPoolQuestion = useCallback(() => {
    if (poolCursorRef.current >= questionPoolRef.current.length) {
      questionPoolRef.current = getQuestionPool(language);
      poolCursorRef.current = 0;
    }
    const question = questionPoolRef.current[poolCursorRef.current];
    poolCursorRef.current += 1;
    return question;
  }, [language]);

  const isSeniorMode = getIsSeniorMode(userProfile.ageRange);
  const isHighVis = getIsHighVis(userProfile.ageRange);
  
  // Question flow state
  const [currentQuestion, setCurrentQuestion] = useState(0); // 0-indexed
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecondsLeft, setRecordingSecondsLeft] = useState(RECORDING_DURATION_SECONDS);
  const [hasRecordedCurrentQuestion, setHasRecordedCurrentQuestion] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [insufficientSpeechWarning, setInsufficientSpeechWarning] = useState<string | null>(null);
  /*
    The recorder is only usable once getUserMedia has resolved and MediaRecorder
    exists. Nothing gated the record button on that before: the button was live
    from first paint, and a click landing before the stream arrived started
    neither the recorder nor the analyser loop, which reports as a 0s take.
  */
  const [recorderReady, setRecorderReady] = useState(false);

  // Visual effects
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [scannerRotation, setScannerRotation] = useState(0);
  
  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Per-question accumulated audio buffers, one slot per asked question.
  const questionAudioBuffersRef = useRef<AudioBuffer[][]>(
    Array.from({ length: QUESTION_COUNT }, () => [])
  );
  // All questions final audio buffers
  const allQuestionsAudioRef = useRef<AudioBuffer[]>([]);
  
  const healthCheckDoneRef = useRef(false);

  // Live mic waveform overlay (adapted from amplifier-demo-sites/generator/template_try.html),
  // rendered as a linear bar strip like the home page's waveform graphic.
  const WAVE_BARS = 48;
  const waveformRafRef = useRef<number | null>(null);
  const waveBarRefs = useRef<(HTMLDivElement | null)[]>([]);
  const waveNoiseFloorRef = useRef(0.01);
  const wavePeakRef = useRef(0.02);
  const waveLevelRef = useRef(0);
  const waveScalesRef = useRef<number[]>(new Array(WAVE_BARS).fill(0));
  const lastFrameTimeRef = useRef(0);
  // Total seconds where mic input registered as actual speech (above the adaptive
  // noise floor), not just ambient room noise. Checked against MIN_SPEECH_SECONDS
  // when a take ends, so a mostly-silent recording gets re-asked instead of accepted.
  const speechSecondsRef = useRef(0);
  /** Loudest rms the analyser saw this take. 0 means the graph delivered nothing. */
  const peakRmsSeenRef = useRef(0);
  /** Frames the tick loop ran this take. 0 means the loop never started. */
  const tickCountRef = useRef(0);
  /** AudioContext state as of the last frame. */
  const audioCtxStateRef = useRef<string>("none");
  /** Whether the OS has the mic muted out from under the browser. */
  const micMutedRef = useRef(false);

  const BUTTON_SIZE = isSeniorMode ? 168 : 120;
  const RING_SIZE = Math.round(BUTTON_SIZE * 0.85);

  const accentColor = pathwayConfig?.color || "#1E5631";
  const metadata = pathwayConfig?.metadata || {
    topLeft: { label: "FREQ", value: "SCAN" },
    topRight: { label: "HARM", value: "DETECT" },
    bottomLeft: { label: "STAGE", value: "1" },
    bottomRight: { label: "CONF", value: "0%" },
  };

  // Staggered content reveal
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 400);
    return () => clearTimeout(timer);
  }, []);

  // Process audio analysis
  const processAudioAnalysis = useCallback(async (audioBlob: Blob, format?: string, extension?: string, mimeType?: string) => {
    if (!isAssessmentPathwayEnabled(pathway)) {
      console.warn(`[QuestionFlowVisualizer] Pathway ${pathway} is disabled`);
      setApiStatus("failed");
      return;
    }

    setApiStatus("pending");
    try {
      setApiStatus("processing");

      // Route to the v2 model that matches the health focus picked in triage,
      // so a "Brain Health" pick is analysed by clarity rather than pulse.
      const model = getModelForPathway(pathway);
      const analyzeFunction = leadgenWellnessAnalyzeAudioSync;
      const jobDetail = await analyzeFunction({
        audioFile: audioBlob,
        format: format as 'wav' | 'flac' | 'mp3' | undefined,
        extension,
        mimeType,
        model,
      });

      console.log("[QuestionFlowVisualizer] Analysis completed:", jobDetail.job_id);
      setApiResult(jobDetail.result);

      if (pathway && jobDetail.result) {
        try {
          /*
            v2 only. A payload that is not v2-shaped used to fall through to a
            legacy mapper scoped to the BRAIN_AGE pathway, which produced a
            z-score feature table for whichever assessment the user picked. That
            mapper is gone, so an unrecognised shape now fails loudly rather
            than rendering a result built for a different API.
          */
          if (!isV2Result(jobDetail.result)) {
            console.error(
              "[QuestionFlowVisualizer] Response is not a v2 result shape:",
              jobDetail.result
            );
            setApiStatus("failed");
            return;
          }

          const visualized = transformV2ResultToVisualization(
            jobDetail as V2JobDetail,
            pathway
          );

          setVisualizedResult(visualized);
          console.log("[QuestionFlowVisualizer] Result transformed:", visualized);
        } catch (transformError) {
          console.error("[QuestionFlowVisualizer] Transformation failed:", transformError);
        }
      }
      
      setApiStatus("done");
    } catch (apiError) {
      console.error("[QuestionFlowVisualizer] Analysis failed:", apiError);
      setApiStatus("failed");
    }
  }, [pathway, userProfile, setApiStatus, setApiResult, setVisualizedResult]);

  // Initialize audio recording
  useEffect(() => {
    const initRecording = async () => {
      try {
        if (!MediaRecorder.isTypeSupported(RECORDING_MIME_TYPE)) {
          console.warn("[QuestionFlowVisualizer] Browser doesn't support audio/webm;codecs=opus");
          navigate("/recording-not-supported", { replace: true, state: { reason: "codec" } });
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: { ideal: RECORDING_SAMPLE_RATE },
            channelCount: { ideal: 1 },
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        audioStreamRef.current = stream;

        const audioTrack = stream.getAudioTracks()[0];
        const settings = audioTrack?.getSettings();
        const actualSampleRate = settings?.sampleRate ?? 0;
        if (actualSampleRate !== RECORDING_SAMPLE_RATE) {
          stream.getTracks().forEach((t) => t.stop());
          console.warn("[QuestionFlowVisualizer] Mic not 48kHz:", actualSampleRate);
          navigate("/recording-not-supported", { replace: true, state: { reason: "codec" } });
          return;
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType: RECORDING_MIME_TYPE });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
        };

        /*
          Chrome can grant getUserMedia and still hand over a track that carries
          no audio, when the OS-level microphone is unavailable to it or another
          application holds the device. It marks that with track.muted, which is
          separate from track.enabled and from permission being denied — a denial
          rejects getUserMedia and is handled in the catch below.

          Confirmed on 2026-09-09: the same build recorded correctly in Safari
          while Chrome produced silent takes, which the speech gate then reported
          as "Only 0s of speech captured" — blaming the speaker for a device
          problem they cannot fix by answering a different question.
        */
        micMutedRef.current = audioTrack.muted;
        audioTrack.onmute = () => {
          micMutedRef.current = true;
        };
        audioTrack.onunmute = () => {
          micMutedRef.current = false;
        };

        setRecorderReady(true);
      } catch (error) {
        console.error("Error initializing audio:", error);
        const reason = error instanceof DOMException && error.name === "NotAllowedError" ? "permission" : "codec";
        navigate("/recording-not-supported", { replace: true, state: { reason } });
      }
    };

    initRecording();

    return () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [navigate]);

  // Recording auto-stops after a fixed 15 seconds
  useEffect(() => {
    if (!isRecording) {
      setRecordingSecondsLeft(RECORDING_DURATION_SECONDS);
      return;
    }

    const interval = window.setInterval(() => {
      setRecordingSecondsLeft((prev) => {
        if (prev <= 1) {
          stopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Live mic waveform ring — analyser + adaptive noise-floor gain gating,
  // ported from amplifier-demo-sites/generator/template_try.html so the bars
  // only rise while the speaker is actually talking, not on ambient room noise.
  useEffect(() => {
    if (!isRecording || !audioStreamRef.current) return;

    const stream = audioStreamRef.current;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextCtor();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.7;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -25;
    src.connect(analyser);
    // WebKit will not pull audio through an analyser unless the graph reaches
    // the destination; route it there through a muted gain so nothing is audible.
    const sink = audioCtx.createGain();
    sink.gain.value = 0;
    analyser.connect(sink);
    sink.connect(audioCtx.destination);

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);
    waveNoiseFloorRef.current = 0.01;
    wavePeakRef.current = 0.02;
    waveLevelRef.current = 0;
    waveScalesRef.current = new Array(WAVE_BARS).fill(0);
    lastFrameTimeRef.current = 0;
    speechSecondsRef.current = 0;
    peakRmsSeenRef.current = 0;
    tickCountRef.current = 0;

    const tick = () => {
      const now = performance.now();
      const dt = lastFrameTimeRef.current ? (now - lastFrameTimeRef.current) / 1000 : 0;
      lastFrameTimeRef.current = now;

      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);

      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = (time[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);

      if (rms < waveNoiseFloorRef.current) {
        waveNoiseFloorRef.current += (rms - waveNoiseFloorRef.current) * 0.5;
      } else if (rms < waveNoiseFloorRef.current * 1.4 + 0.001) {
        waveNoiseFloorRef.current += (rms - waveNoiseFloorRef.current) * 0.02;
      }
      waveNoiseFloorRef.current = Math.min(waveNoiseFloorRef.current, 0.02);
      wavePeakRef.current = Math.max(wavePeakRef.current * 0.9985, rms, waveNoiseFloorRef.current * 2.5 + 0.008);
      waveLevelRef.current = rms > waveLevelRef.current ? rms : waveLevelRef.current * 0.86 + rms * 0.14;

      const base = waveNoiseFloorRef.current * 1.6 + 0.0015;
      const gain = Math.max(
        0,
        Math.min(1, (waveLevelRef.current - base) / Math.max(wavePeakRef.current * 0.75 - base, 0.006))
      );

      tickCountRef.current += 1;
      audioCtxStateRef.current = audioCtx.state;
      if (rms > peakRmsSeenRef.current) peakRmsSeenRef.current = rms;

      if (gain > SPEECH_GAIN_THRESHOLD) {
        speechSecondsRef.current += dt;
      }

      const half = Math.floor(freq.length * 0.5);
      for (let i = 0; i < WAVE_BARS; i++) {
        const bin = freq[Math.floor((i / WAVE_BARS) * half)] / 255;
        const target = gain > 0.001 ? Math.pow(bin, 1.3) * (0.35 + 0.65 * gain) : 0;
        const prev = waveScalesRef.current[i];
        const next = prev + (target - prev) * (target > prev ? 0.55 : 0.18);
        waveScalesRef.current[i] = next;

        const el = waveBarRefs.current[i];
        if (el) {
          const scale = Math.max(0.06, Math.min(1, next));
          el.style.transform = `scaleY(${scale})`;
        }
      }

      waveformRafRef.current = requestAnimationFrame(tick);
    };
    waveformRafRef.current = requestAnimationFrame(tick);

    return () => {
      if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
      try {
        audioCtx.close();
      } catch {
        // ignore
      }
    };
  }, [isRecording, recorderReady]);

  // Advance to next question or complete
  const advanceToNextQuestion = useCallback(async () => {
    if (currentQuestion >= QUESTIONS.length - 1) {
      // All questions complete - merge all audio and send for analysis
      setIsComplete(true);
      
      try {
        // Flatten all question audio buffers
        const allBuffers = questionAudioBuffersRef.current.flat();
        if (allBuffers.length === 0) {
          console.error("[QuestionFlowVisualizer] No audio recorded");
          setApiStatus("failed");
          return;
        }

        const merged = mergeAudioBuffers(allBuffers);
        const { blob, format, extension, mimeType } = await convertAudioBufferToBlob(merged);
        
        setAudioBlob(blob);
        console.log(`[QuestionFlowVisualizer] Final audio (${format}):`, blob.size, "bytes");
        
        // processAudioAnalysis sets apiStatus to processing synchronously before
        // its first await, so the analysis screen has the state it needs the
        // moment it mounts. The wait here only covers the button fading out;
        // it used to be 800ms on top of the encode, which left the finished
        // capture screen sitting there.
        processAudioAnalysis(blob, format, extension, mimeType);

        setTimeout(onComplete, 200);
      } catch (error) {
        console.error("[QuestionFlowVisualizer] Error processing final audio:", error);
        setApiStatus("failed");
      }
    } else {
      // Move to next question
      setCurrentQuestion(prev => prev + 1);
      setHasRecordedCurrentQuestion(false);
    }
  }, [currentQuestion, setAudioBlob, processAudioAnalysis, onComplete, setApiStatus]);

  // Start recording
  const startRecording = useCallback(() => {
    if (isComplete) return;
    
    // Run health check on first recording
    if (!healthCheckDoneRef.current) {
      runLeadGenHealthCheck();
      healthCheckDoneRef.current = true;
    }
    
    // Start recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
      audioChunksRef.current = [];
      mediaRecorderRef.current.start(100);
    }

    setInsufficientSpeechWarning(null);
    setIsRecording(true);
  }, [isComplete]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!isRecording) return;
    
    setIsRecording(false);
    setHasRecordedCurrentQuestion(true);
    
    // Stop media recorder and process audio
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      
      mediaRecorderRef.current.onstop = async () => {
        try {
          const spokeSeconds = speechSecondsRef.current;
          if (spokeSeconds < MIN_SPEECH_SECONDS) {
            /*
              A silent microphone and a quiet speaker are different failures and
              used to print the same sentence. The microphone is the cause when
              the track is muted, or when the analyser ran but never saw a
              non-zero sample — either way, asking for another answer cannot fix
              it, so the message names the device instead.
            */
            const noSignal = micMutedRef.current || peakRmsSeenRef.current === 0;
            console.warn("[QuestionFlowVisualizer] short take, re-asking", {
              speechSeconds: +spokeSeconds.toFixed(2),
              tickFrames: tickCountRef.current,
              audioCtxState: audioCtxStateRef.current,
              peakRms: +peakRmsSeenRef.current.toFixed(4),
              micMuted: micMutedRef.current,
              audioChunks: audioChunksRef.current.length,
            });
            setQuestions((prev) => {
              const next = [...prev];
              next[currentQuestion] = getNextPoolQuestion();
              return next;
            });
            setInsufficientSpeechWarning(
              noSignal
                ? "No sound is reaching this browser from your microphone. Check its microphone access in system settings, close any app that might be using the mic, or try Safari."
                : `Only ${Math.round(spokeSeconds)}s of speech captured. Let's try a different question.`
            );
            setHasRecordedCurrentQuestion(false);
            return;
          }

          const segmentBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorderRef.current?.mimeType || RECORDING_MIME_TYPE,
          });
          const decoded = await decodeBlobToAudioBuffer(segmentBlob);

          // Add to current question's audio buffers
          questionAudioBuffersRef.current[currentQuestion].push(decoded);
          console.log(`[QuestionFlowVisualizer] Q${currentQuestion + 1} segment recorded`);

          // Move straight to the next question, no countdown
          advanceToNextQuestion();
        } catch (error) {
          console.error("[QuestionFlowVisualizer] Error processing segment:", error);
        }
      };
    }
  }, [isRecording, currentQuestion, advanceToNextQuestion, getNextPoolQuestion]);

  // Click to start recording immediately, or stop if already recording
  const handleRecordClick = useCallback(() => {
    if (isComplete) return;
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  }, [isComplete, isRecording, stopRecording, startRecording]);

  // Generate ripples while recording
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      const intensity = 0.5 + Math.random() * 0.5;
      setRipples(prev => [
        ...prev.slice(-5),
        { id: Date.now(), startTime: Date.now(), intensity }
      ]);
    }, 400);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Rotate scanner while recording
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      setScannerRotation(prev => (prev + 1) % 360);
    }, 30);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Clean up old ripples
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRipples(prev => prev.filter(r => now - r.startTime < 2000));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="relative w-full h-full flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Background photo, distinct per question — full-bleed, offset to one side so it doesn't sit dead-center behind the text */}
      <AnimatePresence mode="sync">
        <motion.div
          key={currentQuestion}
          className="absolute inset-0 bg-cover pointer-events-none"
          style={{
            backgroundImage: `url(${QUESTION_BACKGROUNDS[currentQuestion % QUESTION_BACKGROUNDS.length]})`,
            backgroundPosition: "85% center",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      </AnimatePresence>

      {/* Foreground UI — explicitly layered above the background photo */}
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">

      {/* Hardware Frame */}
      <div className="absolute inset-5 border border-black/10 pointer-events-none" />

      {/* Corner Brackets */}
      <CornerBracket position="top-left" />
      <CornerBracket position="top-right" />
      <CornerBracket position="bottom-left" />
      <CornerBracket position="bottom-right" />

      {/* Status Indicators */}
      <div className="absolute top-8 left-8 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: isRecording ? '#ef4444' : 'rgba(0,0,0,0.3)' }}
            animate={{ opacity: isRecording ? [1, 0.3, 1] : 0.5 }}
            transition={{ duration: 0.6, repeat: isRecording ? Infinity : 0 }}
          />
          <span className="font-mono font-bold text-[10px] tracking-widest" style={{ color: 'rgba(0,0,0,1)' }}>
            {isRecording ? 'SYS.REC' : 'SYS.RDY'}
          </span>
        </div>
        <div className="font-mono font-bold text-[10px] tracking-widest mt-1">
          <span style={{ color: 'rgba(0,0,0,1)' }}>{metadata.topLeft.label}:</span>{' '}
          <span style={{ color: `${accentColor}` }}>{metadata.topLeft.value}</span>
        </div>
      </div>

      {/* Top Right - Question Progress */}
      <div className="absolute top-8 right-8 text-right">
        <div className={`${getTextClasses(isSeniorMode, isHighVis, 'progress')}`} style={{ color: 'rgba(0,0,0,1)' }}>
          {t("questionOf", language)} {currentQuestion + 1} {t("of", language)} {QUESTIONS.length}
        </div>
        <div className="font-mono font-bold text-[10px] tracking-widest mt-1">
          <span style={{ color: 'rgba(0,0,0,1)' }}>{metadata.topRight.label}:</span>{' '}
          <span style={{ color: `${accentColor}` }}>{metadata.topRight.value}</span>
        </div>
      </div>

      {/* Question Display Area */}
      <div className="text-center px-8 mb-32" style={{ maxWidth: '700px' }}>
        <AnimatePresence mode="sync">
          {showContent && !isComplete && (
            <motion.div
              key={`question-${currentQuestion}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-8"
            >
              {/* Question Text */}
              <motion.p
                className={getTextClasses(isSeniorMode, isHighVis, 'question')}
                style={{ color: 'rgba(0, 0, 0, 1)' }}
              >
                {QUESTIONS[currentQuestion]}
              </motion.p>

              {/* Recording indicator */}
              {isRecording && (
                <motion.p
                  className={getTextClasses(isSeniorMode, isHighVis, 'instruction')}
                  style={{ color: '#1E5631' }}
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  {t("recording", language)}
                </motion.p>
              )}

              {/* Insufficient speech warning — shown after a take with too little detected speech */}
              {!isRecording && insufficientSpeechWarning && (
                <motion.p
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={getTextClasses(isSeniorMode, isHighVis, 'instruction')}
                  style={{ color: '#B45309' }}
                >
                  {insufficientSpeechWarning}
                </motion.p>
              )}

            </motion.div>
          )}

          {isComplete && (
            <motion.p
              key="complete"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={getTextClasses(isSeniorMode, isHighVis, 'instruction')}
              style={{ color: '#1E5631' }}
            >
              {t("processingResponses", language)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Control Section */}
      <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2">
        
        {/* Ripple Container */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {ripples.map((ripple) => {
            const age = Date.now() - ripple.startTime;
            const progress = age / 2000;
            const scale = 1 + progress * 3 * ripple.intensity;
            const opacity = (1 - progress) * 0.4 * ripple.intensity;
            
            return (
              <motion.div
                key={ripple.id}
                className="absolute w-20 h-20 rounded-full border border-cyan-400"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale, opacity }}
                transition={{ duration: 0.1, ease: "linear" }}
                style={{
                  boxShadow: `0 0 ${10 * ripple.intensity}px rgba(30, 86, 49, ${opacity * 0.5})`
                }}
              />
            );
          })}
        </div>

        {/* Scanner Ring */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: isRecording ? 1 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <div 
            className="w-[120px] h-[120px] rounded-full border border-cyan-400/20"
            style={{
              transform: `rotate(${scannerRotation}deg)`,
              background: `conic-gradient(from ${scannerRotation}deg, transparent 0deg, rgba(30, 86, 49, 0.15) 30deg, transparent 60deg)`
            }}
          />
        </motion.div>

        {/* Recording duration ring (15s, counts down) */}
        {isRecording && (
          <svg
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 pointer-events-none"
            style={{ width: RING_SIZE, height: RING_SIZE }}
            viewBox="0 0 100 100"
          >
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(0, 0, 0, 0.1)" strokeWidth="2" />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#1E5631"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - recordingSecondsLeft / RECORDING_DURATION_SECONDS)}
              style={{ filter: 'drop-shadow(0 0 6px rgba(30, 86, 49, 0.6))', transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
        )}

        {/* Live mic waveform — linear bar strip overlaid across the record circle,
            matching the home page's waveform graphic. Monochrome, no glow; bars are
            driven imperatively (via refs) by the analyser tick loop above, calibrated
            to the mic with the same adaptive noise-floor gating. */}
        {isRecording && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-[3px] pointer-events-none"
            style={{ width: BUTTON_SIZE * 3, height: BUTTON_SIZE * 0.5 }}
          >
            {Array.from({ length: WAVE_BARS }, (_, i) => (
              <div
                key={i}
                ref={(el) => { waveBarRefs.current[i] = el; }}
                className="w-[3px] rounded-full bg-black/70"
                style={{ height: '100%', transform: 'scaleY(0.06)', transformOrigin: 'center' }}
              />
            ))}
          </div>
        )}

        {/*
          The Record Button.

          Hidden outright once the last recording is in, not merely disabled.
          isComplete is set before the audio is merged and encoded, so a button
          that only greys out sits there through the encode and the handoff -
          long enough to read as "press START again" when the capture is
          actually already finished.
        */}
        <motion.button
          className="relative rounded-full flex items-center justify-center cursor-pointer select-none touch-none"
          style={{
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            border: `1px solid ${isRecording ? '#1E5631' : 'rgba(0, 0, 0, 0.3)'}`,
            backgroundColor: isRecording ? 'rgba(30, 86, 49, 0.15)' : '#FFFFFF',
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
            pointerEvents: isComplete ? 'none' : 'auto',
          }}
          onClick={handleRecordClick}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: isComplete ? 0 : 1,
            y: 0,
            scale: isComplete ? 0.92 : 1,
            boxShadow: isRecording
              ? [
                  '0 0 24px rgba(30, 86, 49, 0.55), 0 0 48px rgba(30, 86, 49, 0.3), inset 0 0 16px rgba(30, 86, 49, 0.15)',
                  '0 0 44px rgba(30, 86, 49, 0.8), 0 0 88px rgba(30, 86, 49, 0.45), inset 0 0 22px rgba(30, 86, 49, 0.22)',
                  '0 0 24px rgba(30, 86, 49, 0.55), 0 0 48px rgba(30, 86, 49, 0.3), inset 0 0 16px rgba(30, 86, 49, 0.15)',
                ]
              : '0 2px 20px rgba(0, 0, 0, 0.08)',
          }}
          transition={{
            default: isComplete
              ? { duration: 0.2, ease: 'easeOut' }
              : { delay: 0.6, duration: 0.5 },
            boxShadow: isRecording
              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 },
          }}
          disabled={isComplete || !recorderReady}
        >
          {isRecording ? (
            <motion.span
              key="timer"
              className={`font-mono font-bold ${isSeniorMode ? 'text-7xl' : 'text-6xl'}`}
              style={{ color: '#1E5631' }}
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            >
              {recordingSecondsLeft}
            </motion.span>
          ) : (
            <span
              className={getTextClasses(isSeniorMode, isHighVis, 'button')}
              style={{ color: 'rgba(0, 0, 0, 1)' }}
            >
              START
            </span>
          )}
        </motion.button>
      </div>

      {/* Question progress dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
        {QUESTIONS.map((_, index) => (
          <div
            key={index}
            className="w-2 h-2 rounded-full transition-colors duration-300"
            style={{
              backgroundColor: index < currentQuestion 
                ? '#1E5631' 
                : index === currentQuestion 
                  ? 'rgba(30, 86, 49, 0.5)' 
                  : 'rgba(0, 0, 0, 0.2)'
            }}
          />
        ))}
      </div>
      </div>
    </motion.div>
  );
};
