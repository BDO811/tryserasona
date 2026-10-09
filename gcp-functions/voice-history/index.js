const crypto = require("crypto");
const { Firestore, FieldValue } = require("@google-cloud/firestore");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();

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
 * Two identity modes, chosen per request:
 *
 *   Signed in  (Authorization: Bearer <Firebase ID token>) -> keyed on
 *     "uid:<firebase uid>". The verified token is the only thing trusted; any
 *     email in the body is ignored for identity purposes. This is the path a
 *     Serasona account (see src/context/AuthContext.tsx) uses.
 *
 *   Anonymous  (no Authorization header) -> keyed on a SHA-256 of the
 *     normalized email, exactly as before. This is the original try-it demo
 *     flow (no account, no entitlement check) and is left completely
 *     unchanged so the public anonymous funnel keeps working. The plaintext
 *     address is deliberately NOT stored in this mode: lookup only ever needs
 *     the hash, which keeps a database of health readings from doubling as a
 *     mailing list.
 *
 * The anonymous mode's own limitation stands as before: anyone who knows an
 * email can read that email's history. That is acceptable for a demo and is
 * why the signed-in mode exists for anything that should actually be private.
 */

const COLLECTION = "voiceSessions";
const MAX_SESSIONS_RETURNED = 200;
const MAX_SIGNALS_PER_SESSION = 64;
const MAX_BODY_BYTES = 64 * 1024;

/**
 * How many check-ins an account with no paid plan may ever store. Pricing sells
 * the free tier as "one 20-second check-in, your seven signals, this time only,
 * no history or trend", so the limit is one for the lifetime of the account,
 * not one per day.
 */
const FREE_CHECKIN_LIMIT = 1;

/** Plans ranked the way a subscriber would upgrade. Mirrors src/context/AuthContext.tsx. */
const PLAN_RANK = { free: 0, core: 1, plus: 2, executive: 3 };
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

const firestore = new Firestore();

/**
 * Whether this account may store an unlimited number of check-ins.
 *
 * Read from the user document, never from the request. The client already
 * checks this to decide what to render, but a UI check is a courtesy: anyone
 * can call this endpoint directly with a valid token and no browser involved.
 * This is the copy that actually costs money if it is wrong, because every
 * stored session is a model call that was already paid for.
 *
 * `subscription` on that document is written only by the stripe-webhook
 * function via the Admin SDK — the Firestore rules forbid the client from
 * touching it — so it is safe to trust here.
 */
async function hasUnlimitedCheckins(uid) {
  const snap = await firestore.collection("users").doc(uid).get();
  const subscription = snap.exists ? snap.data().subscription : null;
  if (!subscription) return false;
  if (!ACTIVE_STATUSES.has(subscription.status)) return false;
  return (PLAN_RANK[subscription.planId] ?? 0) >= PLAN_RANK.core;
}

/** How many sessions this user already has. Capped, since we only compare to a small limit. */
async function countSessions(userKey) {
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("userKey", "==", userKey)
    .limit(FREE_CHECKIN_LIMIT + 1)
    .count()
    .get();
  return snapshot.data().count;
}

function getCorsOrigin(requestOrigin) {
  const fallback = "https://try.amplifierhealth.com";
  if (!requestOrigin) return fallback;
  if (requestOrigin.endsWith(".amplifierhealth.com") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin.endsWith(".lovable.app") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin === "https://tryswara.com" || requestOrigin === "https://www.tryswara.com") return requestOrigin;
  if (requestOrigin === "https://serasona.com" || requestOrigin === "https://www.serasona.com") return requestOrigin;
  // tryserasona.com now redirects here, but a redirected request still
  // preflights with its original origin, so it stays allowed.
  if (requestOrigin === "https://tryserasona.com" || requestOrigin === "https://www.tryserasona.com") return requestOrigin;
  if (requestOrigin === "https://bdo811.github.io") return requestOrigin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return requestOrigin;
  return fallback;
}

function setCorsHeaders(req, res) {
  res.set("Access-Control-Allow-Origin", getCorsOrigin(req.headers.origin));
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
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

function userKeyForEmail(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

/**
 * Figures out whose history this request is touching. A present, valid
 * Authorization header always wins — an authenticated caller cannot be
 * downgraded to the anonymous email path by also sending an email field.
 * Returns null when neither a valid token nor a valid email was supplied.
 */
async function resolveIdentity(req, emailValue) {
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (idToken) {
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      return { userKey: `uid:${decoded.uid}`, mode: "account" };
    } catch (error) {
      console.warn("[voice-history] ID token verification failed:", error.message);
      return null;
    }
  }

  const email = normalizeEmail(emailValue);
  if (!email) return null;
  return { userKey: userKeyForEmail(email), mode: "anonymous" };
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

  const identity = await resolveIdentity(req, body.email);
  if (!identity) {
    res.status(401).json({ error: "Sign in, or provide a valid email." });
    return;
  }

  const signals = cleanSignals(body.signals);
  if (signals.length === 0) {
    res.status(400).json({ error: "At least one signal is required." });
    return;
  }

  // The free tier's one check-in, enforced here rather than only in the UI.
  //
  // Scoped to account mode on purpose. The anonymous email path belongs to the
  // original try-it demo, which has no accounts and no entitlements, and
  // limiting it would break that funnel. Serasona itself always sends a token:
  // since the free check-in started requiring an account, there is no path
  // through the Serasona client that reaches the anonymous branch.
  if (identity.mode === "account") {
    const uid = identity.userKey.slice("uid:".length);
    if (!(await hasUnlimitedCheckins(uid))) {
      const used = await countSessions(identity.userKey);
      if (used >= FREE_CHECKIN_LIMIT) {
        console.log(`[voice-history] Free limit reached for ${identity.userKey} (${used} stored)`);
        // 402 rather than 403: the request is well-formed and the caller is
        // who they say they are. What is missing is a plan.
        res.status(402).json({
          error: "Your free check-in has been used.",
          code: "free_limit_reached",
          limit: FREE_CHECKIN_LIMIT,
        });
        return;
      }
    }
  }

  const session = {
    userKey: identity.userKey,
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
  const identity = await resolveIdentity(req, req.query && req.query.email);
  if (!identity) {
    res.status(401).json({ error: "Sign in, or provide a valid email." });
    return;
  }

  // Equality filter only, then sort in memory. Adding orderBy(capturedAt) here
  // would need a composite index provisioned before the endpoint works at all.
  const snapshot = await firestore
    .collection(COLLECTION)
    .where("userKey", "==", identity.userKey)
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
