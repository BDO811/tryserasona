# Sandbox

A local copy of the app with every feature switched on, including the ones held
back from try.amplifierhealth.com. Nothing here touches the live site.

## Start it

```bash
cd /Users/amitmehta/Claude/ReSkinnable_B2C_Demo_Lovable
npm run sandbox
```

It prints two addresses:

- **This machine** — `http://localhost:8080`
- **Phone or tablet** — `http://<your-mac-lan-ip>:8080`, same wifi

The second one matters. The layout bugs that have come up have all been mobile
ones, and they cannot be reproduced by narrowing a desktop window: a phone has a
different pixel ratio, a different browser chrome height, and a real on-screen
keyboard. Open that address on the handset itself.

Edits reload immediately. Ctrl-C stops it.

## What is on here and off in production

| Feature | Sandbox | try.amplifierhealth.com |
|---|---|---|
| Recommendations button | on | off |

The button works: the Cloud Function answers and returns real suggestions. It is
held back because latency through the function was 40 to 48 seconds and one call
exceeded the request timeout. A fix is deployed and unverified. See
`RECOMMENDATIONS_ENABLED` in `src/components/report/RecommendationsPanel.tsx`.

To force it either way without editing code:

```bash
VITE_RECOMMENDATIONS=0 npm run sandbox   # off
VITE_RECOMMENDATIONS=1 npm run build     # on, in a production build
```

## Screens you cannot otherwise reach

Recording audio to reach a screen is slow, and some screens cannot be reached at
all without a live result. These render them directly:

| Path | What it shows |
|---|---|
| `/panel-preview?dev=true` | Hero at all four rungs, signal rows, sub-dimensions |
| `/panel-preview?dev=true&screen=analysis` | The analysis screen on its own |
| `/api-debug?dev=true` | The raw API response behind the last result |

The samples in the panel preview are real captured API runs, not invented
numbers, so the bands they land in are the bands a real recording produces.

## Before pushing anything live

```bash
npx tsc -p tsconfig.app.json --noEmit   # types
npm test                                # 201 tests
npm run build                           # production build
```

`main` deploys to try.amplifierhealth.com on push. The `sandbox` branch is local
only and is not deployed anywhere.
