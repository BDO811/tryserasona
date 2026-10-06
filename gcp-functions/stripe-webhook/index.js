const admin = require("firebase-admin");
const Stripe = require("stripe");

if (!admin.apps.length) admin.initializeApp();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

// Reverse of create-checkout-session's PLAN_PRICE_IDS, so a Stripe subscription
// object (which only knows its price id) can be written back as a plan id.
const PRICE_ID_TO_PLAN = {
  [process.env.STRIPE_PRICE_CORE]: "core",
  [process.env.STRIPE_PRICE_PLUS]: "plus",
  [process.env.STRIPE_PRICE_EXECUTIVE]: "executive",
};

async function resolveFirebaseUID(subscription) {
  if (subscription.metadata?.firebaseUID) return subscription.metadata.firebaseUID;
  // Fall back to the Stripe customer's metadata, set when the customer was
  // first created in create-checkout-session.
  const customer = await stripe.customers.retrieve(subscription.customer);
  return customer?.metadata?.firebaseUID || null;
}

async function syncSubscription(subscription) {
  const uid = await resolveFirebaseUID(subscription);
  if (!uid) {
    console.error("[stripe-webhook] No Firebase UID on subscription", subscription.id);
    return;
  }
  const priceId = subscription.items?.data?.[0]?.price?.id;
  const planId = PRICE_ID_TO_PLAN[priceId] || "free";

  await admin
    .firestore()
    .collection("users")
    .doc(uid)
    .set(
      {
        subscription: {
          planId,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end ?? null,
          stripeCustomerId: subscription.customer,
        },
      },
      { merge: true }
    );
}

exports.stripeWebhook = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed.");

  let event;
  try {
    const signature = req.headers["stripe-signature"];
    // req.rawBody is the unparsed Buffer the functions-framework always keeps
    // around; Stripe's signature check fails on anything re-serialized from
    // a parsed JSON body because key order/whitespace can differ.
    event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe-webhook] Signature verification failed:", error.message);
    return res.status(400).send(`Webhook signature verification failed.`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await syncSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscription(event.data.object);
        break;
      }
      default:
        break; // Unhandled event types are intentionally ignored.
    }
    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook] Handler error:", error);
    // Still 200 — Stripe retries on non-2xx, and a handler bug shouldn't
    // cause the same event to hammer this function indefinitely.
    res.status(200).json({ received: true, handled: false });
  }
};
