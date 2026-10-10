# Phase 00 — Current State Audit

Snapshot of the repository as of 11 Oct 2026 (HEAD on `main`, after the Docker /
nginx / Cloud Run CI commits). Read this before executing any phase.

## Architecture as it stands

```
Browser (React 19 + Vite SPA, static files)
   │  /api/gemini/generate  (POST)
   ▼
nginx (Cloud Run container, port 8080)
   │  proxy_pass → generativelanguage.googleapis.com/v1beta/models/
   │               gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}
   ▼
Gemini Developer API   (key injected server-side from Secret Manager)

Client-side engines (no server involved):
   pdf.ts      → pdfjs-dist text-layer extraction from uploaded PDFs
   gemini.ts   → document text → structured JSON extraction (or PROXY)
   rules.ts    → deterministic verdict: docs checklist, room-rent trap,
                 waiting periods, co-pay, non-payables, score, estimate
   grievance.ts→ template-assembled grievance letter with cited clauses
   hindi.ts    → template Hindi summary of the verdict
```

Deployment: GitHub Actions (`.github/workflows/deploy.yml`) → Workload Identity
Federation → Artifact Registry (`asia-south1-docker.pkg.dev/claim-sahayak/
claimsahayak`) → Cloud Run `claimsahayak` (asia-south1, 256Mi/1CPU, 0–3
instances, `--set-secrets GEMINI_API_KEY=gemini-api-key:latest`).

## Verified working (do not regress)

- Full claim-readiness flow on three fictional sample cases:
  - Ramesh Iyer — room-rent trap: ₹8,000/night actual vs ₹5,000 allowed (1% of
    ₹5L SI), ratio 0.625, proportional deduction on room-linked lines, score 53
    (fair), expected payout ₹3,34,750.
  - Meera Kulkarni — clean case, score 96 (strong), expected ₹1,80,500.
  - Arvind Rao — rejected claim (PED non-disclosure reason vs unrelated femur
    fracture), 7.7-year policy > 5-year moratorium → reversible verdict, 20%
    co-pay ₹70,400, expected ₹2,81,600.
- Rules engine verified with 14 assertions (room-rent ratio math, waterfall,
  waiting period, score bands, rejection patterns) — the assertions currently
  live in a local-only `verifier/` folder, **not in the repo** (see AUD-08).
- Production build + Docker image build + Cloud Run deploy pipeline.
- nginx proxy path (`loadGeminiKey()` returns `'PROXY'` by default;
  `gemini.ts` POSTs to `/api/gemini/generate`).

## Issue register

| ID | Severity | Area | Issue |
|----|----------|------|-------|
| AUD-01 | high | tooling | `npm run lint` is broken: script exists but eslint + `eslint.config.js` were removed in the dependency slimming |
| AUD-02 | high | compliance | Regulatory copy is stale: free-look period stated as 15 days (now **30**, Master Circular 29 May 2024); insurer grievance TAT stated as 15 days (now **14**, PPI Master Circular 2024); Ombudsman block missing the ₹50L cap (G.S.R. 828(E), 9 Nov 2023), the 30-day compliance window and the ₹5,000/day penalty |
| AUD-03 | medium | docs | README stale: claims `package-lock.json` is not committed (it now is); describes browser-direct Gemini as "the demo path" (proxy is now the default) |
| AUD-04 | high | dev UX | No vite dev proxy: with the new `'PROXY'` default, `npm run dev` POSTs to `/api/gemini/generate`, which the dev server answers with the SPA fallback HTML → confusing JSON parse error on every upload |
| AUD-05 | high | prod bug | nginx CSP is `connect-src 'self'` → the BYOK override path (user's own key, browser → Google direct) is blocked in production |
| AUD-06 | medium | UX | Header key indicator is misleading (`Key set` when value is the literal string `'PROXY'`); SettingsSheet pre-fills the input with the literal `PROXY`, so a user who opens and saves settings stores the string "PROXY" as their key |
| AUD-07 | high | security | The nginx proxy endpoint is an open relay to a paid API: no rate limiting, no request size cap, no abuse protection beyond it being POST-only |
| AUD-08 | high | quality | No tests in the repo (verifier is local-only); deploy.yml builds the Docker image without running any test or typecheck gate |
| AUD-09 | high | robustness | Gemini output is trusted blind: no zod validation, no `responseSchema` in the request; malformed output surfaces as an opaque failure |
| AUD-10 | medium | feature | Rejection classification is regex-only; unmatched letters fall into the `unknown` bucket with generic guidance |
| AUD-11 | medium | feature | `Policy.exclusions` is extracted from the policy PDF but never shown or used |
| AUD-12 | medium | engine | PED waiting period: diagnosed conditions are not matched against the policy's PED list / 36-month waiting cap; only the 30-day initial wait is scored |
| AUD-13 | medium | engine | Sub-limits beyond room rent are not modelled (cataract per-eye caps, joint replacement, modern-treatment % caps); ICU nuance missing — ICU charges must be exempt from the room-rent proportional deduction |
| AUD-14 | medium | UX | No way to correct extraction mistakes: bill line items are read-only after Gemini parses them |
| AUD-15 | medium | UX | Layout designed desktop-first; mobile (360px) and tablet states unverified |
| AUD-16 | low | feature | Hindi summary covers the claim verdict only, not rejection outcomes |
| AUD-17 | medium | UX | Grievance letter can only be copied — no print / save-as-PDF path, which is how such letters are actually filed |
| AUD-18 | low | roadmap | No persistence, no OCR for scanned PDFs (text-layer extraction returns empty on scans), no monitoring/cost guardrails — acceptable for the demo, planned in Phase 06 |

## Issue → phase mapping

- Phase 01: AUD-01, AUD-02, AUD-03, AUD-08, AUD-09
- Phase 02: AUD-04, AUD-05, AUD-06, AUD-07
- Phase 03: AUD-11, AUD-12, AUD-13, AUD-14
- Phase 04: AUD-10, AUD-16, AUD-17
- Phase 05: AUD-15 (+ accessibility)
- Phase 06: AUD-18
- Phase 07: submission assets (no audit items)
