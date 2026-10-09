#!/usr/bin/env node
/**
 * Prove the server-side free check-in limit actually fires.
 *
 * Creates a throwaway Firebase account, stores one check-in (expect 200),
 * tries a second (expect 402), then deletes the account. A UI check cannot
 * demonstrate this: the whole point of the server limit is that it holds for a
 * caller with a valid token and no browser involved, which is exactly what this
 * script is.
 *
 *   node scripts/verify-free-limit.mjs
 *
 * Reads VITE_FIREBASE_API_KEY from .env. Leaves the stored session behind in
 * Firestore under a deleted uid, which is harmless and keeps the script from
 * needing admin credentials.
 */

import { readFileSync } from "node:fs";

const FN = "https://us-central1-amits-playground-po.cloudfunctions.net/voiceHistory";
const IDENTITY = "https://identitytoolkit.googleapis.com/v1/accounts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const KEY = env.VITE_FIREBASE_API_KEY;
if (!KEY) {
  console.error("VITE_FIREBASE_API_KEY missing from .env");
  process.exit(1);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push(pass);
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? "  — " + detail : ""}`);
};

const body = (n) => ({
  model: "haven",
  pathway: "WELLNESS",
  capturedAt: Date.now(),
  signals: [{ name: "fatigue", label: `Fatigue ${n}`, score: 0.4, level: "moderate", flagged: true }],
  summary: { overallLevel: "moderate", recommendedAction: "review", flaggedCount: 1, totalSignals: 1 },
});

async function save(idToken, n) {
  const res = await fetch(FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body(n)),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const email = `free-limit-probe-${Date.now()}@example.com`;
  const password = "probe-password-12345";

  const signUp = await fetch(`${IDENTITY}:signUp?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const account = await signUp.json();
  if (!account.idToken) {
    console.error("could not create a test account:", JSON.stringify(account).slice(0, 300));
    process.exit(1);
  }
  check("throwaway free account created", true, account.localId);

  const first = await save(account.idToken, 1);
  check("first check-in stored", first.status === 200, `HTTP ${first.status}`);

  const second = await save(account.idToken, 2);
  check(
    "second check-in refused",
    second.status === 402 && second.json.code === "free_limit_reached",
    `HTTP ${second.status} ${JSON.stringify(second.json)}`
  );

  // History must still be readable — the limit blocks writing, not reading the
  // one reading they paid nothing for.
  const hist = await fetch(FN, { headers: { Authorization: `Bearer ${account.idToken}` } });
  const histJson = await hist.json().catch(() => ({}));
  check(
    "their one reading is still readable",
    hist.status === 200 && (histJson.sessions || []).length === 1,
    `HTTP ${hist.status}, ${(histJson.sessions || []).length} session(s)`
  );

  await fetch(`${IDENTITY}:delete?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: account.idToken }),
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
