# AGENTS.md — ClaimSahayak

Guidance for AI coding agents working in this repository. Everything below reflects the
actual state of the code — when this file and the README disagree, trust this file.

## Project overview

ClaimSahayak ("Claim Readiness Desk") is a **React SPA with a minimal same-origin
sidecar** built for the Google Cloud AI Builder Cup 2026 (JAPAC). It analyses Indian
health-insurance claims:
given a policy schedule and hospital bill (or one of three bundled synthetic case files),
it computes a claim-readiness score, flags deduction traps (room-rent sub-limit,
proportional deduction, co-pay, non-payables, waiting-period breaches), estimates the
settlement waterfall, classifies pasted rejection letters, drafts a grievance letter, and
renders a Hindi summary.

**Core architectural principle: arithmetic, not opinion.** Every rupee figure is computed
by a deterministic TypeScript rules engine (`src/engine/rules.ts`). Gemini is used only to
turn uploaded documents into structured facts; it never computes money or scores. Keep it
that way — do not move judgement/math into LLM prompts.

Persistence is **opt-in and off by default** (Settings → "Save my cases on the
server"): with consent off, nothing leaves the browser and the anonymous session id is
never created — the app is exactly as stateless as the demo. With consent on, case
history lives in Firestore under `sessions/{uuid}/cases` (client-generated UUID in
localStorage, sent as `X-Session-Id`; no accounts) and uploaded documents go to a GCS
bucket with a 30-day auto-delete lifecycle rule. The only other server component is the
Node **sidecar** (`server/`) inside the nginx container: it terminates the same-origin
`/api/*` routes and calls Google Cloud APIs (Vertex AI, Document AI, Firestore, GCS)
with the Cloud Run service account (ADC) — no API key material anywhere.

## Technology stack

- React 19 + TypeScript 5.9 (strict), Vite 7, ES modules (`"type": "module"`)
- Tailwind CSS 3 + PostCSS + tailwindcss-animate; design tokens are CSS custom properties
  in `src/index.css` exposed through `tailwind.config.js` (brand tokens: `paper`, `ink`,
  `chart`, `mint`, `brick`, `crimson`, `line`)
- react-router 7 (`BrowserRouter` in `src/main.tsx`) — note: routing is effectively
  unused; navigation is view state in `src/App.tsx` (`'landing' | 'desk'`)
- pdfjs-dist 4 (client-side PDF text-layer extraction)
- Gemini (`gemini-3.8-flash`, JSON mode) via `fetch` — no SDK. In deployment the call
  goes same-origin to the sidecar → **Vertex AI** (`global` endpoint — 3.8-flash is not
  published in `asia-south1`); the BYOK override calls the Developer API browser-direct.
- Sidecar (`server/`): Node 20 ESM, `google-auth-library` only, `node --test` specs in
  `server/index.test.js`; started by `docker-entrypoint.d/40-sidecar.sh` inside the
  nginx container, bound to 127.0.0.1:8081.
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
    rejection.ts      Gemini fallback rejection classifier (regex stays primary,
                      zod-validated, confidence-gated) + rejection-date parsing
    grievance.ts      grievance-letter drafter + dated escalation ladder (template + cited clauses)
    hindi.ts          Hindi verdict + rejection summaries (template-driven)
    gemini.ts         Gemini extraction call (zod-validated, one retry) + API-key helpers
    schemas.ts        zod schemas + responseSchema constraining Gemini's output
    pdf.ts            pdf.js text-layer extraction
    ocr.ts            OCR fallback: empty text layer / images → /api/ocr (Document AI)
    store.ts          consent-gated case store (Firestore/GCS via /api/cases,
                      /api/uploads; anonymous session id created only after opt-in)
    format.ts         ₹ Indian-format / date helpers (en-IN locale)
    __tests__/        vitest specs for rules, rejection, grievance, hindi, gemini,
                      ocr, store
  data/samples.ts     three synthetic case files (all people/insurers fictional)
  sections/           Landing.tsx, Workbench.tsx (three-column desk UI)
  components/         kit.tsx (Kicker, NumberedSection, PanelTitle), ScoreStamp.tsx
server/
  index.js            sidecar routes: POST /generate → Vertex AI (ADC),
                      POST /ocr → Document AI :process (ADC),
                      /api/cases + /api/uploads → Firestore/GCS (ADC, session-gated),
                      GET /healthz
  index.test.js       node --test specs (handler is dependency-injected: token + fetch)
docker-entrypoint.d/  40-sidecar.sh starts the sidecar before nginx (official entrypoint)
infra/                gcloud scripts per Phase 06 step (06-1-vertex.sh, …)
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
2. Uploads: `pdf.ts` extracts text locally; when the text layer is empty (scanned/
   photographed bill) or the file is an image, `ocr.ts` sends it through same-origin
   `/api/ocr` → sidecar → **Cloud Document AI** OCR (`us` multi-region processor —
   Document AI has no `asia-south1` location), and the OCR text feeds the same
   extraction schema. Text is truncated to 30,000 chars per file.
3. `gemini.ts` sends the text to Gemini `gemini-3.8-flash` with a fixed JSON-shape prompt
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
`generativelanguage.googleapis.com`. For local dev, the vite dev server runs the same
proxy as middleware (`configureServer` in `vite.config.ts`) in two modes:
`GEMINI_SIDECAR_URL` set → forward to a locally running sidecar (`npm run dev:server`,
needs `gcloud auth application-default login`); otherwise keyed by `GEMINI_API_KEY` in a
local `.env` (see `.env.example`). With neither set the middleware answers HTTP 428
`{"error":"no_dev_key"}` and the app shows a friendly prompt. Never commit a real key;
`.env*` is gitignored.

## Deployment

- `Dockerfile`: two-stage build — `node:20-alpine` runs `npm ci && npm run build`, then
  `nginx:1.27-alpine` + `apk nodejs` serves `dist/` and runs the sidecar (`server/`)
  via `/docker-entrypoint.d/40-sidecar.sh`.
- `nginx.conf.template` (envsubst'd into the nginx config): SPA fallback, security
  headers + CSP, static-asset caching, and a POST-only reverse proxy at
  `/api/gemini/generate` → the sidecar on `127.0.0.1:8081`, which calls Vertex AI's
  `generateContent` with an ADC access token (model/location from `VERTEX_MODEL` /
  `VERTEX_LOCATION`, project from `VERTEX_PROJECT`). The proxy is rate-limited
  (20 req/min per IP, burst 10, 4 MB body cap, JSON 429/502). The nginx CSP is tight
  (`script-src 'self'`, Google Fonts for style/font, `connect-src 'self'` plus
  `generativelanguage.googleapis.com` for the BYOK override) — if you add external
  resources, update the CSP.
- CI/CD: `.github/workflows/deploy.yml` on push to `main` — Workload Identity Federation
  auth (no JSON keys), docker build/push to Artifact Registry (`asia-south1`), deploy to
  Cloud Run service `claimsahayak` (project `claim-sahayak`) with `VERTEX_*` env vars.
  The runtime service account holds `roles/aiplatform.user` (see `infra/06-1-vertex.sh`).
  Phase 06 step 6.1 retired the `GEMINI_API_KEY` Secret Manager binding; access is
  IAM-governed with per-request audit in Cloud Logging.
- Ops guardrails (6.3): ₹1,000/month budget alert at 50/90/100% (`infra/06-3-budgets.sh`),
  Monitoring alerts for Cloud Run 5xx and Gemini-call spikes (`infra/06-3-alerts.sh`,
  log-based metric `gemini_proxy_calls`, email channel). Cloud Armor is deliberately
  deferred — it requires an external HTTPS load balancer + custom domain (~$18/month);
  the nginx `limit_req` rate limit remains the edge control.

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
(`rules`, `rejection`, `grievance`, `hindi`, `gemini`), including the three bundled sample cases'
documented scores and payouts. Every engine change ships with assertions in the same
commit. The verification bar for any change:

1. `npm run test` and `npm run lint` pass.
2. `npx tsc --noEmit -p tsconfig.app.json` and `npm run build` pass.
3. `npm run dev` → the three sample cases load, and the verdict/waterfall numbers change
   appropriately if you touched the engine.

## Security considerations

- Never commit API keys or `.env` files. Production Google Cloud access uses the Cloud
  Run service account (ADC) — there is no deployed API key to leak or rotate. A local
  `GEMINI_API_KEY` is dev-only (gitignored `.env`).
- The browser-direct Gemini path with a user-supplied key is a deliberate demo tradeoff;
  the key stays in the user's localStorage.
- Server persistence is consent-gated (Settings toggle, default off). Do not weaken
  this: no server writes without `caseStore.loadConsent() === true`, and the session id
  must never be created for an opted-out user. Uploaded documents auto-delete after
  30 days (bucket lifecycle) — keep that rule intact.
- The sidecar binds 127.0.0.1 only; the only public surface is nginx. Keep it that way —
  new `/api/*` routes go through the nginx proxy block with method restrictions.
- Keep the nginx CSP/security headers in `nginx.conf.template` intact; expand
  `connect-src`/`script-src` only with a specific reason.
- The app is an assistive analysis tool, not insurance/legal advice — preserve the
  disclaimers in the UI.
