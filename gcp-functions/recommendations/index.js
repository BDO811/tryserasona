/**
 * Recommendations endpoint.
 *
 * Takes the bands a result landed on and returns written suggestions for the
 * ones that are not normal. The model call lives here rather than in the client
 * because the API key cannot ship in a static bundle.
 *
 * The key is mounted from Secret Manager as GEMINI_API_KEY. Nothing about the
 * caller is stored: the request carries sign names and bands, never audio, never
 * an email, and nothing is written to Firestore.
 */

const https = require("node:https");
const dns = require("node:dns");

/*
  Outbound HTTPS over an explicit IPv4 keep-alive agent.

  Node's global fetch stalled on this path. Identical requests took 7 to 9
  seconds from a laptop and 40 to 48 through this function, and one exceeded the
  request timeout and returned 504. The gap is a connect that hangs before the
  model is ever reached: Cloud Run has no IPv6 egress, and the resolver was
  handing back an AAAA record first.

  dns.setDefaultResultOrder("ipv4first") was tried and did not fix it, because
  it does not reach the connector fetch uses. Pinning family 4 on the request
  itself does. The agent also keeps the socket alive, which matters because the
  stall recurred on every new connection: a warm instance idle for twenty
  seconds still paid 42 seconds on its next call.
*/
dns.setDefaultResultOrder("ipv4first");

const agent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 8,
  family: 4,
});

/** POST JSON over the IPv4 agent. Mirrors the bits of fetch that were in use. */
function postJson(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "POST", headers, agent, family: 4, timeout: 90_000 },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => data,
            json: async () => JSON.parse(data),
          })
        );
      }
    );
    req.on("timeout", () => req.destroy(new Error("upstream timeout")));
    req.on("error", reject);
    req.end(payload);
  });
}

const ALLOWED_ORIGINS = [
  "https://try.amplifierhealth.com",
  "https://tryswara.com",
  "https://www.tryswara.com",
  "http://localhost:8080",
  "http://localhost:5173",
];

/*
  Private-network origins, so the local sandbox can be opened on a phone.

  Vite binds every interface, so testing on a handset means loading
  http://192.168.x.x:8080 and the browser sends that as the Origin. Without this
  the call fails CORS on exactly the device the mobile layout needs testing on.

  Restricted to RFC1918 and loopback ranges. This widens nothing that matters:
  the endpoint is already unauthenticated, so CORS was never the security
  boundary here, and a public origin still gets no header.
*/
const PRIVATE_ORIGIN = /^http:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function originAllowed(origin) {
  return ALLOWED_ORIGINS.includes(origin) || PRIVATE_ORIGIN.test(origin || "");
}

/** Bands worth writing about. NORMAL and INCONCLUSIVE are not actionable. */
const ACTIONABLE_BANDS = new Set(["LOW", "MODERATE", "ELEVATED"]);

/*
  Gemini via the Generative Language API, which has a free tier. Vertex AI would
  authenticate off the function's own service account and need no key at all,
  but it bills per call, so this uses the free endpoint instead.
*/
const MODEL = process.env.RECOMMENDATIONS_MODEL || "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

/*
  Settled against the live API on 2026-09-09 rather than from the docs, because
  three things were not what the obvious configuration would have been:

  - The model list advertises gemini-2.5-flash, which then 404s as retired.
    gemini-2.0-flash is retired too. Only the 3.x line answers.
  - thinkingConfig.thinkingBudget = 0 is rejected outright by this model.
    thinkingLevel "low" is the accepted way to hold reasoning down.
  - Thinking tokens count against maxOutputTokens. At 1200 the whole budget went
    to reasoning and the reply truncated mid-sentence with MAX_TOKENS after 186
    characters. A real reply spends about 1060 thinking tokens and 205 on the
    text, so the ceiling has to sit well above the visible answer.
*/
const MAX_OUTPUT_TOKENS = 4096;
const THINKING_LEVEL = "low";

