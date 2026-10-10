# AGENTS.md — ClaimSahayak

Guidance for AI coding agents working in this repository. Everything below reflects the
actual state of the code — when this file and the README disagree, trust this file.

## Project overview

ClaimSahayak ("Claim Readiness Desk") is a **client-side-only React SPA** built for the
Google Cloud AI Builder Cup 2026 (JAPAC). It analyses Indian health-insurance claims:
given a policy schedule and hospital bill (or one of three bundled synthetic case files),
it computes a claim-readiness score, flags deduction traps (room-rent sub-limit,
proportional deduction, co-pay, non-payables, waiting-period breaches), estimates the
settlement waterfall, classifies pasted rejection letters, drafts a grievance letter, and
renders a Hindi summary.

**Core architectural principle: arithmetic, not opinion.** Every rupee figure is computed
by a deterministic TypeScript rules engine (`src/engine/rules.ts`). Gemini is used only to
turn uploaded documents into structured facts; it never computes money or scores. Keep it
that way — do not move judgement/math into LLM prompts.

There is **no backend in this repo** and no persisted state beyond `localStorage`. The app
is stateless: no accounts, no database, no server-side sessions.

## Technology stack

- React 19 + TypeScript 5.9 (strict), Vite 7, ES modules (`"type": "module"`)
- Tailwind CSS 3 + PostCSS + tailwindcss-animate; design tokens are CSS custom properties
  in `src/index.css` exposed through `tailwind.config.js` (brand tokens: `paper`, `ink`,
  `chart`, `mint`, `brick`, `crimson`, `line`)
- react-router 7 (`BrowserRouter` in `src/main.tsx`) — note: routing is effectively
  unused; navigation is view state in `src/App.tsx` (`'landing' | 'desk'`)
- pdfjs-dist 4 (client-side PDF text-layer extraction)
- Gemini Developer API (`gemini-2.5-flash`, JSON mode) via `fetch` — no SDK
- Declared in `package.json` but **not currently imported anywhere in `src/`**:
  `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`. Do not assume
  they are used; either use them deliberately or leave them alone.
- Path alias `@/*` → `./src/*` (configured in both `tsconfig*.json` and `vite.config.ts`)

## Build and run commands

```bash
npm install        # install deps
npm run dev        # dev server on http://localhost:3000 (port set in vite.config.ts)
npm run test       # vitest run — engine specs in src/engine/__tests__/
npm run lint       # eslint 9+ flat config (eslint.config.js)
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build locally
```

Notes:

- `package-lock.json` **is committed** — `npm ci` works.
- The verification gate is: `npm run test`, `npm run lint`, `npx tsc --noEmit -p
  tsconfig.app.json`, `npm run build` — all must pass. The deploy workflow
  (`.github/workflows/deploy.yml`) runs `npm ci`, tests and typecheck before the
  Docker build.
- `vite.config.ts` dynamically imports an optional plugin `kimi-plugin-inspect-react`
  inside try/catch — it is not on npm and is absent outside the original build sandbox.
  Keep the try/catch intact.

## Code organization

```
src/
  main.tsx            entry: StrictMode + BrowserRouter
  App.tsx             header, settings sheet (Gemini key), landing/desk view switch
  index.css           Tailwind layers + design tokens (CSS custom properties)
  engine/             all business logic — framework-free, importable anywhere
    types.ts          domain model: Policy, HospitalEpisode, BillLine, CaseFile
    rules.ts          deterministic engine: document checklist, room-rent math,
                      waiting periods, payable waterfall, score, rejection classifier
    grievance.ts      grievance-letter drafter (template + cited clauses)
    hindi.ts          Hindi verdict summary (template-driven)
    gemini.ts         Gemini extraction call (zod-validated, one retry) + API-key helpers
    schemas.ts        zod schemas + responseSchema constraining Gemini's output
    pdf.ts            pdf.js text-layer extraction
    format.ts         ₹ Indian-format / date helpers (en-IN locale)
    __tests__/        vitest specs for rules, grievance, hindi, gemini
  data/samples.ts     three synthetic case files (all people/insurers fictional)
  sections/           Landing.tsx, Workbench.tsx (three-column desk UI)
  components/         kit.tsx (Kicker, NumberedSection, PanelTitle), ScoreStamp.tsx
```

Module conventions:

- `engine/` is deliberately free of React imports — pure functions over `types.ts`
  interfaces. New business logic goes here, not in components.
