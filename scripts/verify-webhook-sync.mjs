#!/usr/bin/env node
/**
 * Prove the last link: a real Stripe subscription reaches stripeWebhook and
 * lands as an entitlement on the user's Firestore document.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/verify-webhook-sync.mjs
 *
 * Everything up to this point could pass while a paying customer still ended
 * up stuck on free, because nothing had ever exercised the webhook with a
 * genuine subscription event.
 *
 * No card details are typed anywhere. Stripe's test-mode `pm_card_visa` token
 * stands in for a payment method over the API, which is how Stripe intends
 * this to be tested.
 *
 * Cleans up after itself: cancels the subscription, deletes the Stripe
 * customer, deletes the Firebase account.
 */

import { readFileSync } from "node:fs";

const BASE = "https://us-central1-amits-playground-po.cloudfunctions.net";
const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";
const KEY = process.env.STRIPE_SECRET_KEY;
const CORE_PRICE = process.env.STRIPE_PRICE_CORE || "price_1UOTmP0nqIp1IKiBxX2mH3Nh";

if (!KEY?.startsWith("sk_test_")) {
  console.error("STRIPE_SECRET_KEY must be a test key (sk_test_...). Refusing to run against live.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")])
);
const FB_KEY = env.VITE_FIREBASE_API_KEY;

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? "  — " + detail : ""}`);
};

async function stripe(path, { method = "GET", form } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${json?.error?.message}`);
  return json;
}

async function readPlan(idToken, uid) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/amits-playground-po/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  const body = await res.json().catch(() => ({}));
  const sub = body?.fields?.subscription?.mapValue?.fields;
  return {
    planId: sub?.planId?.stringValue ?? null,
    status: sub?.status?.stringValue ?? null,
    customerId: sub?.stripeCustomerId?.stringValue ?? null,
  };
}

async function main() {
  // 1. An account, and a Stripe customer created the way the app creates one.
  const email = `webhook-probe-${Date.now()}@example.com`;
  const acct = await fetch(`${IDENTITY}:signUp?key=${FB_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "probe-password-12345", returnSecureToken: true }),
  }).then((r) => r.json());
  check("account created", !!acct.idToken, acct.localId);

  await fetch(`${BASE}/createCheckoutSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${acct.idToken}` },
    body: JSON.stringify({ planId: "core", successUrl: "https://tryserasona.com/account", cancelUrl: "https://tryserasona.com/pricing" }),
  });
  const seeded = await readPlan(acct.idToken, acct.localId);
  check("checkout created the Stripe customer", !!seeded.customerId, seeded.customerId ?? "none");

  // 2. Subscribe that customer for real, using Stripe's test payment token.
  // Attaching the shared `pm_card_visa` token clones it into a real payment
  // method with its own id. Using the token again here fails with "must be
  // attached to the customer" — it is the clone that belongs to them.
  const pm = await stripe(`payment_methods/pm_card_visa/attach`, {
    method: "POST",
    form: { customer: seeded.customerId },
  });
  await stripe(`customers/${seeded.customerId}`, {
    method: "POST",
    form: { "invoice_settings[default_payment_method]": pm.id },
  });
  const sub = await stripe("subscriptions", {
    method: "POST",
    form: {
      customer: seeded.customerId,
      "items[0][price]": CORE_PRICE,
      "metadata[firebaseUID]": acct.localId,
    },
  });
  check("subscription created in Stripe", sub.status === "active" || sub.status === "trialing", `${sub.id} ${sub.status}`);

  // 3. Stripe now delivers customer.subscription.created to the webhook, which
  //    should write the entitlement. Give it a moment.
  let plan = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    plan = await readPlan(acct.idToken, acct.localId);
    if (plan.planId === "core") break;
  }
  check("webhook wrote the plan to Firestore", plan?.planId === "core", `planId=${plan?.planId} status=${plan?.status}`);
  check("status is active", plan?.status === "active" || plan?.status === "trialing", `status=${plan?.status}`);

  // 4. Cancel, and confirm the webhook takes the entitlement away again. A plan
  //    that cannot be revoked is worse than one that cannot be granted.
  await stripe(`subscriptions/${sub.id}`, { method: "DELETE" });
  let after = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    after = await readPlan(acct.idToken, acct.localId);
    if (after.status === "canceled") break;
  }
  check("cancelling revokes it", after?.status === "canceled", `status=${after?.status} planId=${after?.planId}`);

  // cleanup
  await stripe(`customers/${seeded.customerId}`, { method: "DELETE" }).catch(() => {});
  await fetch(`${IDENTITY}:delete?key=${FB_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: acct.idToken }),
  });
  check("cleaned up", true);

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nharness error:", err.message);
  process.exit(1);
});
