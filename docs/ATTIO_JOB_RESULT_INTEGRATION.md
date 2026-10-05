# Attio CRM: Job ID and Analysis Result Integration

## Summary

Today the contact form creates a lead in Attio **before** the user records or gets analysis results. Job id and analysis result only exist **after** the voice assessment completes. This doc recommends a **two-phase** integration: keep creating the lead on form submit, then **update** that Attio record with job id and result when analysis completes.

---

## Current flow (relevant parts)

1. **Triage Step 4** → User submits contact form (name, email/phone, consent) → `TriageFlow.handleSubmit` invokes `attio-create-lead` (fire-and-forget) → user proceeds to Attract.
2. **Attract → Capture** → User records voice.
3. **Analysis** → `AudioVisualizer.processAudioAnalysis` gets job detail (includes `job_id`, `result`) → sets `apiResult` (raw result) and `visualizedResult` (includes `jobId`, `likelihoodTier`, `classification`, `score`, etc.) in context → user proceeds to Reveal.

So **job id and result are only available after analysis**, in `AudioVisualizer` and then in context as `visualizedResult` and `apiResult`.

---

## Options considered

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A. Deferred sync** | Don’t create in Attio on form submit; create/update only when analysis completes, with job id + result. | Single Attio call with full data. | Lead is not in CRM if user drops off before analysis; semantics change (no lead until analysis). |
| **B. Two-phase (recommended)** | Keep creating lead on form submit; when analysis completes, **update** the same Attio record with job id and result. | Lead exists as soon as form is submitted; job/result added when available. | Requires identifying the same record (by `record_id` or contact) for the update. |

**Recommendation: Option B (two-phase).**

---

## Recommended approach: two-phase

### Phase 1 – Create lead (existing, small change)

- **When:** Contact form submit in `TriageFlow`.
- **What:** Unchanged: create person in Attio with name, email/phone, description (assessment metadata).
- **Change:** Edge Function returns `{ success: true, recordId: "..." }`. Frontend **captures** `recordId` and stores it in AssessmentContext (e.g. `attioRecordId`) so we can use it in Phase 2. If the invoke is kept fire-and-forget for UX, we can still store `recordId` when the promise resolves without blocking navigation.

### Phase 2 – Update lead with job id and result (new)

- **When:** As soon as analysis completes and we have `job_id` and a result summary (e.g. in `AudioVisualizer` right after `setVisualizedResult` and `setApiStatus("done")`, or from a small effect in a component that has access to context).
- **What:** Call a new Supabase Edge Function (e.g. `attio-update-lead`) with:
  - **Identifier:** `attioRecordId` if available, **or** `contactMethod` + `contactValue` (so the function can find the person by email/phone via Attio query).
  - **Payload:** `job_id`, and a **result summary** (see below).
- **Backend:** Edge Function finds the person (by `record_id` or by querying Attio by email/phone), then:
  - **PATCH** the person record to add/update attributes or description with job id and result summary, **and/or**
  - **POST** a new **note** on that record with “Analysis complete: job_id, likelihood_tier, classification, score, pathway” (and optionally a link to your job detail URL if you have one).

Result summary for Attio (suggested shape, keep small for notes/attributes):

- `job_id` (string)
- `likelihood_tier` (e.g. from raw result or `visualizedResult`)
- `classification` (e.g. OPTIMAL / STABLE / ELEVATED from `visualizedResult`)
- `score` (0–100 from `visualizedResult`)
- `pathway` (e.g. BRAIN_AGE)
- Optionally: `created_at` (job completion time)

You can store this as a note (human-readable) and, if Attio supports custom attributes, also set attributes for filtering/reporting (e.g. “Voice assessment job id”, “Voice assessment result tier”).

---

## Data availability

- **After form submit:** `userProfile` (name, contactMethod, contactValue, healthFocus, biologicalSex, ageRange, consentGiven). No job id or result yet.
- **After analysis:** In context: `visualizedResult` (includes `jobId`, `likelihoodTier`, `classification`, `score`, `pathway`, etc.) and `apiResult` (raw result). So we have:
  - **job_id:** `visualizedResult.jobId`
  - **Result summary:** from `visualizedResult` (+ optional bits from `apiResult`).

Note: `apiResult` in context is currently only `jobDetail.result` (no top-level `job_id`). The full job id is on `visualizedResult.jobId`.

---

## Implementation plan

### 1. Context

- Add `attioRecordId: string | null` and `setAttioRecordId(id: string | null) => void` to AssessmentContext.
- In `reset()`, clear `attioRecordId`.

### 2. Phase 1 – Create lead (frontend)

