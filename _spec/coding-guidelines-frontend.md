# Frontend Coding Guidelines

## Stack

- **Runtime:** React 18, TypeScript 5
- **Build:** Vite 5, path alias `@/` → `src/`
- **Routing:** React Router 6 (BrowserRouter, Routes, Route)
- **Data:** TanStack Query (QueryClientProvider in App); assessment state in React Context (`AssessmentContext`)

## Structure

| Path | Purpose |
|------|---------|
| `src/pages/*` | Route-level components; minimal logic; compose components |
| `src/components/*` | Feature/components; `ui/` = shadcn primitives |
| `src/context/*` | React Context providers (assessment state) |
| `src/lib/*` | Pure utils, API client, mapping (no React) |
| `src/hooks/*` | Reusable hooks (e.g. use-mobile, use-toast) |
| `src/integrations/supabase/*` | Supabase client and generated types |

## Conventions

- **Imports:** Prefer `@/` alias. Order: React → third-party → internal (components, context, lib).
- **Components:** Function components only. Use named exports for pages/components; default for App/main.
- **Props:** Type with interfaces; use `ReactNode` for children where appropriate.
- **State:** Global assessment flow → `AssessmentContext`; local UI → `useState`/`useReducer`; server-like → TanStack Query when applicable.
- **Styling:** Tailwind + `cn()` (from `@/lib/utils`). Use design tokens from `index.css` / `ux-design-system.md`; avoid arbitrary values for colors/spacing when a token exists.

## Patterns

- **Forms:** react-hook-form + zod (via @hookform/resolvers) where validation is needed; otherwise controlled inputs.
- **API calls:** Use `leadgen-api-client.ts` for analysis; call Edge Functions via `fetch` to `VITE_SUPABASE_URL/functions/v1/<name>` with anon key in headers if required.
- **Errors:** Surface via toast (sonner) or inline; do not leave failed states silent.
- **Accessibility:** Semantic HTML; focus and ARIA per shadcn/Radix; keyboard navigation for flows (see ux-design-system).

## Testing

- **Framework:** Vitest + React Testing Library (see `src/test/setup.ts`).
- **Scope:** Unit for lib/utils; component tests for critical flows (triage, error states).
- **Paths:** `src/**/*.test.{ts,tsx}` or colocate in `__tests__`.

## Do / Don’t

- **Do:** Reuse `components/ui/*`; follow existing patterns in TriageFlow, AudioVisualizer, HealthProfile.
- **Do:** Keep pages thin; put logic in hooks or lib.
- **Don’t:** Add new global state without need; prefer context or URL state for flow.
- **Don’t:** Bypass `leadgen-api-client` for analysis (keeps env and edge URL in one place).
