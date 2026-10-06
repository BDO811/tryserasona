import { auth } from "@/lib/firebase";
import type { PlanId } from "@/context/AuthContext";

const CREATE_CHECKOUT_SESSION_URL = import.meta.env.VITE_CREATE_CHECKOUT_SESSION_URL as string | undefined;
const CREATE_PORTAL_SESSION_URL = import.meta.env.VITE_CREATE_PORTAL_SESSION_URL as string | undefined;

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
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || "Request failed.");
  }
  return response.json();
}

// One-time and subscription prices both run through Stripe Checkout; the
// Cloud Function decides mode ("payment" vs "subscription") from the plan id.
export async function startCheckout(planId: Exclude<PlanId, "free">) {
  if (!CREATE_CHECKOUT_SESSION_URL) throw new Error("Billing is not configured yet.");
  const { url } = await authedFetch(CREATE_CHECKOUT_SESSION_URL, {
    planId,
    successUrl: `${window.location.origin}/account?checkout=success`,
    cancelUrl: `${window.location.origin}/pricing?checkout=canceled`,
  });
  window.location.href = url;
}

export async function openBillingPortal() {
  if (!CREATE_PORTAL_SESSION_URL) throw new Error("Billing is not configured yet.");
  const { url } = await authedFetch(CREATE_PORTAL_SESSION_URL, {
    returnUrl: `${window.location.origin}/account`,
  });
  window.location.href = url;
}