- In `TriageFlow.handleSubmit`, when invoking `attio-create-lead`, use the returned body (e.g. `const { data } = await supabaseClient.functions.invoke('attio-create-lead', { body: {...} });`). If `data?.recordId` exists, call `setAttioRecordId(data.recordId)`. You can still call `onComplete(finalData)` without awaiting the invoke if you want to avoid blocking; in that case run the invoke in the background and call `setAttioRecordId` when it resolves.

### 3. Phase 1 – Create lead (Edge Function)

- Ensure `attio-create-lead` returns `recordId` in the JSON response (it already does). No change needed unless you want to explicitly document it.

### 4. Phase 2 – New Edge Function: `attio-update-lead`

- **Input (body):**
  - `attioRecordId?: string` (preferred)
  - **Or** `contactMethod: 'email' | 'sms'` and `contactValue: string` (for lookup).
  - `jobId: string`
  - `resultSummary: { likelihoodTier?: string; classification?: string; score?: number; pathway?: string; createdAt?: string }` (and any other fields you want in CRM).
- **Logic:**
  - If `attioRecordId`, use it.
  - Else, call Attio “query person records” (e.g. filter by email or phone), take first match, get `record_id`.
  - PATCH `https://api.attio.com/v2/objects/people/records/{record_id}` with values that include job id and result (e.g. description append or custom attributes if configured).
  - POST a note on the same record with title like “Voice assessment result” and body containing job_id, likelihood_tier, classification, score, pathway, and optional link to job URL.
- **Response:** `{ success: true }` or error. CORS and error handling same as `attio-create-lead`.

### 5. Phase 2 – Frontend: call update when analysis completes

- **Option A (recommended):** In `AudioVisualizer`, inside `processAudioAnalysis`, right after `setVisualizedResult(visualized)` and `setApiStatus("done")`, call a small helper (e.g. `syncAnalysisResultToAttio`) that:
  - Reads from context: `userProfile` (contactMethod, contactValue), `attioRecordId`, and the newly set `visualizedResult` (pass it as an argument to avoid stale state).
  - If Supabase is configured and we have either `attioRecordId` or (contactMethod + contactValue), invoke `attio-update-lead` with `attioRecordId` (if present), `contactMethod`, `contactValue`, `jobId: visualizedResult.jobId`, and `resultSummary` derived from `visualizedResult`. Fire-and-forget so it doesn’t block the UI.
- **Option B:** In `Index` (or a wrapper), add a `useEffect` that runs when `visualizedResult` and `apiStatus === 'done'` first become set, and call the same `syncAnalysisResultToAttio` logic once (e.g. with a ref to avoid double-send). This keeps Attio logic out of `AudioVisualizer` but requires careful one-time trigger.

### 6. Result summary shape

- From `visualizedResult`: `jobId`, `likelihoodTier`, `classification`, `score`, `pathway`, `createdAt`.
- Pass these into `attio-update-lead` as `jobId` and `resultSummary` so the Edge Function can write them to the Attio record and note.

### 7. Edge cases

- **User never completes analysis:** Lead stays in Attio without job id/result (acceptable).
- **Create lead failed (e.g. no API key):** `attioRecordId` won’t be set; update can still try lookup by contact if you pass contactMethod + contactValue from context.
- **Update fails (e.g. person not found):** Log and optionally retry; don’t block or alert the user.
- **Developer bypass / no contact:** If contact form was bypassed, contactValue may be empty; skip Attio update when there’s no identifier (no record_id and no contact).

---

## File-level checklist

| Area | File(s) | Change |
|------|---------|--------|
| Context | `src/context/AssessmentContext.tsx` | Add `attioRecordId`, `setAttioRecordId`; clear in `reset`. |
| Phase 1 frontend | `src/components/TriageFlow.tsx` | Capture `recordId` from `attio-create-lead` response and call `setAttioRecordId`. |
| Phase 2 frontend | `src/components/AudioVisualizer.tsx` (or Index + effect) | After analysis success, invoke `attio-update-lead` with job id + result summary (and record id or contact). |
| Phase 2 backend | `supabase/functions/attio-update-lead/index.ts` (new) | Implement lookup by record_id or contact, then PATCH person and POST note with job_id and result. |
| Shared types | Optional: `src/lib/attio-types.ts` or in Edge Function | Define `ResultSummary` and request body type for `attio-update-lead`. |

---

## Attio API reference (for implementation)

- **Create person (existing):** `POST https://api.attio.com/v2/objects/people/records`
- **Query people (for lookup):** `POST https://api.attio.com/v2/objects/people/records/query` with filter (e.g. by email).
- **Update person:** `PATCH https://api.attio.com/v2/objects/people/records/{record_id}` with `data.values` (and/or custom attributes).
- **Create note:** `POST https://api.attio.com/v2/notes` with `parent_object: 'people'`, `parent_record_id`, `title`, `content_plaintext`.

Use the same `ATTIO_API_KEY` and CORS pattern as `attio-create-lead`.