/*
  The endpoint returns 503 UNAVAILABLE "experiencing high demand" sporadically,
  seen repeatedly while testing, so that is worth a retry.

  429 is deliberately NOT retried. The free tier allows 20 requests per minute,
  and a 429 means that window is already spent, so an immediate retry cannot
  succeed and simply consumes two more units of the quota that is already
  exhausted. Retrying it turned every rate-limited call into three, which is how
  a short burst of testing locked the key out entirely.
*/
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_SIGNS = 12;

function cleanString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/**
 * The prompt. Written to produce practical, specific suggestions tied to the
 * signs that came back, and to avoid restating the reading back at the reader,
 * which is already on the screen above the button.
 */
function buildPrompt(signs, assessment) {
  const lines = signs
    .map((s) => `- ${s.label} (${s.band.toLowerCase()})`)
    .join("\n");

  return [
    `A voice assessment returned these readings on the ${assessment} model:`,
    "",
    lines,
    "",
    "Write suggestions for improving each one. Requirements:",
    // Two sentences, not a paragraph. Measured: the open-ended version returned
    // up to 1,999 characters and the generation time tracked the length, which
    // is what pushed a call past the request timeout.
    "- Exactly two sentences per reading, in the order listed.",
    "- Open each with the reading's name, then the suggestion.",
    "- Be specific and practical: what to change, how much, how often.",
    "- Do not restate the score or the band; the reader can already see it.",
    "- Do not diagnose, and do not tell the reader what condition they have.",
    "- No preamble, no closing summary, no bullet characters, no headings.",
    "- No em dashes or en dashes anywhere in the text.",
  ].join("\n");
}

exports.recommendations = async (req, res) => {
  const origin = req.headers.origin;
  if (originAllowed(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[recommendations] GEMINI_API_KEY is not mounted");
    return res.status(503).json({ error: "not_configured" });
  }

  const body = req.body || {};
  const assessment = cleanString(body.assessment, 40) || "wellness";

  const signs = (Array.isArray(body.signs) ? body.signs : [])
    .map((s) => ({
      label: cleanString(s && s.label, 60),
      band: cleanString(s && s.band, 20).toUpperCase(),
    }))
    .filter((s) => s.label && ACTIONABLE_BANDS.has(s.band))
    .slice(0, MAX_SIGNS);

  if (signs.length === 0) {
    // Nothing outside the normal range, so there is nothing to suggest.
    return res.status(200).json({ text: "", signs: 0 });
  }

  try {
    const payload = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(signs, assessment) }] }],
      generationConfig: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.4,
        thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      },
    });

    const headers = {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
      // Header rather than ?key=, so the key stays out of request URLs and
      // therefore out of any log or error that echoes one.
      "x-goog-api-key": apiKey,
    };

    let upstream;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      upstream = await postJson(ENDPOINT, headers, payload);
      if (upstream.ok || !RETRY_STATUSES.has(upstream.status)) break;
      if (attempt === MAX_ATTEMPTS) break;
      const backoffMs = 400 * attempt;
      console.warn(`[recommendations] ${upstream.status}, retrying in ${backoffMs}ms`);
      await sleep(backoffMs);
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error("[recommendations] upstream error", upstream.status, detail.slice(0, 400));
      return res.status(502).json({ error: "upstream_error", status: upstream.status });
    }

    const result = await upstream.json();
    /*
      Gemini nests the text under candidates[].content.parts[]. A candidate can
      come back with no parts at all when generation stops early, so this reads
      defensively rather than indexing straight in.
    */
    const parts =
      (result.candidates && result.candidates[0] && result.candidates[0].content
        ? result.candidates[0].content.parts
        : null) || [];
    const text = parts
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    if (!text) {
      const reason =
        (result.candidates && result.candidates[0] && result.candidates[0].finishReason) ||
        (result.promptFeedback && result.promptFeedback.blockReason) ||
        "empty_response";
      console.error("[recommendations] no text returned", reason);
      return res.status(502).json({ error: "empty_response", reason });
    }

    console.log(`[recommendations] ${signs.length} signs, ${text.length} chars`);
    return res.status(200).json({ text, signs: signs.length });
  } catch (error) {
    console.error("[recommendations] failed", error);
    return res.status(500).json({ error: "failed" });
  }
};
