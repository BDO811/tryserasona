const admin = require("firebase-admin");
const Stripe = require("stripe");

if (!admin.apps.length) admin.initializeApp();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

function getCorsOrigin(requestOrigin) {
  const fallback = "https://tryserasona.com";
  if (!requestOrigin) return fallback;
  if (requestOrigin === "https://tryserasona.com" || requestOrigin === "https://www.tryserasona.com") return requestOrigin;
  if (requestOrigin === "https://bdo811.github.io") return requestOrigin;
  if (/^https?:\/\/localhost(:\d+)?$/.test(requestOrigin)) return requestOrigin;
  return fallback;
}

function setCorsHeaders(req, res) {
  res.set("Access-Control-Allow-Origin", getCorsOrigin(req.headers.origin));
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

exports.createPortalSession = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: "Not signed in." });
    const decoded = await admin.auth().verifyIdToken(idToken);

    const userSnap = await admin.firestore().collection("users").doc(decoded.uid).get();
    const customerId = userSnap.data()?.subscription?.stripeCustomerId;
    if (!customerId) return res.status(400).json({ error: "No billing account yet." });

    const returnUrl = typeof req.body?.returnUrl === "string" ? req.body.returnUrl : "https://tryserasona.com/account";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("[create-portal-session] Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};
