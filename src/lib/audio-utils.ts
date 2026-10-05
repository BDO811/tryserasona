/**
 * Audio utility functions for recording and format conversion
 */

import lamejs from 'lamejs';
import { asset } from '@/lib/asset';

// Declare global Flac type
declare global {
  interface Window {
    Flac?: any;
    FLAC_SCRIPT_LOCATION?: string;
  }
}

/**
 * Audio format types supported by LeadGen API
 */
export type AudioFormat = 'wave' | 'wav' | 'flac' | 'mp3';

/** Recording and encoding target: WebM Opus at 48 kHz. All encoders re-encode to this. */
export const RECORDING_SAMPLE_RATE = 48000;

/**
 * Get audio format from environment variable (defaults to 'flac')
 * Valid values: 'wave', 'wav', 'flac', 'mp3'
 */
// Cache format to avoid reading env var multiple times
let cachedFormat: AudioFormat | null = null;

export function getAudioFormat(): AudioFormat {
  // Return cached format if already determined
  if (cachedFormat !== null) {
    return cachedFormat;
  }

  const envFormat = (import.meta.env.VITE_AUDIO_FORMAT || 'flac').toLowerCase().trim();
  // Normalize 'wave' to 'wav'
  let format: AudioFormat = 'flac';
  if (envFormat === 'wave') {
    format = 'wav';
  } else if (['wav', 'flac', 'mp3'].includes(envFormat)) {
    format = envFormat as AudioFormat;
  } else {
    console.warn(`[audio-utils] Invalid VITE_AUDIO_FORMAT "${envFormat}", defaulting to 'flac'`);
  }
  
  cachedFormat = format;
  return format;
}

/**
 * Get file extension for audio format
 */
export function getAudioFileExtension(format: AudioFormat): string {
  return format === 'wav' ? '.wav' : format === 'mp3' ? '.mp3' : '.flac';
}

/**
 * Get MIME type for audio format
 */
export function getAudioMimeType(format: AudioFormat): string {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'flac':
      return 'audio/flac';
    default:
      return 'audio/flac';
  }
}

// Lazy load libflacjs via script tag injection (browser-compatible)
let flacLib: any = null;
let flacLoadPromise: Promise<any> | null = null;

async function getFlacLib(): Promise<any> {
  // Return cached instance if already loaded and ready
  if (flacLib && flacLib.isReady && flacLib.isReady()) {
    return flacLib;
  }

  if (flacLoadPromise) {
    return flacLoadPromise;
  }

  flacLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded and ready
    if (window.Flac && window.Flac.isReady && window.Flac.isReady()) {
      flacLib = window.Flac;
      resolve(flacLib);
      return;
    }

    window.FLAC_SCRIPT_LOCATION = asset('libflacjs/');
    const useWasm = typeof WebAssembly !== 'undefined';
    const libFile = useWasm ? 'libflac.wasm.js' : 'libflac.js';
    const scriptUrl = `${window.FLAC_SCRIPT_LOCATION}${libFile}`;

    // Create and inject script tag
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = scriptUrl;
    
    const handleReady = () => {
      if (window.Flac) {
        flacLib = window.Flac;
        // Verify library methods are available
        if (flacLib.create_libflac_encoder) {
          console.log('[audio-utils] FLAC library ready with create_libflac_encoder');
          resolve(flacLib);
        } else {
          reject(new Error('FLAC library loaded but create_libflac_encoder method not available'));
        }
      } else {
        reject(new Error('FLAC library ready event fired but window.Flac is undefined'));
      }
    };

    script.onload = () => {
      // Wait for Flac to be available on window
      const waitForFlac = (attempts = 0) => {
        if (window.Flac) {
          flacLib = window.Flac;
          
          // Check if already ready (synchronous case or already initialized)
          if (flacLib.isReady && flacLib.isReady()) {
            handleReady();
            return;
          }
          
          // For WASM, use the 'ready' event listener (libflac.js uses event-based initialization)
          if (flacLib.on && typeof flacLib.on === 'function') {
            console.log('[audio-utils] Waiting for FLAC ready event...');
            flacLib.on('ready', handleReady);
          } else if (flacLib.ready && typeof flacLib.ready.then === 'function') {
            // Fallback: some versions expose a ready promise
            flacLib.ready.then(handleReady).catch(reject);
          } else {
            // Final fallback: poll for readiness
            const pollReady = (pollAttempts = 0) => {
              if (flacLib.isReady && flacLib.isReady()) {
                handleReady();
              } else if (flacLib.create_libflac_encoder) {
                // Method exists, assume ready
                handleReady();
              } else if (pollAttempts < 100) { // 5 second timeout (50ms * 100)
                setTimeout(() => pollReady(pollAttempts + 1), 50);
              } else {
                reject(new Error('FLAC WASM library failed to initialize within timeout'));
              }
            };
            pollReady();
          }
        } else if (attempts < 50) { // 2.5 second timeout for script parsing
          setTimeout(() => waitForFlac(attempts + 1), 50);
        } else {
          reject(new Error('FLAC library failed to initialize - window.Flac not available'));
        }
      };
      
      waitForFlac();
    };
    
    script.onerror = (error) => {
      reject(new Error(`Failed to load libflacjs from ${scriptUrl}: ${error}`));
    };
    
    document.head.appendChild(script);
  });

  return flacLoadPromise;
}

