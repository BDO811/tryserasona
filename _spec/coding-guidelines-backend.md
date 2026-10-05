# Backend Coding Guidelines (Supabase Edge Functions)

## Runtime & Layout

- **Runtime:** Deno (Supabase Edge Functions).
- **Entry:** Each function = `supabase/functions/<name>/index.ts`; handler invoked via `serve()` or `Deno.serve()`.
- **Shared:** `supabase/functions/_shared/` — validation and (if present) CORS. No cross-function imports outside `_shared`.

## Conventions

- **CORS:** Handle OPTIONS and attach CORS headers to JSON responses. Use shared helper if available: `EXTENDED_CORS_HEADERS`, `jsonResponse(body, status, headers)`. If `_shared/cors.ts` is missing, implement equivalent (allow frontend origin, `Content-Type`, etc.).
- **Errors:** Return JSON only; no stack traces to client. Log details server-side. Use generic message for client (e.g. "Invalid request.", "Something went wrong.").
- **Status codes:** 200 success; 400 validation/body errors; 413 body too large; 500 server/configuration errors.

## Validation (use `_shared/validation.ts`)

- **Body size:** `readJsonWithLimit(req)` for JSON; enforce `MAX_JSON_BODY_BYTES` (64 KB). For multipart, check `content-length` and `MAX_AUDIO_FILE_BYTES` (15 MB).
- **Strings:** `sanitizeString(value, maxLen)`; use `MAX_STRING_LENGTH`, `MAX_EMAIL_LENGTH`, `MAX_PHONE_LENGTH`, `MAX_ID_LENGTH` as appropriate.
- **Allowlists:** `oneOf(value, ALLOWED_*)` for enums (health focus, contact method, biological sex, age range, pathway).
- **Types:** `isBoolean`, `isString`, `isNumber`, `isPlainObject` for guards; `sanitizeEmail`, `sanitizePhone` for contact data; `sanitizeFilename` for file names.
- **Audio:** `ALLOWED_AUDIO_MIME_TYPES` and size check before proxying to upstream.

Validate all user-supplied inputs; never trust `req.body` or query params without sanitization or allowlist.

## Environment

- **Secrets:** `Deno.env.get(...)` — no secrets in repo. Required: `CLIENT_L5_API_URL`, `CLIENT_L5_CLIENT_ID`, `CLIENT_L5_API_KEY` for analyze-audio; `ATTIO_API_KEY` for attio-*.
- **Missing env:** Log and return 500 with generic message.

## API Shape

- **analyze-audio:** POST multipart/form-data; `audio` file. Proxy to LeadGen API `POST /api/v1/anemia/analyze-audio-sync`; return upstream JSON with CORS.
- **attio-create-lead:** POST application/json; required: fullName, contactMethod, contactValue, healthFocus, consentGiven; optional: biologicalSex, ageRange. Validate then call Attio; return e.g. `{ success, recordId }`.
- **attio-update-lead:** POST application/json; identifier (recordId or contactMethod + contactValue); payload: job_id, result summary. Find record, PATCH or add note.

## Do / Don’t

- **Do:** Use validation helpers for every input; use shared CORS for browser calls.
- **Do:** Log enough for debugging (no PII in logs); keep responses minimal and consistent.
- **Don’t:** Forward raw request body or headers to upstream without validation/sanitization.
- **Don’t:** Return different JSON shapes for same endpoint; document any new fields in `_spec` or `docs/`.
