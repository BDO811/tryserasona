const { Firestore } = require("@google-cloud/firestore");

const firestore = new Firestore();

// The two focuses the live build offers are "wellness" and "sports". "sports"
// was missing, so every Sports submission was rejected with a 400 before the
// lead was stored or the email sent. The retired ids stay accepted so a client
// that has not picked up a new bundle yet still records.
const ALLOWED_HEALTH_FOCUS = [
  "wellness",
  "sports",
  "cognitive",
  "longevity",
  "mood",
  "reproductive",
];
const ALLOWED_BIOLOGICAL_SEX = ["male", "female"];
const ALLOWED_AGE_RANGE = ["under30", "30-45", "46-60", "60+"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{10,}$/;
const MAX_STRING_LENGTH = 500;

function sanitizeString(value, maxLen = MAX_STRING_LENGTH) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > 0 && s.length <= maxLen ? s : null;
}

function sanitizeEmail(value) {
  const s = sanitizeString(value, 254);
  return s && EMAIL_REGEX.test(s) ? s : null;
}

function sanitizePhone(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  const s = value.trim();
  return s.length <= 20 && PHONE_REGEX.test(s) ? s : null;
}

function oneOf(value, allowed) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const found = allowed.find((a) => a.toLowerCase() === v);
  return found ?? null;
}

function getCorsOrigin(requestOrigin) {
  const fallback = "https://energy-bloom-scan.lovable.app";
  if (!requestOrigin) return fallback;
  if (requestOrigin.endsWith(".lovable.app") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin.endsWith(".amplifierhealth.com") && requestOrigin.startsWith("https://")) return requestOrigin;
  if (requestOrigin === "https://tryswara.com" || requestOrigin === "https://www.tryswara.com") return requestOrigin;
  if (requestOrigin === "https://tryserasona.com" || requestOrigin === "https://www.tryserasona.com") return requestOrigin;
  if (requestOrigin === "https://bdo811.github.io") return requestOrigin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return requestOrigin;
  return fallback;
}

function setCorsHeaders(req, res) {
  res.set("Access-Control-Allow-Origin", getCorsOrigin(req.headers.origin));
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

function base64url(input) {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function writeLeadToFirestore(lead) {
  const ref = await firestore.collection("wellness_demo_leads").add({
    ...lead,
    createdAt: new Date(),
    emailSent: false,
    emailAttempts: 0,
  });
  return ref;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The Gmail send is a single OAuth refresh-token call with no fallback, so a
// cold start, a transient token-refresh hiccup, or a momentary Gmail API error
// used to be a silent, permanent loss of that one notification. Retrying
// in-request covers the transient case; persisting the outcome to Firestore
// (below) covers the case where all three attempts still fail, so the lead is
// never just a line in Cloud Run logs nobody reads.
async function sendLeadEmailWithRetry(lead, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await sendLeadEmail(lead);
      return { sent: true, attempts: attempt, error: null };
    } catch (error) {
      lastError = error;
      console.error(`[notify-lead] Email attempt ${attempt}/${maxAttempts} failed:`, error);
      if (attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1)); // 500ms, 1000ms
      }
    }
  }
  return { sent: false, attempts: maxAttempts, error: lastError ? String(lastError.message || lastError) : "unknown" };
}

async function getGmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail credentials not configured");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh Gmail token: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.access_token;
}

async function sendLeadEmail(lead) {
  const accessToken = await getGmailAccessToken();
  const subject = `New Sona-2 demo submission: ${lead.fullName}`;
  const body = [
    "New wellness demo submission.",
    "",
    `Name: ${lead.fullName}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `Biological sex: ${lead.biologicalSex ?? "not specified"}`,
    `Age range: ${lead.ageRange ?? "not specified"}`,
    `Language: ${lead.language}`,
    `Consent given: ${lead.consentGiven ? "yes" : "no"}`,
  ].join("\n");
  const message = [`To: amit@amplifierhealth.com`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join(
    "\r\n"
  );

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(message) }),
  });
  if (!response.ok) {
    throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
  }
}

exports.notifyLead = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const body = req.body;
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Invalid request." });
      return;
    }

    const fullName = sanitizeString(body.fullName);
    if (!fullName) return res.status(400).json({ error: "Invalid request." });

    const email = sanitizeEmail(body.email);
    if (!email) return res.status(400).json({ error: "Invalid email address." });

    const phone = sanitizePhone(body.phone);
    if (!phone) return res.status(400).json({ error: "Invalid phone number." });

    const healthFocus = oneOf(body.healthFocus, ALLOWED_HEALTH_FOCUS);
    if (!healthFocus) return res.status(400).json({ error: "Invalid request." });

    if (body.consentGiven !== true) {
      return res.status(400).json({ error: "Invalid request." });
    }

    const biologicalSex = body.biologicalSex != null ? oneOf(body.biologicalSex, ALLOWED_BIOLOGICAL_SEX) : null;
    const ageRange = body.ageRange != null ? oneOf(body.ageRange, ALLOWED_AGE_RANGE) : null;
    const language = sanitizeString(body.language, 10) || "en";

    const lead = {
      fullName,
      email,
      phone,
      healthFocus,
      biologicalSex: biologicalSex ?? null,
      ageRange: ageRange ?? null,
      language,
      consentGiven: true,
    };

    const [firestoreResult, emailResult] = await Promise.allSettled([
      writeLeadToFirestore(lead),
      sendLeadEmailWithRetry(lead),
    ]);

    if (firestoreResult.status === "rejected") {
      console.error("[notify-lead] Firestore write failed:", firestoreResult.reason);
    }
    if (emailResult.status === "fulfilled" && !emailResult.value.sent) {
      console.error("[notify-lead] Email send exhausted all retries:", emailResult.value.error);
    } else if (emailResult.status === "rejected") {
      console.error("[notify-lead] Email send threw unexpectedly:", emailResult.reason);
    }

    // Persist the real outcome onto the lead doc so a sweep job (or Amit,
    // querying Firestore directly) can find anything the retries above still
    // didn't manage to send, instead of it only existing in Cloud Run logs.
    if (firestoreResult.status === "fulfilled") {
      const emailOutcome =
        emailResult.status === "fulfilled"
          ? emailResult.value
          : { sent: false, attempts: 0, error: String(emailResult.reason) };
      firestoreResult.value
        .update({
          emailSent: emailOutcome.sent,
          emailAttempts: emailOutcome.attempts,
          emailError: emailOutcome.error,
        })
        .catch((err) => console.error("[notify-lead] Failed to persist email status:", err));
    }

    res.status(200).json({
      success: true,
      firestoreSaved: firestoreResult.status === "fulfilled",
      emailSent: emailResult.status === "fulfilled" && emailResult.value.sent,
    });
  } catch (error) {
    console.error("[notify-lead] Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};
