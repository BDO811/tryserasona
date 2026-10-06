const crypto = require("crypto");
const { Firestore, FieldValue } = require("@google-cloud/firestore");

/**
 * Per-user voice session history.
 *
 * POST  { email, model, pathway, capturedAt, signals[], summary }  -> saves one session
 * GET   ?email=...                                                 -> that user's sessions
 *
 * Runs as a function rather than letting the browser talk to Firestore directly
 * so the collection needs no public read/write rule and no API key ships in the
 * client bundle.
 *
 * Users are identified by a SHA-256 of their normalized email. The plaintext
 * address is deliberately NOT stored: lookup only ever needs the hash, and this
 * keeps a database of health readings from doubling as a mailing list. Lead
 * contact details are captured separately by the notifyLead function.
 *
 * There is no authentication in front of this. Anyone who knows an email can
 * read that email's history, which is acceptable for a demo and is not
 * acceptable for production. Putting real users behind this needs a sign-in
 * step first.
 */

const COLLECTION = "voiceSessions";
const MAX_SESSIONS_RETURNED = 200;
const MAX_SIGNALS_PER_SESSION = 64;
const MAX_BODY_BYTES = 64 * 1024;

const firestore = new Firestore();

function getCorsOrigin(requestOrigin) {
  const fallback = "https://try.amplifierhealth.com";
  if (!requestOrigin) return fallback;
  if (requestOrigin.endsWith(".amplifierhealth.com") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin.endsWith(".lovable.app") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin === "https://tryswara.com" || requestOrigin === "https://www.tryswara.com") return requestOrigin;
  if (requestOrigin === "https://tryserasona.com" || requestOrigin === "https://www.tryserasona.com") return requestOrigin;
  if (requestOrigin === "https://bdo811.github.io") return requestOrigin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return requestOrigin;
  return fallback;
}

function setCorsHeaders(req, res) {
  res.set("Access-Control-Allow-Origin", getCorsOrigin(req.headers.origin));
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

/** Lowercase and trim, so "Amit@X.com " and "amit@x.com" are the same user. */
function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  // Deliberately permissive: this gates obvious junk, it is not validation.
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}

function userKeyFor(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

/** Clamp a model score into 0-1, rejecting anything non-numeric. */
function cleanScore(value) {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.min(Math.max(score, 0), 1);
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/**
 * Keep only the fields the longitudinal view actually reads. Whatever else the
 * client sends is dropped rather than persisted, so the shape of the stored
 * document does not drift with the shape of the API response.
 */
function cleanSignals(raw) {
  if (!Array.isArray(raw)) return [];
  const signals = [];
  for (const entry of raw.slice(0, MAX_SIGNALS_PER_SESSION)) {
    if (!entry || typeof entry !== "object") continue;
    const name = cleanString(entry.name, 64);
    const score = cleanScore(entry.score);
    if (!name || score === null) continue;
    signals.push({
      name,
      label: cleanString(entry.label, 120) || name,
      score,
      level: cleanString(entry.level, 32),
      flagged: entry.flagged === true,
    });
  }
  return signals;
}

function cleanSummary(raw) {
  if (!raw || typeof raw !== "object") return null;
  const flaggedCount = Number(raw.flaggedCount);
  const totalSignals = Number(raw.totalSignals);
  return {
    overallLevel: cleanString(raw.overallLevel, 32),
    recommendedAction: cleanString(raw.recommendedAction, 32),
    flaggedCount: Number.isFinite(flaggedCount) ? flaggedCount : null,
    totalSignals: Number.isFinite(totalSignals) ? totalSignals : null,
  };
}

/**
 * Trust the server clock for ordering. A client-supplied capturedAt is accepted
 * only when it is sane, because the burst-collapsing and trend maths downstream
 * are driven entirely by these timestamps.
 */
function resolveCapturedAt(value) {
  const now = Date.now();
  const capturedAt = Number(value);
  if (!Number.isFinite(capturedAt)) return now;
  const oneDayAhead = now + 24 * 60 * 60 * 1000;
  const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60 * 1000;
  if (capturedAt > oneDayAhead || capturedAt < tenYearsAgo) return now;
  return capturedAt;
}

async function handleSave(req, res) {
  const body = req.body;
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    res.status(413).json({ error: "Request too large." });
    return;
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    res.status(400).json({ error: "A valid email is required." });
    return;
  }

  const signals = cleanSignals(body.signals);
  if (signals.length === 0) {
    res.status(400).json({ error: "At least one signal is required." });
    return;
  }

  const session = {
    userKey: userKeyFor(email),
    model: cleanString(body.model, 32),
    pathway: cleanString(body.pathway, 32),
    capturedAt: resolveCapturedAt(body.capturedAt),
    signals,
    summary: cleanSummary(body.summary),
    createdAt: FieldValue.serverTimestamp(),
  };

  const written = await firestore.collection(COLLECTION).add(session);
  console.log(`[voice-history] Saved session ${written.id} (${signals.length} signals)`);

  res.status(200).json({ sessionId: written.id, capturedAt: session.capturedAt });
}

async function handleFetch(req, res) {
  const email = normalizeEmail(req.query && req.query.email);
  if (!email) {
    res.status(400).json({ error: "A valid email is required." });
    return;
  }

  // Equality filter only, then sort in memory. Adding orderBy(capturedAt) here
  // would need a composite index provisioned before the endpoint works at all.
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("userKey", "==", userKeyFor(email))
    .limit(MAX_SESSIONS_RETURNED)
    .get();

  const sessions = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        sessionId: doc.id,
        capturedAt: data.capturedAt,
        model: data.model,
        pathway: data.pathway,
        signals: Array.isArray(data.signals) ? data.signals : [],
        summary: data.summary || null,
      };
    })
    .sort((a, b) => a.capturedAt - b.capturedAt);

  console.log(`[voice-history] Returned ${sessions.length} sessions`);
  res.status(200).json({ sessions });
}

exports.voiceHistory = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    if (req.method === "POST") {
      await handleSave(req, res);
      return;
    }
    if (req.method === "GET") {
      await handleFetch(req, res);
      return;
    }
    res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    console.error("[voice-history] Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};
