# Serasona v1 — product plan and platform roadmap

Written after reviewing three comparable products and the current state of this repo. Covers what shipped
this pass (web signup + billing), what the research actually supports, and what's left for web history,
iOS, Android, and the calling agent.

## What the three comparables actually are

- **Sona by Pelago** (`hellosona.com`) — free to the end user, paid by the employer through a pilot program,
  fees 100% at risk against clinical outcome scores (GAD-7/PHQ-9). Not a self-pay product and not a pricing
  comparable. The useful piece: "a real person is always an option" — every conversation can escalate to a
  licensed clinician, stated plainly on the marketing page.
- **Soma Health** (`soma-health.co`) — pre-launch. The site is a single long-form essay (no app, no pricing,
  no signup) built around "a mirror for your mind," voice as the most cognitively intense everyday act. No
  business model to borrow; useful for brand voice only.
- **ToneWell** (`tonewell.co` — `tonewell.com` itself is a parked GoDaddy resale domain, not the company) —
  the real comparable. Self-pay, Stripe checkout, no wearables. A 30-second voice note becomes an 8-signal
  report (energy, hydration, mineral load, sleep, stress, inflammation, toxins, pathogens) with ranked
  priorities and a Day 1/3/10 action plan, delivered by email in ~10 minutes. Pricing: single scan $59,
  10-day reset $99, $49/month membership (3 reports/month), $149/week Executive (4 scans/month).

## Pricing landed on (live on `/pricing`)

ToneWell's price points are the validated data point for what people will pay for a voice-based wellness
read with no wearable. Serasona's shape is different in one load-bearing way: it's a **recurring baseline
product**, not a one-off scan — the design system's whole premise is comparing you to your own 30-day
history, which only works with daily use, not a single purchase. So the free one-off tier is a taste, not
the core offer, and the paid tiers are subscriptions rather than per-scan purchases:

| Tier | Price | What it is |
|---|---|---|
| Try it | $0, one check-in | No history yet — the hook, not the product |
| Core | $29/mo | Unlimited app check-ins, 30-day baseline, Clear/Watch/Strained trend |
| Plus | $49/mo | Core + Serasona calls you weekly on any phone, no app needed |
| Executive | $149/mo | Plus + daily call-in, fastest delivery, priority support |

Core and Plus bracket ToneWell's own $49/month membership price, which is real market signal for this
category. Plus's "we call you" layer is Sona's "no app required" posture, sold rather than given away.

## What shipped this pass (web)

- `src/context/AuthContext.tsx` — Firebase email/password auth, a per-user Firestore doc at `/users/{uid}`
  holding `subscription: { planId, status, currentPeriodEnd, stripeCustomerId }`, written only by the Stripe
  webhook (never the client — see `firestore.rules`).
- `/pricing`, `/login`, `/signup`, `/account` — new routes, gated with `ProtectedRoute` where it matters.
- `gcp-functions/create-checkout-session`, `create-portal-session`, `stripe-webhook` — Stripe Checkout
  (subscription mode), the Customer Portal for self-serve plan changes/cancellation, and the webhook that
  keeps Firestore in sync with Stripe's view of the subscription.
- Everything degrades to "accounts aren't set up yet" rather than a blank page until real Firebase/Stripe
  keys are filled in — see `docs/SETUP_BILLING.md` for the exact remaining steps, all of which need either
  your Stripe business details or a GCP org-admin identity this session doesn't have.

## What this pass did NOT touch

The existing `/`, `/dashboard`, `/history` flow is the anonymous one-shot demo (record once, see one result,
nothing persisted) — it's what's live on tryserasona.com today and this pass left it alone. Turning that
into the actual recurring product (daily check-in writes to `/users/{uid}/checkins`, a real 30-day trend
view backed by that history instead of the current in-memory `AssessmentContext`) is the next pass on web,
once Firebase Auth is actually reachable to test against.

## iOS and Android

Recommendation: **Capacitor**, not a from-scratch React Native or native rewrite. It wraps this exact Vite
build into native iOS/Android shells — same components, same design system, same Firebase Auth/Firestore
SDKs (which have first-class native support), same billing code. A rewrite would mean re-implementing the
whole capture → analysis → reveal flow twice more for no product difference.

Needed from you before this can go further: an Apple Developer Program enrollment (for TestFlight/App Store)
and a Google Play Console account. One open question to decide together: Apple and Google both restrict
apps from pointing to external payment pages for digital content, but wellness/health subscriptions that
aren't "digital content consumed in the app" (the common carve-out reads/fitness/education/health
coaching apps use) generally can keep Stripe rather than forcing StoreKit/Play Billing — worth a deliberate
check against current store guidelines before submission, not an assumption to build on silently.

## The calling agent ("Serasona calls you")

Don't build a new call harness — reuse the one already proven on `try.amplifierhealth.com`
(see memory `project-try-amplifier-voice-call-harness`): scripted Telnyx TeXML came in roughly 6x cheaper
than any agent platform for the same job, with 8kHz PSTN audio quality as the one known open risk against
voice-model accuracy, already flagged there and not yet resolved. Shape for Serasona: Telnyx calls the
member on a schedule tied to their plan (weekly for Plus, daily for Executive), runs the same prompts as
`QuestionFlowVisualizer`, posts the captured audio to the existing `analyze-audio` function, and the result
reaches them by text or email instead of in-app. Needs a Telnyx account and number from you, and the same
8kHz-degradation question answered before it ships for real.