/**
 * Convert AudioBuffer to WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numberOfChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, "RIFF");
  view.setUint32(4, bufferSize - 8, true);
  writeString(8, "WAVE");

  // fmt chunk
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  // Write audio data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

/**
 * Convert AudioBuffer to MP3 format using lamejs
 */
function audioBufferToMp3(buffer: AudioBuffer, bitrate: number = 128): ArrayBuffer {
  const sampleRate = buffer.sampleRate;
  const numberOfChannels = buffer.numberOfChannels;
  const length = buffer.length;

  // Create MP3 encoder
  const mp3encoder = new lamejs.Mp3Encoder(numberOfChannels, sampleRate, bitrate);
  const mp3Data: Int8Array[] = [];

  // Convert AudioBuffer to Int16Array PCM
  const samplesPerChannel = length;
  const leftChannel = new Int16Array(samplesPerChannel);
  const rightChannel = numberOfChannels > 1 ? new Int16Array(samplesPerChannel) : leftChannel;

  for (let i = 0; i < length; i++) {
    const leftSample = Math.max(-1, Math.min(1, buffer.getChannelData(0)[i]));
    leftChannel[i] = leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7fff;

    if (numberOfChannels > 1) {
      const rightSample = Math.max(-1, Math.min(1, buffer.getChannelData(1)[i]));
      rightChannel[i] = rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7fff;
    }
  }

  // Encode in chunks (lamejs processes 1152 samples at a time)
  const sampleBlockSize = 1152;
  for (let i = 0; i < samplesPerChannel; i += sampleBlockSize) {
    const leftChunk = leftChannel.subarray(i, i + sampleBlockSize);
    const rightChunk = numberOfChannels > 1 ? rightChannel.subarray(i, i + sampleBlockSize) : leftChunk;
    
    const mp3buf = numberOfChannels > 1
      ? mp3encoder.encodeBuffer(leftChunk, rightChunk)
      : mp3encoder.encodeBuffer(leftChunk);
    
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  // Flush encoder to get final MP3 data
  const finalBuf = mp3encoder.flush();
  if (finalBuf.length > 0) {
    mp3Data.push(finalBuf);
  }

  // Combine all MP3 chunks
  const totalLength = mp3Data.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Data) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * Convert audio blob to WAV format (re-encodes at RECORDING_SAMPLE_RATE when decoding from WebM/Opus).
 */
export async function convertToWav(
  audioBlob: Blob,
  sampleRate: number = RECORDING_SAMPLE_RATE
): Promise<Blob> {
  if (audioBlob.type === "audio/wav" || audioBlob.type === "audio/wave") {
    return audioBlob;
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate,
  });

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const wavBuffer = audioBufferToWav(audioBuffer);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    await audioContext.close();
  }
}

/**
 * Convert audio blob to MP3 format (re-encodes at RECORDING_SAMPLE_RATE when decoding from WebM/Opus).
 */
export async function convertToMp3(
  audioBlob: Blob,
  sampleRate: number = RECORDING_SAMPLE_RATE,
  bitrate: number = 128
): Promise<Blob> {
  if (audioBlob.type === "audio/mpeg" || audioBlob.type === "audio/mp3") {
    return audioBlob;
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate,
  });

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const mp3Buffer = audioBufferToMp3(audioBuffer, bitrate);
    return new Blob([mp3Buffer], { type: "audio/mpeg" });
  } finally {
    await audioContext.close();
  }
}

/**
 * Convert audio blob to FLAC format (re-encodes at RECORDING_SAMPLE_RATE when decoding from WebM/Opus).
 */
export async function convertToFlac(
  audioBlob: Blob,
  sampleRate: number = RECORDING_SAMPLE_RATE
): Promise<Blob> {
  if (audioBlob.type === "audio/flac" || audioBlob.type === "audio/x-flac") {
    return audioBlob;
  }

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate,
  });

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const flacBuffer = await audioBufferToFlac(audioBuffer);
    return new Blob([flacBuffer], { type: "audio/flac" });
  } finally {
    await audioContext.close();
  }
}

