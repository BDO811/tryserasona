# Setting up accounts + billing

What's already wired in code (this pass): sign up / log in (`src/context/AuthContext.tsx`), the pricing page
(`src/pages/Pricing.tsx`), an account/billing page (`src/pages/Account.tsx`), and three Cloud Functions
(`gcp-functions/create-checkout-session`, `create-portal-session`, `stripe-webhook`). None of it can go live
until the steps below are done — they need real accounts and credentials this session doesn't have.

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
