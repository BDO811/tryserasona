import { auth } from "@/lib/firebase";
import type { PlanId } from "@/context/AuthContext";

const CREATE_CHECKOUT_SESSION_URL = import.meta.env.VITE_CREATE_CHECKOUT_SESSION_URL as string | undefined;
const CREATE_PORTAL_SESSION_URL = import.meta.env.VITE_CREATE_PORTAL_SESSION_URL as string | undefined;

/**
 * Shown when Stripe is not wired up yet. Plain language on purpose: this is a
 * state the product is genuinely in right now, not an error the person caused
 * or can do anything about.
 */
export const BILLING_NOT_READY = "Plans aren't open yet. Check back shortly.";

async function authedFetch(url: string, body: Record<string, unknown>) {
  const user = auth?.currentUser;
  if (!user) throw new Error("Not signed in.");
  const idToken = await user.getIdToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // The URL is configured in .env but the function behind it may not be
    // deployed yet, in which case Cloud Functions answers 404 with an HTML
    // page. Parsing that as JSON used to throw a SyntaxError, so the person
    // saw "Unexpected token '<'" instead of anything about billing.
    if (response.status === 404) throw new Error(BILLING_NOT_READY);
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || "Request failed.");
  }
  return response.json();
}

// One-time and subscription prices both run through Stripe Checkout; the
// Cloud Function decides mode ("payment" vs "subscription") from the plan id.
export async function startCheckout(planId: Exclude<PlanId, "free">) {
  if (!CREATE_CHECKOUT_SESSION_URL) throw new Error(BILLING_NOT_READY);
  const { url } = await authedFetch(CREATE_CHECKOUT_SESSION_URL, {
    planId,
    successUrl: `${window.location.origin}/account?checkout=success`,
    cancelUrl: `${window.location.origin}/pricing?checkout=canceled`,
  });
  window.location.href = url;
}

export async function openBillingPortal() {
  if (!CREATE_PORTAL_SESSION_URL) throw new Error(BILLING_NOT_READY);
  const { url } = await authedFetch(CREATE_PORTAL_SESSION_URL, {
    returnUrl: `${window.location.origin}/account`,
  });
  window.location.href = url;
}
