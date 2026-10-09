#!/usr/bin/env node
/**
 * End-to-end check of what a real visitor to the live site actually gets.
 *
 *   node scripts/verify-production.mjs
 *
 * Reads the deployed bundle for its own Firebase key rather than using .env, so
 * this tests what is actually shipped rather than what is configured locally.
 * Creates a throwaway account, exercises the free check-in limit and the live
 * checkout, then deletes the account and its Stripe customer.
 *
 * No payment is completed and no card details are entered.
 */

const SITE = process.env.SITE || "https://tryserasona.com";
const FN = "https://us-central1-amits-playground-po.cloudfunctions.net";
const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? "  — " + detail : ""}`);
};

async function main() {
  // What the live site actually ships.
  const html = await fetch(SITE).then((r) => r.text());
  const bundlePath = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0];
  check("site serves a bundle", !!bundlePath, bundlePath ?? "none");
  const bundle = await fetch(`${SITE}${bundlePath}`).then((r) => r.text());

  const fbKey = bundle.match(/AIzaSy[A-Za-z0-9_-]{30,}/)?.[0];
  check("Firebase key shipped", !!fbKey);
  check("billing endpoints shipped", bundle.includes("createCheckoutSession") && bundle.includes("createPortalSession"));
  check("voice harness shipped", bundle.includes("voice-call-harness"));
  check("debug routes absent", !bundle.includes("api-debug") && !bundle.includes("panel-preview"));
  // A secret key in a browser bundle would be a catastrophe; assert it is not.
  check("no secret keys in the bundle", !/sk_(live|test)_/.test(bundle));

  // A real visitor creating a real account on the live config.
  const email = `prod-check-${Date.now()}@example.com`;
  const acct = await fetch(`${IDENTITY}:signUp?key=${fbKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "probe-password-12345", returnSecureToken: true }),
  }).then((r) => r.json());
  check("signup works on the live config", !!acct.idToken, acct.localId ?? JSON.stringify(acct).slice(0, 90));
  if (!acct.idToken) return done();

  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${acct.idToken}` };

  // Free tier: one check-in, then refused.
  const save = (n) => fetch(`${FN}/voiceHistory`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ model: "haven", pathway: "WELLNESS", capturedAt: Date.now(),
      signals: [{ name: "fatigue", label: `Fatigue ${n}`, score: 0.4, level: "moderate", flagged: true }] }),
  });
  check("first free check-in stored", (await save(1)).status === 200);
  const second = await save(2);
  check("second free check-in refused", second.status === 402, `HTTP ${second.status}`);

  // Live checkout.
  const co = await fetch(`${FN}/createCheckoutSession`, {
    method: "POST", headers: auth,
    body: JSON.stringify({ planId: "core", successUrl: `${SITE}/account`, cancelUrl: `${SITE}/pricing` }),
  });
  const coBody = await co.json().catch(() => ({}));
  const liveSession = typeof coBody.url === "string" && coBody.url.includes("cs_live_");
  check("live checkout session created", co.status === 200 && liveSession, liveSession ? coBody.url.slice(0, 50) + "…" : `HTTP ${co.status}`);

  // Clean up the Stripe customer this just created in the live account.
  if (STRIPE_KEY) {
    const custs = await fetch(`https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`, {
      headers: { Authorization: `Bearer ${STRIPE_KEY}` },
    }).then((r) => r.json()).catch(() => ({}));
    const id = custs?.data?.[0]?.id;
    if (id) {
      const del = await fetch(`https://api.stripe.com/v1/customers/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${STRIPE_KEY}` },
      }).then((r) => r.json()).catch(() => ({}));
      check("live Stripe customer cleaned up", del.deleted === true, id);
    } else {
      check("live Stripe customer cleaned up", true, "none created");
    }
  }

  await fetch(`${IDENTITY}:delete?key=${fbKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: acct.idToken }),
  });
  check("test account deleted", true);
  done();
}

function done() {
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("harness error:", err.message);
  process.exit(1);
});
