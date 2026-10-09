# Setting up accounts + billing

What's already wired in code (this pass): sign up / log in (`src/context/AuthContext.tsx`), the pricing page
(`src/pages/Pricing.tsx`), an account/billing page (`src/pages/Account.tsx`), and three Cloud Functions
(`gcp-functions/create-checkout-session`, `create-portal-session`, `stripe-webhook`). None of it can go live
until the steps below are done — they need real accounts and credentials this session doesn't have.

> **Billing is LIVE, 2026-10-08.** Stripe is in live mode on
> `acct_1T9XYi0nqIp1IKiB` (Amplifier Health Inc, charges and payouts enabled).
> Live products and prices exist at $29 / $49 / $149, the live webhook endpoint
> is registered, the live customer portal is configured, and all three Cloud
> Functions run on live credentials mounted from Secret Manager. Section 2
> below is kept for reference; nothing in it is outstanding.
>
> Secrets, all in Secret Manager on `amits-playground-po`:
> `stripe-secret-key-live`, `stripe-webhook-secret-live`, and the test pair
> `stripe-secret-key-test` / `stripe-webhook-secret-test`.
>
> Live price ids (set as env vars on the functions, not in this repo):
> core `price_1UOU1C0nqIp1IKiBpaC3whW4`,
> plus `price_1UOU1D0nqIp1IKiBGYL67ncK`,
> executive `price_1UOU1E0nqIp1IKiB87xrFSn7`.
>
> To go back to test mode, redeploy the three functions with the test price ids
> and the `-test` secrets. `scripts/setup-stripe.mjs` is re-runnable against
> either mode and will reuse what already exists rather than duplicating it.
>
> Worth hardening later: the functions use a full-access secret key. A
> restricted key limited to customers, checkout sessions, billing portal
> sessions and subscription reads would do the same job with a smaller blast
> radius.

> **Done, 2026-10-08.** Firebase is attached to `amits-playground-po`,
> email/password sign-in is on, `tryserasona.com` / `serasona.com` / `localhost`
> are authorized domains, the Firestore rules are deployed, and the deploy
> workflow carries the web config. Section 1 below is kept for the record; its
> diagnosis was wrong, see the correction immediately after it.

## 1. Firebase (accounts + the subscription record)

Firestore itself is already active on `amits-playground-po` (it's what `notify-lead` writes
`wellness_demo_leads` to today). What's missing is **Firebase Auth**.

This session enabled the `firebase.googleapis.com` and `identitytoolkit.googleapis.com` APIs on
`amits-playground-po`, but the actual `firebase projects:addfirebase amits-playground-po` call was rejected
with a 403 (`tenantmanagement.write` denied) — the org `amits-playground-po` sits under has a policy that
blocks Firebase project creation for the identities available in this session, independent of the API being
enabled. One of these should get past it:

1. Open <https://console.firebase.google.com/>, click **Add project**, choose **Add Firebase to an existing
   Google Cloud project**, and pick `amits-playground-po`. The console flow sometimes succeeds where the
   management API call alone gets blocked by org policy.
2. Or run `firebase projects:addfirebase amits-playground-po` yourself from an account that actually holds
   Firebase Admin rights on the `amplifierhealth.com` org (this session's two available identities,
   `amit@amplifierhealth.com` via gcloud and `mehta@helix.harvard7.net` via the Firebase CLI, both lack it).

Once Firebase is attached to the project:

- **Authentication → Sign-in method** → enable **Email/Password**.

### Correction: it was not org policy

The block above blamed an org policy on Firebase project creation. That was a
misdiagnosis of two separate problems stacked on each other.

1. **Application Default Credentials had no quota project.** Every call to
   `firebase.googleapis.com` and `identitytoolkit.googleapis.com` came back
   `403 PERMISSION_DENIED / SERVICE_DISABLED`, which reads like the API being
   switched off at the org. Sending `x-goog-user-project: amits-playground-po`
   turned the same calls into honest `404 NOT_FOUND` answers, i.e. "Firebase is
   simply not attached yet".
2. **The Firebase CLI's signed-in identity lacked one permission** on the
   project: `serviceusage.services.enable`. `projects:addfirebase` failed with
   an `IamPermissionDeniedException` naming it outright. Granting that identity
   `roles/serviceusage.serviceUsageAdmin` and `roles/firebase.admin` — from the
   project owner via gcloud — was the entire fix. It then attached first try.