/**
 * Convert audio blob to the format specified by VITE_AUDIO_FORMAT environment variable.
 * Re-encodes at RECORDING_SAMPLE_RATE (48 kHz) when decoding from WebM/Opus.
 *
 * @param audioBlob - Original audio blob (any format)
 * @param sampleRate - Target sample rate (default: RECORDING_SAMPLE_RATE = 48 kHz)
 * @returns Audio blob in the configured format
 */
export async function convertAudio(
  audioBlob: Blob,
  sampleRate: number = RECORDING_SAMPLE_RATE
): Promise<{ blob: Blob; format: AudioFormat; extension: string; mimeType: string }> {
  const format = getAudioFormat();
  
  let convertedBlob: Blob;
  switch (format) {
    case 'wav':
      convertedBlob = await convertToWav(audioBlob, sampleRate);
      break;
    case 'mp3':
      convertedBlob = await convertToMp3(audioBlob, sampleRate);
      break;
    case 'flac':
    default:
      convertedBlob = await convertToFlac(audioBlob, sampleRate);
      break;
  }

  return {
    blob: convertedBlob,
    format,
    extension: getAudioFileExtension(format),
    mimeType: getAudioMimeType(format),
  };
}

/**
 * Decode a WebM (or other supported) blob to an AudioBuffer.
 * Uses default AudioContext so decoded buffer keeps source sample rate.
 */
export async function decodeBlobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }
}

/**
 * Merge multiple AudioBuffers (same sample rate and channel count) into one.
 */
export function mergeAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error("mergeAudioBuffers: no buffers");
  }
  if (buffers.length === 1) {
    return buffers[0];
  }
  const first = buffers[0];
  const sampleRate = first.sampleRate;
  const numberOfChannels = first.numberOfChannels;
  const totalLength = buffers.reduce((sum, b) => sum + b.length, 0);
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
  const merged = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);
  let offset = 0;
  for (const buf of buffers) {
    if (buf.sampleRate !== sampleRate || buf.numberOfChannels !== numberOfChannels) {
      ctx.close();
      throw new Error("mergeAudioBuffers: incompatible sample rate or channel count");
    }
    for (let ch = 0; ch < numberOfChannels; ch++) {
      merged.getChannelData(ch).set(buf.getChannelData(ch), offset);
    }
    offset += buf.length;
  }
  ctx.close();
  return merged;
}

/**
 * Convert an AudioBuffer to the configured format (FLAC, WAV, or MP3).
 * Used when merging multi-segment recordings before encoding.
 */
export async function convertAudioBufferToBlob(
  buffer: AudioBuffer
): Promise<{ blob: Blob; format: AudioFormat; extension: string; mimeType: string }> {
  const format = getAudioFormat();
  let blob: Blob;
  switch (format) {
    case "wav":
      blob = new Blob([audioBufferToWav(buffer)], { type: "audio/wav" });
      break;
    case "mp3":
      blob = new Blob([audioBufferToMp3(buffer)], { type: "audio/mpeg" });
      break;
    case "flac":
    default:
      blob = new Blob([await audioBufferToFlac(buffer)], { type: "audio/flac" });
      break;
  }
  return {
    blob,
    format,
    extension: getAudioFileExtension(format),
    mimeType: getAudioMimeType(format),
  };
}

/**
 * Convert AudioBuffer to FLAC format using libflacjs
 */
