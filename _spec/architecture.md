# System Architecture

## Overview

B2C lead-gen web app: voice-based health/cognitive assessment → analysis → triage → CRM (Attio). Frontend (Vite + React) calls Supabase Edge Functions; functions proxy to external LeadGen API and Attio API. No app-owned database; Supabase types are empty; data flows via APIs and context.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite 5, React 18, TypeScript, React Router 6, TanStack Query |
| UI | Tailwind CSS, Radix UI (shadcn/ui), Framer Motion, Recharts |
| Backend | Supabase Edge Functions (Deno) |
| External APIs | LeadGen API (audio analysis), Attio (CRM) |
| Build/Test | Vitest, ESLint, TypeScript 5 |

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (SPA)                                                   │
│  ┌─────────────┐  ┌──────────────────┐  ┌─────────────────────┐ │
│  │ Pages       │  │ AssessmentContext│  │ leadgen-api-client   │ │
│  │ Index,      │  │ (pathway, result, │  │ (analyze-audio,      │ │
│  │ Dashboard,  │  │ profile, attioId) │  │  via edge function)  │ │
│  │ Detailed…   │  └────────┬─────────┘  └──────────┬───────────┘ │
│  └──────┬──────┘            │                       │             │
│         │                   │  ┌────────────────────┴───────────┐ │
│  ┌──────▼───────────────────▼──▼──────────────────────────────┐ │
│  │ Components: TriageFlow, AudioVisualizer, HealthProfile,      │ │
│  │ PartnerHandoffModal, report/*, ui/*                          │ │
│  └────────────────────────────────┬─────────────────────────────┘ │
└───────────────────────────────────│───────────────────────────────┘
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase Edge Functions                                         │
│  ┌─────────────────┐ ┌──────────────────┐ ┌───────────────────┐ │
│  │ analyze-audio   │ │ attio-create-lead │ │ attio-update-lead  │ │
│  │ (proxy + CORS)  │ │ (JSON body)       │ │ (recordId + job)   │ │
│  └────────┬────────┘ └────────┬─────────┘ └─────────┬───────────┘ │
│           │                    │                    │             │
│  ┌────────▼────────────────────▼────────────────────▼───────────┐ │
│  │ _shared: validation.ts (sanitize, limits, allowlists)        │ │
│  │ Optional: cors.ts (EXTENDED_CORS_HEADERS, jsonResponse)       │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────┬─────────────────────────┬────────────────────────────┘
            │                           │
            ▼                           ▼
   LeadGen API (CLIENT_L5_*)         Attio API (ATTIO_API_KEY)
   POST /api/v1/anemia/analyze-audio-sync
```

## Data Flow

1. **Triage** — User fills form (name, contact, health focus, consent). Frontend calls `attio-create-lead`; optionally stores `recordId` in context for Phase 2.
2. **Capture** — User records audio in browser (FLAC/WAV/MP3 via libflac.js etc.).
3. **Analysis** — Frontend POSTs audio to Edge Function `analyze-audio` (or directly to local L5 when `VITE_LOCAL_MODE=true`); backend forwards to LeadGen API anemia endpoint; response (job_id, result) returned to client.
4. **Reveal** — Result shown in UI; context holds `visualizedResult`, `apiResult`.
5. **Attio update** — When analysis completes, frontend can call `attio-update-lead` with `recordId` (or contact) + job_id + result summary (see `docs/ATTIO_JOB_RESULT_INTEGRATION.md`).

## Key Paths

| Concern | Location |
|---------|----------|
| Routes | `src/App.tsx` |
| Assessment state | `src/context/AssessmentContext.tsx` |
| API client (analysis) | `src/lib/leadgen-api-client.ts` |
| Edge Functions | `supabase/functions/*/index.ts` |
| Shared validation | `supabase/functions/_shared/validation.ts` |
| Attio two-phase flow | `docs/ATTIO_JOB_RESULT_INTEGRATION.md` |

## Deployment

- **Frontend:** Static build (`vite build`); host on any static host or Supabase Storage.
- **Backend:** Supabase Edge Functions; env vars: `CLIENT_L5_API_URL`, `CLIENT_L5_CLIENT_ID`, `CLIENT_L5_API_KEY`, `ATTIO_API_KEY`.
- **Secrets:** API keys only in Supabase (env); client uses `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_PROJECT_ID`). For local dev, set `VITE_LOCAL_MODE=true` and `VITE_CLIENT_L5_*` so the client calls the L5 backend directly.

## Conventions

- **No app DB:** No Supabase tables/views in use; types in `src/integrations/supabase/types.ts` are placeholders.
- **Auth:** Anonymous/public; no Supabase Auth required for current flow.
- **CORS:** Handled in Edge Functions via shared CORS helper (see backend guidelines).
