const Busboy = require("busboy");

// Amplifier Health API v2 — see docs.amplifierhealth.com/api-reference/overview
// Auth: X-Account-ID + X-API-Key. Flow: POST /v2/models/{model_name}/analyze -> job
// object (status: "queued"), then poll GET /v2/jobs/{job_id} until a terminal status.
// The model is chosen by the health focus the user picks in triage and sent as
// ?model= (or a `model` form field). Anything outside this allowlist falls back
// to pulse, so a bad client value can never be reflected into the upstream URL.
const DEFAULT_MODEL_NAME = "pulse";
const ALLOWED_MODEL_NAMES = new Set([
  "pulse",
  "clarity",
  "haven",
  "tide",
  "aria",
  "breath",
  "harbor",
  "apex",
]);

function resolveModelName(value) {
  if (typeof value !== "string") return DEFAULT_MODEL_NAME;
  const name = value.trim().toLowerCase();
  return ALLOWED_MODEL_NAMES.has(name) ? name : DEFAULT_MODEL_NAME;
}
const MAX_AUDIO_FILE_BYTES = 32 * 1024 * 1024; // 32 MB, matches the API's own limit
const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/x-m4a",
];
const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 240_000; // stay comfortably under the function's own timeout
const TERMINAL_STATUSES = new Set(["done", "failed", "timed-out"]);

function getCorsOrigin(requestOrigin) {
  const fallback = "https://energy-bloom-scan.lovable.app";
  if (!requestOrigin) return fallback;
  if (requestOrigin.endsWith(".lovable.app") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin.endsWith(".amplifierhealth.com") && requestOrigin.startsWith("https://")) return requestOrigin;
  // Swara (tryswara.com) is a separate consumer brand built on this same API.
  if (requestOrigin === "https://tryswara.com" || requestOrigin === "https://www.tryswara.com") return requestOrigin;
  // GitHub Pages host the app is served from while try.amplifierhealth.com DNS
  // is pending. Exact origin, not a wildcard — *.github.io is every GitHub user.
  if (requestOrigin === "https://bdo811.github.io") return requestOrigin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return requestOrigin;
  return fallback;
}

function setCorsHeaders(req, res) {
  res.set("Access-Control-Allow-Origin", getCorsOrigin(req.headers.origin));
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

function parseMultipartAudio(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_AUDIO_FILE_BYTES } });
    let fileFound = false;
    let fileTooBig = false;
    let filename = "audio";
    let mimeType = "";
    let model = "";
    const chunks = [];

    busboy.on("field", (name, value) => {
      if (name === "model") model = value;
    });

    busboy.on("file", (_name, file, info) => {
      fileFound = true;
      filename = info.filename || "audio";
      mimeType = info.mimeType || "";
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("limit", () => {
        fileTooBig = true;
      });
    });

    busboy.on("finish", () => {
      if (!fileFound) return reject(new Error("NO_FILE"));
      if (fileTooBig) return reject(new Error("TOO_LARGE"));
      resolve({ buffer: Buffer.concat(chunks), filename, mimeType, model });
    });
    busboy.on("error", (err) => reject(err));

    if (req.rawBody) {
      busboy.end(req.rawBody);
    } else {
      req.pipe(busboy);
    }
  });
}

async function pollJobUntilDone(apiUrl, jobId, headers) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${apiUrl}/v2/jobs/${jobId}`, { headers });
    const data = await res.json();
    if (!res.ok) return { status: res.status, data };
    const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
    if (TERMINAL_STATUSES.has(status)) return { status: res.status, data };
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return { status: 504, data: { job_id: jobId, status: "timeout" } };
}

exports.analyzeAudio = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const API_URL = process.env.AMPLIFIER_API_URL;
  const ACCOUNT_ID = process.env.AMPLIFIER_ACCOUNT_ID;
  const API_KEY = process.env.AMPLIFIER_API_KEY;

  if (!API_URL || !ACCOUNT_ID || !API_KEY) {
    console.error("[analyze-audio] Missing required environment variables");
    res.status(500).json({ error: "Something went wrong." });
    return;
  }

  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  let audio;
  try {
    audio = await parseMultipartAudio(req);
  } catch (err) {
    if (err.message === "TOO_LARGE") {
      res.status(413).json({ error: "Request too large." });
      return;
    }
    console.warn("[analyze-audio] Invalid multipart body:", err.message);
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  if (!audio.buffer || audio.buffer.length === 0) {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const mime = (audio.mimeType || "").toLowerCase().split(";")[0].trim();
  const allowed = ALLOWED_AUDIO_MIME_TYPES.some((a) => mime === a);
  if (!allowed) {
    console.warn("[analyze-audio] Invalid audio MIME type:", mime);
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  const authHeaders = {
    "X-Account-ID": ACCOUNT_ID,
    "X-API-Key": API_KEY,
  };

  try {
    const upstreamForm = new FormData();
    upstreamForm.append("audio", new Blob([audio.buffer], { type: mime }), audio.filename);

    // Query string wins; the form field is the fallback for clients that cannot
    // set one. Both go through the allowlist.
    const modelName = resolveModelName(
      (req.query && req.query.model) || audio.model || DEFAULT_MODEL_NAME
    );
    console.log(`[analyze-audio] Using model: ${modelName}`);

    const submitStart = Date.now();
    const submitResponse = await fetch(`${API_URL}/v2/models/${modelName}/analyze`, {
      method: "POST",
      headers: authHeaders,
      body: upstreamForm,
    });
    const submitData = await submitResponse.json();
    console.log(`[analyze-audio] Submit responded in ${Date.now() - submitStart}ms with status ${submitResponse.status}`);

    if (!submitResponse.ok) {
      console.error("[analyze-audio] Amplifier API submit error:", submitResponse.status, submitData);
      res.status(502).json({ error: "Something went wrong." });
      return;
    }

    const jobId = submitData && submitData.job_id;
    if (typeof jobId !== "string" || !jobId) {
      console.error("[analyze-audio] Submit response missing job_id:", submitData);
      res.status(502).json({ error: "Something went wrong." });
      return;
    }

    const pollStart = Date.now();
    const { status: pollStatus, data: jobDetail } = await pollJobUntilDone(API_URL, jobId, authHeaders);
    console.log(`[analyze-audio] Job ${jobId} settled in ${Date.now() - pollStart}ms with status ${pollStatus}`);

    if (pollStatus !== 200) {
      console.error("[analyze-audio] Job polling error:", pollStatus, jobDetail);
      res.status(pollStatus === 504 ? 504 : 502).json({ error: "Something went wrong." });
      return;
    }

    res.status(200).json(jobDetail);
  } catch (error) {
    console.error("[analyze-audio] Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};
