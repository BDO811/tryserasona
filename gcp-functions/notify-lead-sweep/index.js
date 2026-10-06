const { Firestore } = require("@google-cloud/firestore");

const firestore = new Firestore();

/**
 * Runs on a schedule (Cloud Scheduler -> HTTP, every 30 min) and retries the
 * notification email for any lead notifyLead already wrote to Firestore but
 * could not email after its own in-request retries. Covers the case where
 * the failure was transient (a Gmail token refresh hiccup, a brief API
 * error) and has since cleared on its own.
 *
 * Deliberately reuses the same GMAIL_* secrets as notifyLead: this sweep is
 * a second attempt at the same channel, not independent redundancy. If the
 * refresh token itself is dead, this will keep failing too — that case is
 * covered separately by a scheduled check that alerts Amit through a
 * completely different, already-authenticated channel (gmail-multi), not
 * through this project's Gmail OAuth client at all.
 */

function base64url(input) {
  return Buffer.from(input, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGmailAccessToken() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail credentials not configured");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh Gmail token: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  return data.access_token;
}

async function sendLeadEmail(lead) {
  const accessToken = await getGmailAccessToken();
  const subject = `New ${lead.brand || "Sona-2"} demo submission: ${lead.fullName} (retried by sweep)`;
  const body = [
    "New wellness demo submission. The original send failed; this copy came from the retry sweep.",
    "",
    `Name: ${lead.fullName}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone}`,
    `Biological sex: ${lead.biologicalSex ?? "not specified"}`,
    `Age range: ${lead.ageRange ?? "not specified"}`,
    `Language: ${lead.language}`,
    `Consent given: ${lead.consentGiven ? "yes" : "no"}`,
  ].join("\n");
  const message = [`To: amit@amplifierhealth.com`, `Subject: ${subject}`, "Content-Type: text/plain; charset=utf-8", "", body].join(
    "\r\n"
  );
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64url(message) }),
  });
  if (!response.ok) {
    throw new Error(`Gmail send failed: ${response.status} ${await response.text()}`);
  }
}

exports.notifyLeadSweep = async (req, res) => {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // don't retry forever
  const snapshot = await firestore
    .collection("wellness_demo_leads")
    .where("emailSent", "==", false)
    .where("createdAt", ">=", cutoff)
    .get();

  const results = [];
  for (const doc of snapshot.docs) {
    const lead = doc.data();
    try {
      await sendLeadEmail(lead);
      await doc.ref.update({
        emailSent: true,
        emailAttempts: (lead.emailAttempts || 0) + 1,
        emailError: null,
        emailSentBySweep: true,
      });
      results.push({ id: doc.id, sent: true });
    } catch (error) {
      await doc.ref.update({
        emailAttempts: (lead.emailAttempts || 0) + 1,
        emailError: String(error.message || error),
      });
      console.error(`[notify-lead-sweep] Still failing for ${doc.id}:`, error);
      results.push({ id: doc.id, sent: false, error: String(error.message || error) });
    }
  }

  res.status(200).json({ checked: snapshot.size, results });
};