async function audioBufferToFlac(buffer: AudioBuffer): Promise<ArrayBuffer> {
  const Flac = await getFlacLib();
  
  return new Promise((resolve, reject) => {
    try {
      const sampleRate = buffer.sampleRate;
      const numberOfChannels = buffer.numberOfChannels;
      const bitsPerSample = 16; // 16-bit PCM samples (-32768..32767)
      const length = buffer.length;
      const compressionLevel = 5; // Compression level 0-8 (5 is balanced)
      // Total number of samples per channel in this buffer;
      // used for STREAMINFO.total_samples so duration/bitrate are non-zero.
      const totalSamples = length;
      const isVerify = false; // Disable verification for faster encoding

      // Collect FLAC output data
      const flacChunks: Uint8Array[] = [];

      const writeCallback = (buffer: Uint8Array, _bytes: number, _samples: number, _current_frame: number) => {
        flacChunks.push(new Uint8Array(buffer));
      };

      // Metadata callback (optional)
      const metadataCallback = (data: any) => {
        // Metadata received, can be used for verification if needed
      };

      // Create encoder using the library's API
      // create_libflac_encoder(sampleRate, channels, bitsPerSample, compressionLevel, totalSamples, verify)
      const encoder = Flac.create_libflac_encoder(
        sampleRate,
        numberOfChannels,
        bitsPerSample,
        compressionLevel,
        totalSamples,
        isVerify
      );

      if (encoder === 0) {
        reject(new Error("Failed to create FLAC encoder"));
        return;
      }

      // Initialize stream encoder (native FLAC container, not Ogg)
      const initStatus = Flac.init_encoder_stream(
        encoder,
        writeCallback,
        metadataCallback
      );

      if (initStatus !== 0) {
        Flac.FLAC__stream_encoder_delete(encoder);
        reject(new Error(`Failed to initialize FLAC encoder: ${initStatus}`));
        return;
      }

      // Convert AudioBuffer channels to interleaved 16-bit PCM, then to Int32 for libflacjs.
      // FLAC C API expects FLAC__int32 (32-bit); passing Int16Array causes the encoder to
      // read 4 bytes per sample and thus only consume half the data, producing ~half duration.
      const pcmData = new Int16Array(length * numberOfChannels);
      for (let i = 0; i < length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
          const int16Sample =
            sample < 0 ? sample * 0x8000 : sample * 0x7fff;
          pcmData[i * numberOfChannels + channel] = int16Sample;
        }
      }
      // libflacjs/C API expects int32 buffer; copy 16-bit samples into Int32Array (right-justified).
      const pcmData32 = new Int32Array(pcmData.length);
      for (let j = 0; j < pcmData.length; j++) {
        pcmData32[j] = pcmData[j];
      }

      // Process audio data (interleaved). Third arg = number of samples per channel.
      const processStatus = Flac.FLAC__stream_encoder_process_interleaved(
        encoder,
        pcmData32,
        length
      );

      if (!processStatus) {
        const state = Flac.FLAC__stream_encoder_get_state(encoder);
        Flac.FLAC__stream_encoder_delete(encoder);
        reject(new Error(`Failed to process audio data. Encoder state: ${state}`));
        return;
      }

      // Finish encoding
      const finishStatus = Flac.FLAC__stream_encoder_finish(encoder);
      Flac.FLAC__stream_encoder_delete(encoder);

      if (!finishStatus) {
        reject(new Error("Failed to finish FLAC encoding"));
        return;
      }

      // Combine all chunks into a single ArrayBuffer
      const totalLength = flacChunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of flacChunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      resolve(result.buffer);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Seeded random number generator for consistent variation
 */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

/**
 * TODO: REMOVE THIS TEMPORARY TESTING FEATURE
 * TEMPORARY TESTING FEATURE: Generate synthetic speech audio from text
 * Uses Web Speech API to generate actual speech and captures it
 * 
 * @param text - Text to convert to speech
 * @param duration - Target duration in milliseconds (default: 14000ms)
 * @param onProgress - Optional callback for progress updates (0-1)
 * @returns Promise that resolves with audio blob in configured format
 */
export async function generateSyntheticSpeechAudio(
  text: string,
  duration: number = 14000,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Check if Web Speech API is available
    if (!('speechSynthesis' in window)) {
      reject(new Error("Web Speech API not supported in this browser"));
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: RECORDING_SAMPLE_RATE,
    });

    // TODO: REMOVE THIS TEMPORARY TESTING FEATURE
    // Since we can't directly capture speechSynthesis output to AudioContext,
    // we generate speech-like audio using filtered noise sources which sounds
    // much more natural than pure tones

    // Create a MediaStreamDestination to capture audio
    const destination = audioContext.createMediaStreamDestination();
    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : undefined,
    });

    const chunks: Blob[] = [];
    let speechStartTime: number | null = null;
    let progressInterval: NodeJS.Timeout | null = null;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      try {
        const audioBlob = new Blob(chunks, { 
          type: mediaRecorder.mimeType || "audio/webm" 
        });
        const { blob } = await convertAudio(audioBlob);
        await audioContext.close();
        resolve(blob);
      } catch (error) {
        await audioContext.close();
        reject(error);
      }
    };

    mediaRecorder.onerror = (event) => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      audioContext.close();
      reject(new Error("MediaRecorder error during synthetic audio generation"));
    };

    // Since we can't directly capture speechSynthesis output to AudioContext,
    // we'll use a workaround: generate speech-like audio using noise sources
    // filtered through formant filters, which sounds much more natural than pure tones
    
    // Parse text for timing
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const avgWordsPerSecond = 2.5;
    const estimatedDuration = Math.min(duration, (wordCount / avgWordsPerSecond) * 1000 + 500);
    
    // Generate random seed for voice variation
    const randomSeed = Math.floor(Math.random() * 1000000);
    const random = seededRandom(randomSeed);
    console.log(`[generateSyntheticSpeechAudio] Generating speech for "${text.substring(0, 50)}..." (${wordCount} words) with seed: ${randomSeed}`);
    
    const sampleRate = audioContext.sampleRate;
    const length = Math.floor((estimatedDuration / 1000) * sampleRate);
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Voice parameters with variation
    const baseFreq = 140 + random() * 40; // 140-180 Hz fundamental
    const formant1Freq = 700 + random() * 200; // First formant: 700-900 Hz
    const formant2Freq = 1200 + random() * 300; // Second formant: 1200-1500 Hz
    const formant3Freq = 2500 + random() * 400; // Third formant: 2500-2900 Hz
    
    // Create word timing structure
    const wordTimings: Array<{ startTime: number; endTime: number; syllables: number }> = [];
    let currentTime = 0;
    const wordDuration = 1000 / avgWordsPerSecond;
    const pauseDuration = 150;
    
    for (const word of words) {
      const syllables = Math.max(1, (word.match(/[aeiouy]+/gi) || []).length);
      const wordTime = wordDuration * (0.8 + syllables * 0.15);
      wordTimings.push({
        startTime: currentTime,
        endTime: currentTime + wordTime,
        syllables
      });
      currentTime += wordTime + pauseDuration;
    }

    // Generate speech-like audio using filtered noise (sounds much more natural than pure tones)
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const timeMs = (i / sampleRate) * 1000;

      // Find current word
      const currentWord = wordTimings.find(w => timeMs >= w.startTime && timeMs < w.endTime);
      const isPause = !currentWord;
      
      if (isPause) {
        // Low noise during pauses
        data[i] = (random() - 0.5) * 0.01;
        continue;
      }
      
      const wordProgress = (timeMs - currentWord.startTime) / (currentWord.endTime - currentWord.startTime);
      
      // Use filtered noise as base (much more speech-like than pure tones)
      // Generate pink noise (more natural than white noise)
      let noise = (random() - 0.5) * 0.3;
      
      // Apply formant filtering using resonant filters (simulated)
      // Formant 1 (low frequency resonance)
      const formant1Gain = 0.4 * Math.exp(-Math.pow((t * 1000 - formant1Freq) / 200, 2));
      // Formant 2 (mid frequency resonance)
      const formant2Gain = 0.3 * Math.exp(-Math.pow((t * 1000 - formant2Freq) / 300, 2));
      // Formant 3 (high frequency resonance)
      const formant3Gain = 0.2 * Math.exp(-Math.pow((t * 1000 - formant3Freq) / 400, 2));
      
      // Add fundamental frequency modulation (voiced sounds)
      const voicing = 0.6 + 0.4 * Math.sin(2 * Math.PI * baseFreq * t);
      
      // Syllable pattern
      const syllablePattern = Math.sin(wordProgress * Math.PI * currentWord.syllables * 2);
      const amplitude = 0.3 + 0.2 * Math.max(0, syllablePattern);
      
      // Combine: filtered noise with voicing and formants
      let sample = noise * (formant1Gain + formant2Gain + formant3Gain) * voicing * amplitude;
      
      // Add slight pitch variation for prosody
      const pitchVariation = 1.0 + 0.15 * Math.sin(wordProgress * Math.PI * 2);
      sample *= pitchVariation;
      
      // Add subtle harmonics for richness
      sample += 0.1 * Math.sin(2 * Math.PI * baseFreq * t) * amplitude;
      sample += 0.05 * Math.sin(2 * Math.PI * baseFreq * 2 * t) * amplitude;
      
      data[i] = Math.max(-1, Math.min(1, sample)); // Clamp to valid range
    }

    // Create buffer source
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    
    // Connect for playback
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.7;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Connect for recording
    source.connect(destination);
    
    // Start recording
    mediaRecorder.start();
    speechStartTime = audioContext.currentTime;
    
    // Track progress
    progressInterval = setInterval(() => {
      if (onProgress && speechStartTime !== null) {
        const elapsed = (audioContext.currentTime - speechStartTime) * 1000;
        const progress = Math.min(elapsed / estimatedDuration, 1);
        onProgress(progress);
      }
    }, 50);
    
    // Play the audio
    source.start(0);
    
    // Stop after duration
    setTimeout(() => {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      source.stop();
      if (mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      if (onProgress) {
        onProgress(1);
      }
    }, estimatedDuration);
  });
}
