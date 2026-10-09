#!/usr/bin/env node
/**
 * Everything on the Stripe side that can be done from a key, in one run.
 *
 * What it does NOT do: create the Stripe account. That asks for business and
 * banking details and is yours alone. Once the account exists and you have a
 * secret key, this does the rest.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs --dry-run
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs
 *
 * Creates the three products and recurring prices, registers the webhook
 * endpoint against the four events the handler actually processes, and prints
 * the exact gcloud commands to deploy the three functions with the right
 * environment. Re-runnable: it matches existing products and prices by name and
 * amount rather than creating duplicates, which is the failure mode that costs
 * you a cluttered dashboard and a wrong price id in production.
 *
 * Nothing is written to disk and no key is printed.
 */

const KEY = process.env.STRIPE_SECRET_KEY;
const DRY = process.argv.includes("--dry-run");

if (!KEY) {
  console.error("STRIPE_SECRET_KEY is required (sk_test_... to start).");
  process.exit(1);
}
if (!/^sk_(test|live)_/.test(KEY)) {
  console.error("That does not look like a Stripe secret key (expected sk_test_ or sk_live_).");
  process.exit(1);
}
const LIVE = KEY.startsWith("sk_live_");

// Must match PLAN_PRICE_IDS in gcp-functions/create-checkout-session and the
// reverse map in stripe-webhook, and the tiers on src/pages/Pricing.tsx.
const PLANS = [
  { id: "core", name: "Serasona Core", amount: 2900, env: "STRIPE_PRICE_CORE",
    description: "Daily check-ins in the app, compared to your own 30-day baseline." },
  { id: "plus", name: "Serasona Plus", amount: 4900, env: "STRIPE_PRICE_PLUS",
    description: "Everything in Core, plus Serasona calls you, on any phone." },
  { id: "executive", name: "Serasona Executive", amount: 14900, env: "STRIPE_PRICE_EXECUTIVE",
    description: "Daily phone check-ins for people who want the closest watch." },
];

const WEBHOOK_URL =
  process.env.STRIPE_WEBHOOK_URL ||
  "https://us-central1-amits-playground-po.cloudfunctions.net/stripeWebhook";

// Exactly what gcp-functions/stripe-webhook handles. Subscribing to more would
// mean paying for deliveries that are dropped on the floor.
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

async function stripe(path, { method = "GET", form } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText;
    throw new Error(`${method} ${path} -> ${res.status}: ${msg}`);
  }
  return json;
}

const log = (step, msg) => console.log(`${DRY ? "[dry-run] " : ""}${step.padEnd(16)} ${msg}`);

async function findOrCreateProduct(plan) {
  const existing = await stripe("products?limit=100&active=true");
  const found = (existing.data || []).find((p) => p.name === plan.name);
  if (found) {
    log("product", `reusing ${found.id} (${plan.name})`);
    return found.id;
  }
  if (DRY) {
    log("product", `would create "${plan.name}"`);
    return `<product-${plan.id}>`;
  }
  const created = await stripe("products", {
    method: "POST",
    form: { name: plan.name, description: plan.description },
  });
  log("product", `created ${created.id} (${plan.name})`);
  return created.id;
}

async function findOrCreatePrice(plan, productId) {
  if (!productId.startsWith("<")) {
    const prices = await stripe(`prices?product=${productId}&active=true&limit=100`);
    const found = (prices.data || []).find(
      (p) =>
        p.unit_amount === plan.amount &&
        p.currency === "usd" &&
        p.recurring?.interval === "month"
    );
    if (found) {
      log("price", `reusing ${found.id} ($${(plan.amount / 100).toFixed(2)}/mo)`);
      return found.id;
    }
  }
  if (DRY) {
    log("price", `would create $${(plan.amount / 100).toFixed(2)}/mo for ${plan.name}`);
    return `<price-${plan.id}>`;
  }
  const created = await stripe("prices", {
    method: "POST",
    form: {
      product: productId,
      currency: "usd",
      unit_amount: String(plan.amount),
      "recurring[interval]": "month",
      // The webhook maps price -> plan by id, but a lookup key makes the
      // dashboard readable and gives a stable handle if a price is ever
      // replaced (Stripe prices are immutable; you create a new one).
      lookup_key: `serasona_${plan.id}_monthly`,
    },
  });
  log("price", `created ${created.id} ($${(plan.amount / 100).toFixed(2)}/mo)`);
  return created.id;
}

