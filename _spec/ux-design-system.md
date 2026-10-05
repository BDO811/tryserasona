# UX & Design System

## Brand

- **Primary (electric cyan):** `#00F0FF` / HSL `183 100% 50%` — primary actions, links, focus ring, accent.
- **Background:** Deep black; surfaces use “smoked glass” (dark grays with low opacity where used).
- **Voice:** Luxury / premium; clarity over decoration.

## Tokens (CSS variables in `src/index.css`)

- **Core:** `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--card`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`.
- **Custom:** `--cyan-glow` (same as primary), `--glass-bg`, `--glass-border`.
- **Sidebar:** `--sidebar-*` for sidebar-specific surfaces and text.

Use `hsl(var(--primary))` etc. in Tailwind; theme uses `darkMode: ["class"]`.

## Typography

- **Sans:** Inter (UI, body).
- **Serif:** Cormorant Garamond (headings, premium feel).
- **Mono:** JetBrains Mono (data, code).

Defined in `index.css` (Google Fonts) and `tailwind.config.ts` (fontFamily).

## Components

- **Base:** shadcn/ui (Radix) in `src/components/ui/` — Button, Card, Dialog, Input, Select, Tabs, etc.
- **Variants:** Prefer `variant` and `size` props; extend via `cn()` and Tailwind when needed.
- **Motion:** Framer Motion for orchestrated animations (e.g. AnalysisAnimation, ParticleOrb); keep duration and easing consistent.

## Pathways & Status

- **Pathways:** BRAIN_AGE, LONGEVITY, MENTAL_HEALTH, FERTILITY — config in `AssessmentContext` (`PATHWAY_CONFIGS`); shared brand color; metadata labels (e.g. SIGNAL, CHANNEL) for status.
- **Data status colors:** Green / Amber / Red for success / warning / error (define in components or tokens as needed; do not use primary for error).

## Accessibility

- **Target:** WCAG 2.1 AA where applicable.
- **Focus:** Visible focus ring (`--ring`); never remove outline without replacement.
- **Forms:** Labels, error messages, and required state announced; use Radix/shadcn patterns.
- **Keyboard:** All flows (triage, recording, reveal) navigable and submittable via keyboard.

## Responsive

- **Approach:** Mobile-first; breakpoints via Tailwind (`sm`, `md`, `lg`, `2xl`).
- **Container:** `container` class with center and padding; `2xl` at 1400px.

## Do / Don’t

- **Do:** Use design tokens for color and radius; use pathway config for pathway-specific UI.
- **Do:** Prefer existing ui components; extend with Tailwind and `cn()`.
- **Don’t:** Introduce new primary/accent colors outside the design system.
- **Don’t:** Use low-contrast text on primary (primary-foreground is black on cyan).
