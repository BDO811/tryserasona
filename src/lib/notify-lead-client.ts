/**
 * Client for the notifyLead Cloud Function, which stores the submission and
 * emails a notification on every completed triage form.
 *
 * The URL is a hardcoded default with an env override, matching
 * leadgen-api-client and voice-history-client.
 *
 * That default is the actual fix for a silent failure, not a convenience.
 * This used to read `if (import.meta.env.VITE_NOTIFY_LEAD_URL)` with the value
 * living only in `.env`, which is gitignored. Vite inlines VITE_* at build
 * time, so the CI build had nothing to inline, the guard was false, and the
 * deployed bundle contained no reference to the function at all — no request
 * was ever made from try.amplifierhealth.com and no email was ever sent. It
 * worked locally, where `.env` exists, which is what made it hard to notice.
 *
 * Nothing secret is exposed by hardcoding it: the endpoint is an
 * unauthenticated function, exactly like the analyze-audio and voice-history
 * endpoints whose URLs already ship in the bundle. Credentials stay in the
 * function's own environment.
 */

const DEFAULT_NOTIFY_LEAD_URL =
  "https://us-central1-amits-playground-po.cloudfunctions.net/notifyLead";

const NOTIFY_LEAD_URL =
  (import.meta.env.VITE_NOTIFY_LEAD_URL as string | undefined) || DEFAULT_NOTIFY_LEAD_URL;

export interface LeadSubmission {
  fullName: string;
  email: string;
  phone: string;
  healthFocus: string;
  biologicalSex: string;
  ageRange: string;
  language: string;
  consentGiven: boolean;
}

/**
 * Record a completed triage submission. Resolves to whether the notification
 * was accepted, and never throws: the caller is about to send someone into a
 * recording and must not be blocked by this.
 */
export async function notifyLead(lead: LeadSubmission): Promise<boolean> {
  try {
    const response = await fetch(NOTIFY_LEAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });

    if (!response.ok) {
      console.error(`[notify-lead] Failed with status ${response.status}:`, await response.text());
      return false;
    }
    console.log("[notify-lead] Lead recorded and notification sent");
    return true;
  } catch (error) {
    console.error("[notify-lead] Failed:", error);
    return false;
  }
}