async function ensureWebhook() {
  const existing = await stripe("webhook_endpoints?limit=100");
  const found = (existing.data || []).find((w) => w.url === WEBHOOK_URL);
  if (found) {
    log("webhook", `endpoint ${found.id} already points here`);
    const missing = EVENTS.filter((e) => !found.enabled_events.includes(e));
    if (missing.length && !DRY) {
      await stripe(`webhook_endpoints/${found.id}`, {
        method: "POST",
        form: Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e])),
      });
      log("webhook", `added missing events: ${missing.join(", ")}`);
    }
    // The signing secret is only ever returned at creation. An endpoint that
    // already exists cannot hand it back, so it has to come from the dashboard.
    return { id: found.id, secret: null };
  }
  if (DRY) {
    log("webhook", `would create an endpoint at ${WEBHOOK_URL}`);
    return { id: "<webhook>", secret: "<whsec_...>" };
  }
  const created = await stripe("webhook_endpoints", {
    method: "POST",
    form: {
      url: WEBHOOK_URL,
      ...Object.fromEntries(EVENTS.map((e, i) => [`enabled_events[${i}]`, e])),
      description: "Serasona subscription sync",
    },
  });
  log("webhook", `created ${created.id}`);
  return { id: created.id, secret: created.secret };
}

async function main() {
  const account = await stripe("account");
  console.log(
    `Stripe ${LIVE ? "LIVE" : "TEST"} mode — ${account.settings?.dashboard?.display_name || account.id}` +
      `${account.charges_enabled ? "" : "  (charges NOT yet enabled on this account)"}\n`
  );
  if (LIVE) {
    console.log("Running against LIVE keys. Run a full signup -> checkout -> webhook loop in test mode first.\n");
  }

  const priceIds = {};
  for (const plan of PLANS) {
    const productId = await findOrCreateProduct(plan);
    priceIds[plan.env] = await findOrCreatePrice(plan, productId);
  }

  const webhook = await ensureWebhook();

  console.log("\n--- deploy the three functions with these ---\n");
  const envPairs = [
    "STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY",
    ...PLANS.map((p) => `${p.env}=${priceIds[p.env]}`),
  ].join(",");

  console.log(`cd gcp-functions/create-checkout-session && gcloud functions deploy createCheckoutSession \\
  --project=amits-playground-po --region=us-central1 --runtime=nodejs20 --gen2 \\
  --trigger-http --allow-unauthenticated --entry-point=createCheckoutSession --source=. \\
  --set-env-vars ${envPairs}

cd ../create-portal-session && gcloud functions deploy createPortalSession \\
  --project=amits-playground-po --region=us-central1 --runtime=nodejs20 --gen2 \\
  --trigger-http --allow-unauthenticated --entry-point=createPortalSession --source=. \\
  --set-env-vars STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY

cd ../stripe-webhook && gcloud functions deploy stripeWebhook \\
  --project=amits-playground-po --region=us-central1 --runtime=nodejs20 --gen2 \\
  --trigger-http --allow-unauthenticated --entry-point=stripeWebhook --source=. \\
  --set-env-vars ${envPairs},STRIPE_WEBHOOK_SECRET=${webhook.secret || "<from the Stripe dashboard>"}`);

  if (!webhook.secret) {
    console.log(
      "\nNote: the webhook endpoint already existed, and Stripe only returns the signing\n" +
        "secret when an endpoint is first created. Copy it from Developers -> Webhooks ->\n" +
        `${webhook.id} -> Signing secret, or delete that endpoint and re-run this.`
    );
  }
  console.log("\nAlso activate the customer portal once: Settings -> Billing -> Customer portal.");
  console.log("create-portal-session cannot work until that is switched on.");
}

main().catch((err) => {
  console.error("\nfailed:", err.message);
  process.exit(1);
});