- `sections/` hold full-screen views; `components/` hold small shared primitives.
- TypeScript is strict: `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax` (use `import type` for type-only imports),
  `erasableSyntaxOnly` (no enums or parameter properties — type-eraseable syntax only).

## Runtime data flow

1. Workbench starts from `SAMPLE_CASES` (demo mode, zero setup) or user-uploaded files.
2. Uploads: `pdf.ts` extracts text locally (text layer only — scanned PDFs yield nothing
   and the UI warns), text is truncated to 30,000 chars per file.
3. `gemini.ts` sends the text to Gemini 2.5 Flash with a fixed JSON-shape prompt
   (temperature 0, `responseMimeType: application/json` + a `responseSchema` from
   `schemas.ts`), validates the response with zod (`extractionSchema.safeParse`),
   retries once with the validation errors appended, and only then maps it to a
   `CaseFile`.
4. All analysis — score, flags, waterfall, rejection classification, grievance letter,
   Hindi summary — is recomputed deterministically in `rules.ts` / `grievance.ts` /
   `hindi.ts` via `useMemo` in `Workbench.tsx`.

Gemini key resolution (`loadGeminiKey`): localStorage key `claimsahayak.geminiKey`,
defaulting to the sentinel `'PROXY'`, which routes requests to the same-origin path
`/api/gemini/generate` (see Deployment). A user-entered key is sent browser-direct to
`generativelanguage.googleapis.com`. For local dev, `VITE_GEMINI_API_KEY` may be set in a
local `.env` (see `.env.example`) — never commit a real key; `.env*` is gitignored.

## Deployment

- `Dockerfile`: two-stage build — `node:20-alpine` runs `npm ci && npm run build`, then
  `nginx:1.27-alpine` serves `dist/`.
- `nginx.conf.template` (envsubst'd into the nginx config): SPA fallback, security
  headers + CSP, static-asset caching, and a POST-only reverse proxy at
  `/api/gemini/generate` → Gemini's `generateContent` endpoint with the key injected from
  the `GEMINI_API_KEY` env var. The nginx CSP is tight (`script-src 'self'`, Google Fonts
  only for style/font) — if you add external resources, update the CSP.
- CI/CD: `.github/workflows/deploy.yml` on push to `main` — Workload Identity Federation
  auth (no JSON keys), docker build/push to Artifact Registry (`asia-south1`), deploy to
  Cloud Run service `claimsahayak` (project `claim-sahayak`), with
  `GEMINI_API_KEY` bound from Secret Manager secret `gemini-api-key`.
- The README's "production path" table describes an aspirational Vertex AI / Cloud Run
  backend; what actually exists today is the nginx proxy above.

## Code style guidelines

- Match the existing idiom: function components, Tailwind utility classes referencing the
  brand tokens (`bg-paper`, `text-ink`, `font-mono` for labels/numbers), minimal inline
  styles only where Tailwind can't express it (e.g. `color-mix`, animation delays).
- Money is always INR and formatted with `formatINR` (`₹4,20,000` Indian grouping);
  dates via `formatDate`; durations via `daysBetween`/`yearsBetween` from `format.ts`.
- Regulatory citations (IRDAI PPHI/HPR 2024 etc.) live as string literals attached to the
  specific rule they justify in `rules.ts` — keep clauses next to the arithmetic.
- Comments are sparse and explain *why* (domain reasoning), not *what*. Follow suit.
- All sample data must remain fictional (fictional people, hospitals, insurers, policy
  numbers).

## Testing

The deterministic engine is covered by a vitest suite in `src/engine/__tests__/`
(`rules`, `grievance`, `hindi`, `gemini`), including the three bundled sample cases'
documented scores and payouts. Every engine change ships with assertions in the same
commit. The verification bar for any change:

1. `npm run test` and `npm run lint` pass.
2. `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` pass.
3. `npm run dev` → the three sample cases load, and the verdict/waterfall numbers change
   appropriately if you touched the engine.

## Security considerations

- Never commit API keys or `.env` files. The only secret in deployment is
  `GEMINI_API_KEY`, injected by Cloud Run from Secret Manager into nginx envsubst — it
  must never be baked into client code or the image.
- The browser-direct Gemini path with a user-supplied key is a deliberate demo tradeoff;
  the key stays in the user's localStorage.
- Keep the nginx CSP/security headers in `nginx.conf.template` intact; expand
  `connect-src`/`script-src` only with a specific reason.
- The app is an assistive analysis tool, not insurance/legal advice — preserve the
  disclaimers in the UI.
