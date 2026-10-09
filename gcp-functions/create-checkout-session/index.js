const admin = require("firebase-admin");
const Stripe = require("stripe");

if (!admin.apps.length) admin.initializeApp();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

// Plan id -> Stripe Price id. Prices are created once in the Stripe dashboard
// (see docs/SETUP_BILLING.md) and never hardcoded here.
const PLAN_PRICE_IDS = {
  core: process.env.STRIPE_PRICE_CORE,
  plus: process.env.STRIPE_PRICE_PLUS,
  executive: process.env.STRIPE_PRICE_EXECUTIVE,
};

function getCorsOrigin(requestOrigin) {
  const fallback = "https://serasona.com";
  if (!requestOrigin) return fallback;
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
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function getOrCreateStripeCustomer(uid, email) {
  const userRef = admin.firestore().collection("users").doc(uid);
  const snap = await userRef.get();
  const existingId = snap.data()?.subscription?.stripeCustomerId;
  if (existingId) return existingId;

  const customer = await stripe.customers.create({ email, metadata: { firebaseUID: uid } });
  await userRef.set(
    { subscription: { stripeCustomerId: customer.id } },
    { merge: true }
  );
  return customer.id;
}

exports.createCheckoutSession = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  try {
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: "Not signed in." });
    const decoded = await admin.auth().verifyIdToken(idToken);

    const planId = typeof req.body?.planId === "string" ? req.body.planId : null;
    const priceId = planId ? PLAN_PRICE_IDS[planId] : null;
    if (!priceId) return res.status(400).json({ error: "Unknown plan." });

    const successUrl = typeof req.body?.successUrl === "string" ? req.body.successUrl : "https://serasona.com/account";
    const cancelUrl = typeof req.body?.cancelUrl === "string" ? req.body.cancelUrl : "https://serasona.com/pricing";

    const customerId = await getOrCreateStripeCustomer(decoded.uid, decoded.email);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: decoded.uid,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { firebaseUID: decoded.uid, planId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("[create-checkout-session] Error:", error);
    res.status(500).json({ error: "Something went wrong." });
  }
};
