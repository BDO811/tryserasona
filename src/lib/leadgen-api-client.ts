/**
 * API Client for LeadGen API
 * Routes audio analysis through a Google Cloud Function proxy (analyzeAudio) for
 * security — the real Amplifier Health API v2 credentials (X-Account-ID / X-API-Key)
 * are held server-side in that function's environment, never shipped to the browser.
 * (Or directly to a local L5 backend when VITE_LOCAL_MODE=true, for local dev.)
 */

const isLocalMode = (): boolean =>
  import.meta.env.VITE_LOCAL_MODE === "true" || import.meta.env.VITE_LOCAL_MODE === true;

// Local L5 backend (used when VITE_LOCAL_MODE=true). Same contract as analyze-audio edge function upstream.
const getLocalL5AnalyzeUrl = (): string => {
  const baseUrl = (import.meta.env.VITE_CLIENT_L5_API_URL as string | undefined)?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error(
      "Missing local backend configuration: VITE_CLIENT_L5_API_URL (required when VITE_LOCAL_MODE=true)"
    );
  }
  return `${baseUrl}/api/v1/wellness/analyze-audio-sync`;
};

const getLocalL5Auth = (): { clientId: string; apiKey: string } => {
  const clientId = import.meta.env.VITE_CLIENT_L5_CLIENT_ID as string | undefined;
  const apiKey = import.meta.env.VITE_CLIENT_L5_API_KEY as string | undefined;
  if (!clientId || !apiKey) {
    throw new Error(
      "Missing local backend credentials: VITE_CLIENT_L5_CLIENT_ID and VITE_CLIENT_L5_API_KEY (required when VITE_LOCAL_MODE=true)"
    );
  }
  return { clientId, apiKey };
};

// Google Cloud Function proxy for audio analysis (Amplifier v2 credentials handled
// server-side in that function's environment — see gcp-functions/analyze-audio).
const DEFAULT_ANALYZE_AUDIO_URL = "https://us-central1-amits-playground-po.cloudfunctions.net/analyzeAudio";
const getGcpFunctionUrl = (): string =>
  (import.meta.env.VITE_ANALYZE_AUDIO_URL as string | undefined) || DEFAULT_ANALYZE_AUDIO_URL;

// Request/Response Types

/**
 * Request for analyze-audio-sync endpoints.
 * Format is determined by VITE_AUDIO_FORMAT env var (wave/wav, flac, or mp3).
 * API accepts: WAV (.wav, audio/wav), MP3 (.mp3, audio/mpeg), or FLAC (.flac, audio/flac).
 */
export interface AnalyzeAudioSyncRequest {
  audioFile: Blob;
  format?: 'wav' | 'flac' | 'mp3';
  extension?: string;
  mimeType?: string;
  /**
   * Amplifier v2 model to run (pulse / clarity / haven / tide / aria …).
   * Selected from the user's health focus — see lib/pathway-model-map.ts.
   * Omitted means the Cloud Function falls back to its own default.
   */
  model?: string;
}

export interface JobInfo {
  job_id: string;
  status: string;
  created_at?: string | null;
}

export interface JobListResponse {
  jobs: JobInfo[];
  page: number;
  total_pages?: number | null;
}

export interface JobDetailResponse {
  job_id: string;
  status: string;
  created_at?: string | null;
  result?: Record<string, any> | null;
}

// Sync analyze endpoints return full job detail (including result),
// so we alias the response type to JobDetailResponse for convenience.
export type AnalyzeAudioSyncResponse = JobDetailResponse;

export interface CreditsResponse {
  credits: number;
}

export interface SetWebhookRequest {
  url: string;
  secret_key: string;
}

export interface SetWebhookResponse {
  success: boolean;
  message: string;
}

/**
 * Internal helper to call the edge function or local L5 backend for wellness audio analysis
 */
async function analyzeWellnessAudio(
  request: AnalyzeAudioSyncRequest
): Promise<AnalyzeAudioSyncResponse> {
  const startTime = Date.now();
  const startTimestamp = new Date().toISOString();
  const format = request.format || 'flac';
  const extension = request.extension || (format === 'wav' ? '.wav' : format === 'mp3' ? '.mp3' : '.flac');
  const filename = `audio${extension}`;
  const backendLabel = isLocalMode() ? "local L5" : "Cloud Function proxy";

  console.log(`[LeadGen API] analyze audio sync (model: ${request.model || 'default'}, format: ${format}, ${backendLabel}) at ${startTimestamp}`);

  const formData = new FormData();
  formData.append('audio', request.audioFile, filename);

  const headers = new Headers();
  let url: string;

  if (isLocalMode()) {
    url = getLocalL5AnalyzeUrl();
    const { clientId, apiKey } = getLocalL5Auth();
    headers.set('x-client-id', clientId);
    headers.set('x-apikey', apiKey);
  } else {
    url = getGcpFunctionUrl();
    // The proxy reads the model from ?model= (and from a `model` form field);
    // it validates against its own allowlist and falls back to pulse.
    if (request.model) {
      url += `${url.includes('?') ? '&' : '?'}model=${encodeURIComponent(request.model)}`;
      formData.append('model', request.model);
    }
  }

  try {
    // Do NOT set Content-Type – browser auto-adds multipart/form-data with boundary when body is FormData.
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });
    
    const endTimestamp = new Date().toISOString();
    const duration = Date.now() - startTime;
    
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Unable to read error response';
      }
      
      const errorMessage = `API request failed: ${response.status} ${response.statusText}${errorText ? `. ${errorText}` : ''}`;
      console.error(`[LeadGen API] wellness analyze failed at ${endTimestamp} (duration: ${duration}ms):`, errorMessage);
      throw new Error(errorMessage);
    }

    const result = await response.json();
    console.log(`[LeadGen API] wellness analyze completed at ${endTimestamp} (duration: ${duration}ms)`, result);
    return result;
  } catch (error) {
    console.error(`[LeadGen API] wellness analyze failed (duration: ${Date.now() - startTime}ms):`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Health check to verify API availability.
 * In local mode checks the L5 backend; otherwise checks the edge function.
 *
 * @returns Promise that resolves to true if the backend is reachable, false otherwise
 */
export async function leadgenRootHealthCheck(): Promise<boolean> {
  try {
    const url = isLocalMode()
      ? getLocalL5AnalyzeUrl()
      : getGcpFunctionUrl();
    const response = await fetch(url, { method: "OPTIONS" });
    // In local mode, 405 means server reached but OPTIONS not allowed (common for L5); treat as reachable
    return response.ok || (isLocalMode() && response.status === 405);
  } catch (error) {
    return false;
  }
}

/**
 * Wellness analysis - Analyze audio file using the wellness endpoint via edge function or local L5.
 * Format determined by request (from VITE_AUDIO_FORMAT env var).
 *
 * @param request - Audio file with format metadata
 * @returns Promise with full job detail including result
 */
export async function leadgenWellnessAnalyzeAudioSync(
  request: AnalyzeAudioSyncRequest
): Promise<AnalyzeAudioSyncResponse> {
  return analyzeWellnessAudio(request);
}

// Note: The following functions (leadgenCheckCredits, leadgenGetJobList, 
// leadgenGetJobDetail, leadgenSetWebhook) have been removed as they require 
// direct API access with credentials. If needed, they should be added as 
// separate edge functions.
