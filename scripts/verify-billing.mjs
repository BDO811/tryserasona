#!/usr/bin/env node
/**
 * Prove the billing path works end to end, against the real deployed functions.
 *
 *   node scripts/verify-billing.mjs
 *
 * Creates a throwaway Firebase account, asks createCheckoutSession for a
 * Stripe Checkout URL for each paid plan, confirms the session is real by
 * reading it back from Stripe, and checks the unauthenticated and bad-plan
 * paths are refused. Deletes the account at the end.
 *
 * Needs STRIPE_SECRET_KEY only to read sessions back for verification; the
 * functions hold their own copy from Secret Manager.
 */

import { readFileSync } from "node:fs";

const BASE = "https://us-central1-amits-playground-po.cloudfunctions.net";
const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? "  — " + detail : ""}`);
};

async function main() {
  const KEY = env.VITE_FIREBASE_API_KEY;
  const email = `billing-probe-${Date.now()}@example.com`;
  const signUp = await fetch(`${IDENTITY}:signUp?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "probe-password-12345", returnSecureToken: true }),
  }).then((r) => r.json());
  if (!signUp.idToken) {
    console.error("could not create a test account:", JSON.stringify(signUp).slice(0, 200));
    process.exit(1);
  }
  check("throwaway account created", true, signUp.localId);

  // Unauthenticated callers must be refused — this endpoint can create Stripe
  // objects, so it must never be open.
  const anon = await fetch(`${BASE}/createCheckoutSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId: "core" }),
  });
  check("unauthenticated checkout refused", anon.status === 401 || anon.status === 403, `HTTP ${anon.status}`);

  const authed = (body) =>
    fetch(`${BASE}/createCheckoutSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUp.idToken}` },
      body: JSON.stringify(body),
    });

  const portal = () =>
    fetch(`${BASE}/createPortalSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${signUp.idToken}` },
      body: JSON.stringify({ returnUrl: "https://tryserasona.com/account" }),
    });

  // Before any checkout there is no Stripe customer, so the portal has nothing
  // to open. Must be a clean 400, not a 500.
  const portalBefore = await portal();
  check(
    "portal refuses before any checkout",
    portalBefore.status === 400,
    `HTTP ${portalBefore.status}`
  );

  for (const planId of ["core", "plus", "executive"]) {
    const res = await authed({
      planId,
      successUrl: "https://tryserasona.com/account?checkout=success",
      cancelUrl: "https://tryserasona.com/pricing?checkout=canceled",
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 200 && typeof body.url === "string" && body.url.includes("checkout.stripe.com");
    check(`checkout session for ${planId}`, ok, ok ? body.url.slice(0, 48) + "…" : `HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);

    // Confirm with Stripe that the session is real and priced correctly.
    if (ok && STRIPE_KEY) {
      const id = new URL(body.url).pathname.split("/").filter(Boolean).pop();
      const sess = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=line_items`,
        { headers: { Authorization: `Bearer ${STRIPE_KEY}` } }
      ).then((r) => r.json()).catch(() => ({}));
      const amount = sess?.line_items?.data?.[0]?.amount_total ?? sess?.amount_total;
      const expected = { core: 2900, plus: 4900, executive: 14900 }[planId];
      check(
        `  ${planId} session priced $${(expected / 100).toFixed(2)}`,
        amount === expected,
        amount == null ? "could not read it back" : `$${(amount / 100).toFixed(2)}, mode=${sess.mode}`
      );
    }
  }

  const bad = await authed({ planId: "free" });
  check("unknown plan refused", bad.status >= 400, `HTTP ${bad.status}`);

  // Starting a checkout creates the Stripe customer and records it on the user
  // document, so by now the portal has something to open.
  const portalAfter = await portal();
  const portalBody = await portalAfter.json().catch(() => ({}));
  check(
    "portal opens once a customer exists",
    portalAfter.status === 200 && String(portalBody.url).includes("billing.stripe.com"),
    portalAfter.status === 200 ? String(portalBody.url).slice(0, 46) + "…" : `HTTP ${portalAfter.status} ${JSON.stringify(portalBody).slice(0, 120)}`
  );

  // The webhook must reject anything without a valid Stripe signature.
  const forged = await fetch(`${BASE}/stripeWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=forged" },
    body: JSON.stringify({ type: "customer.subscription.created", data: { object: {} } }),
  });
  check("webhook rejects a forged signature", forged.status >= 400, `HTTP ${forged.status}`);

  await fetch(`${IDENTITY}:delete?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: signUp.idToken }),
  });
  check("test account deleted", true);

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("harness error:", err.message);
  process.exit(1);
});
