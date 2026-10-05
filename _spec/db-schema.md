# Data Shapes & API Contracts

## Scope

This app does **not** use Supabase database tables. `src/integrations/supabase/types.ts` defines a placeholder `Database` type (empty Tables/Views/Functions/Enums). Data is carried in React state, request/response bodies, and external APIs (LeadGen, Attio).

This doc describes **request/response shapes** and **domain enums** used by the frontend and Edge Functions.

---

## Frontend → Edge Functions

### analyze-audio

- **Method:** POST
- **Content-Type:** multipart/form-data
- **Body:** `audio` (File); query `type`: `cognitive` | `wellness`
- **Response:** JSON — job detail (e.g. `job_id`, `status`, `result`). Shape matches LeadGen API sync response (see `leadgen-api-client.ts`: `JobDetailResponse` / `AnalyzeAudioSyncResponse`).

### attio-create-lead

- **Method:** POST
- **Content-Type:** application/json
- **Body:**
  - `fullName` (string, required)
  - `contactMethod` (required): `"email"` | `"sms"`
  - `contactValue` (string, required): email or phone
  - `healthFocus` (required): `"cognitive"` | `"longevity"` | `"mood"` | `"reproductive"`
  - `consentGiven` (boolean, required, must be true)
  - `biologicalSex` (optional): `"male"` | `"female"`
  - `ageRange` (optional): `"under30"` | `"30-45"` | `"46-60"` | `"60+"`
- **Response:** e.g. `{ success: boolean, recordId?: string }`

### attio-update-lead

- **Method:** POST
- **Content-Type:** application/json
- **Body:** Identifier (recordId or contactMethod + contactValue) + payload: `job_id`, result summary (e.g. likelihood_tier, classification, score, pathway). See `docs/ATTIO_JOB_RESULT_INTEGRATION.md`.

---

## LeadGen API Client (src/lib/leadgen-api-client.ts)

- **AnalyzeAudioSyncRequest:** `audioFile: Blob`; optional `format`, `extension`, `mimeType`.
- **AnalyzeAudioSyncResponse / JobDetailResponse:** `job_id`, `status`, `created_at?`, `result?`.
- **JobListResponse:** `jobs`, `page`, `total_pages?`.
- **CreditsResponse:** `credits`.

---

## Assessment Context (domain)

- **AssessmentPathway:** `"BRAIN_AGE"` | `"LONGEVITY"` | `"MENTAL_HEALTH"` | `"FERTILITY"` | null
- **UserProfile:** `biologicalSex?`, `ageRange?`, `fullName?`, `contactMethod?`, `contactValue?`, `consentGiven?`
- **AgeRange:** `"under30"` | `"30-45"` | `"46-60"` | `"60+"`
- **PathwayConfig:** id, title, color, colorHSL, metadata (labels for SIGNAL, CHANNEL, ANALYSIS, SAMPLE)

---

## Validation Allowlists (_shared/validation.ts)

- **ALLOWED_HEALTH_FOCUS:** cognitive, longevity, mood, reproductive
- **ALLOWED_BIOLOGICAL_SEX:** male, female
- **ALLOWED_AGE_RANGE:** under30, 30-45, 46-60, 60+
- **ALLOWED_CONTACT_METHOD:** email, sms
- **ALLOWED_PATHWAY:** BRAIN_AGE, LONGEVITY, MENTAL_HEALTH, FERTILITY

Length limits: `MAX_STRING_LENGTH` (500), `MAX_EMAIL_LENGTH` (254), `MAX_PHONE_LENGTH` (20), `MAX_ID_LENGTH` (128), `MAX_JSON_BODY_BYTES` (64 KB), `MAX_AUDIO_FILE_BYTES` (15 MB).

---

## Migration / Schema Notes

- **Supabase:** No migrations or tables in use. If adding tables later, define in Supabase and regenerate `src/integrations/supabase/types.ts`; then document tables and relationships here.
- **Attio:** Person/record shape is defined by Attio API; this doc only covers what the app sends (create/update payloads).