Worth knowing for next time: `gcloud auth print-access-token` yields a token
without the `https://www.googleapis.com/auth/firebase` scope, and
`firebase.googleapis.com` answers unscoped tokens with an **HTML 404** rather
than a JSON permission error. Use the Firebase CLI for Firebase Management API
calls; use gcloud for IAM.

### What turning it on immediately broke

Signup had never worked, and could not have. `AuthContext.signUp` wrote a
`subscription` field onto the new user document, and the `allow create` rule in
`firestore.rules` forbids exactly that field — it is the entitlement, and only
the stripe-webhook may set it. So the auth user was created, the profile write
was rejected, `signUp` threw, and the person was left able to log in with no
profile document and no way into the app. Fixed by not writing the field; its
absence already means free/none.

- **Firestore Database** → confirm it's in Native mode (it already is, since `notify-lead` uses it).
- Deploy the rules in this repo: `firebase deploy --only firestore:rules --project amits-playground-po`
- **Project settings → General → Your apps** → register a Web app → copy the six config values into
  `Serasona_Site/.env` (`VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`,
  `_MESSAGING_SENDER_ID`, `_APP_ID`). These are public client values, not secrets.

Until this is done, `/signup`, `/login` and `/account` show a friendly "Accounts aren't set up yet" error
instead of crashing — the rest of the site (the anonymous check-in demo) is unaffected either way.

## 2. Stripe (needs you — business/bank details)

This is the one step that genuinely requires you — Stripe account creation asks for business and banking
information no session should be entering on your behalf.

1. Create (or designate) a Stripe account for Serasona at <https://dashboard.stripe.com>.
2. **Products** → create three recurring monthly Prices:
   - Serasona Core — $29.00/month
   - Serasona Plus — $49.00/month
   - Serasona Executive — $149.00/month
   Copy each Price ID (`price_...`).
3. **Developers → Webhooks** → add an endpoint at the deployed `stripeWebhook` URL (step 3 below), listening
   for: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copy the signing secret (`whsec_...`).
4. **Developers → API keys** → copy the Secret key (start in test mode: `sk_test_...`) and the Publishable
   key (`pk_test_...`).
5. **Settings → Billing → Customer portal** → activate it (needed for `create-portal-session`).

## 3. Deploy the three Cloud Functions

Same project and region as the existing functions (`amits-playground-po`, `us-central1`):

```bash
cd gcp-functions/create-checkout-session
gcloud functions deploy createCheckoutSession \
  --project=amits-playground-po --region=us-central1 --runtime=nodejs20 \
  --trigger-http --allow-unauthenticated --entry-point=createCheckoutSession \
  --set-env-vars STRIPE_SECRET_KEY=sk_test_...,STRIPE_PRICE_CORE=price_...,STRIPE_PRICE_PLUS=price_...,STRIPE_PRICE_EXECUTIVE=price_...

cd ../create-portal-session
gcloud functions deploy createPortalSession \
  --project=amits-playground-po --region=us-central1 --runtime=nodejs20 \
  --trigger-http --allow-unauthenticated --entry-point=createPortalSession \
  --set-env-vars STRIPE_SECRET_KEY=sk_test_...

cd ../stripe-webhook
gcloud functions deploy stripeWebhook \
  --project=amits-playground-po --region=us-central1 --runtime=nodejs20 \
  --trigger-http --allow-unauthenticated --entry-point=stripeWebhook \
  --set-env-vars STRIPE_SECRET_KEY=sk_test_...,STRIPE_PRICE_CORE=price_...,STRIPE_PRICE_PLUS=price_...,STRIPE_PRICE_EXECUTIVE=price_...,STRIPE_WEBHOOK_SECRET=whsec_...
```

`--allow-unauthenticated` is safe here the same way it already is for `analyze-audio` and `notify-lead`: each
function checks the Firebase ID token or the Stripe signature itself rather than relying on GCP's own IAM
layer. Paste the two resulting trigger URLs into `Serasona_Site/.env` as `VITE_CREATE_CHECKOUT_SESSION_URL`
and `VITE_CREATE_PORTAL_SESSION_URL`, and the webhook's URL into the Stripe webhook endpoint from step 2.3.

## 4. Go live

Flip `sk_test_...` / `price_...` (test mode) to the live equivalents only once a full signup → checkout →
webhook → `/account` loop has been run once in test mode end to end.
