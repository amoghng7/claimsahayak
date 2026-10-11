# ClaimSahayak — Claim Readiness Desk

> Built for the **Google Cloud AI Builder Cup 2026 (JAPAC)**.

ClaimSahayak reads an Indian health-insurance policy and hospital bill the way a claims
assessor would — then shows the deduction traps, the missing paperwork, and the letter to
write back. Before the rejection, not after.

Roughly 40% of Indian health-claim rejections trace to documentation gaps and procedural
lapses — the most reversible class of all. The most invisible deduction is the **room-rent
proportional cut**: pick a room above your sub-limit (typically 1% of sum insured per day)
and every charge contractually linked to room category — surgeon, anaesthesia, OT — is paid
in the same reduced ratio. On a ₹4.2 lakh surgery that single choice quietly removes ~₹75,000.

## What it does

1. **Document ingestion** — upload policy schedule, discharge summary, itemised bill (PDF
   text layer read locally with pdf.js; scanned or photographed documents go through
   Cloud Document AI OCR via the same-origin proxy), structured by Gemini — or explore
   three bundled synthetic case files with zero setup.
2. **Claim-readiness score (0–100)** — with explicit reasons, never just a number.
3. **Document checklist** vs the IRDAI-standard hospitalisation claim list — mandatory gaps
   flagged with *why each document exists*.
4. **Deduction traps** — room-rent sub-limit breach, proportional deduction on linked charges
   (ICU charges exempt, per IRDAI convention), named sub-limits (cataract caps, modern
   treatments), permanent exclusions keyword-matched to the diagnosis, PED waiting-period
   breaches against the 36-month IRDAI cap, co-pay, non-payable consumables — each priced to
   the rupee and cited to the clause it stands on.
5. **Expected-settlement waterfall** — total billed → each deduction (including every applied
   sub-limit cap as its own row) → expected payout.
6. **Editable bill lines** — extraction mistakes are correctable: edit amounts, toggle
   room-linked/non-payable, add or delete rows; the verdict, waterfall and Hindi summary
   recompute instantly through the same engine, and one click resets to the extracted values.
7. **Rejection desk** — paste a repudiation letter; the desk classifies the ground
   (non-disclosure, waiting period, deficiency, delay, sub-limit, exclusion), judges whether
   it is reversible (e.g. the 5-year moratorium in IRDAI's 2024 regulations), and lists the
   counter-steps. When the letter matches no known pattern, a Gemini fallback classifier
   (zod-validated, confidence-gated, clearly labelled "AI assistance") takes over — and a
   dated escalation ladder shows the GRO, Bima Bharosa and Ombudsman deadlines computed
   from the rejection date.
8. **Grievance letter** — drafted deterministically from the case record, with the regulation
   cited clause-by-clause, a 14-day reply deadline computed from the rejection date, and the
   escalation route (grievance cell → Bima Bharosa → Insurance Ombudsman). Filing-ready:
   "Print / Save as PDF" renders it as a clean A4 document.
9. **हिंदी सारांश** — every verdict closes with a plain Hindi summary, because the claim is
   usually managed by family, not policy nerds. The rejection desk gets its own experimental
   Hindi summary (सरल हिंदी सारांश — प्रायोगिक).

## Design principle: arithmetic, not opinion. Words, grounded.

Every rupee figure — the room-rent ratio, the proportional cut, the co-pay, the score — is
computed by a **deterministic TypeScript rules engine** (`src/engine/rules.ts`) from extracted
values. Gemini is used only for what language models are actually good at: turning documents
into structured facts. A model can read your documents; it is never allowed to invent your policy.

## Run it

```bash
npm install        # package-lock.json is committed; npm ci works too
npm run dev        # http://localhost:3000
npm run test       # vitest — rules engine, grievance letter, Hindi summary
npm run build      # strict typecheck + production build → dist/
```

Works out of the box in **demo mode** (three synthetic case files). To analyze your own
documents, the app calls Gemini through a same-origin server-side proxy by default: in the
deployed container, a small Node **sidecar** (`server/`) receives `POST
/api/gemini/generate` from nginx and calls **Vertex AI** with the Cloud Run service
account (Application Default Credentials) — no API key anywhere, access governed by IAM.
For local development the vite dev server runs the same proxy as middleware, in one of
two modes: set `GEMINI_SIDECAR_URL=http://localhost:8081` and run `npm run dev:server`
in a second shell (production-shaped; needs `gcloud auth application-default login`), or
set `GEMINI_API_KEY` in a local `.env` (see `.env.example`; with neither set the endpoint
answers HTTP 428 and the app asks you for a key). You can also open **Settings → API
key** and paste a Gemini API key (Google AI Studio → "Get API key") as a browser-direct
override; that key is stored only in your browser's localStorage. The proxy endpoint is
rate-limited to **20 requests/minute per client IP** (burst 10) with a 4 MB body cap,
and answers with JSON 429/502 errors.

Model note: the app extracts with `gemini-3.8-flash`. That model is not published in
Vertex's `asia-south1` location, so the sidecar calls Vertex's **global** endpoint
(same model, same response contract); the location and model are env-configurable
(`VERTEX_LOCATION`, `VERTEX_MODEL`).

## Verified against

Regulatory copy and engine constants are checked against, and cite:

- **IRDAI Master Circular on Health Insurance Business**, Ref. IRDAI/HLT/CIR/PRO/84/5/2024
  (29 May 2024) — 30-day free-look, 5-year moratorium, 36-month PED waiting cap.
- **Insurance Ombudsman Rules, 2017**, as amended by G.S.R. 828(E) (9 Nov 2023) — ₹50 lakh
  compensation ceiling, 30-day award compliance, escalation route.

## Roadmap

The `plan/` folder holds the phased implementation plan (current-state audit, per-phase
tasks with acceptance criteria, verified regulatory research notes) taking this repo from
prototype to submission-ready.

## Production path on Google Cloud

Deployed, the SPA is served by nginx on **Cloud Run**, with a Node sidecar in the same
container proxying Gemini calls to **Vertex AI** via Application Default Credentials —
no key material anywhere. Further hardening (Phase 06, `plan/06-production-backend.md`):

| Concern | This repo (post-6.1) | Next steps |
|---|---|---|
| Extraction | **Vertex AI** (Gemini) behind the Cloud Run sidecar, IAM-governed | per-request audit dashboards |
| Scanned PDFs | **Document AI** OCR via the sidecar's `/api/ocr` (6.2 done) | form-parser upgrade for bills |
| Edge protection | nginx rate limit + ₹1,000/mo budget alert (50/90/100%) + 5xx and Gemini-spike Monitoring alerts (6.3) | **Cloud Armor** WAF — deferred: needs an external LB + custom domain (~$18/mo) |
| Storage | consent-gated **Firestore** case history + **Cloud Storage** document archive (6.4 done, default off) | account-based sync |

## Repo layout

```
src/
  engine/
    types.ts       domain model (policy, episode, bill lines, case file)
    rules.ts       deterministic rules: score, missing docs, room-rent math,
                   waiting periods, payable waterfall, rejection classifier
    rejection.ts   Gemini fallback classifier (regex stays primary) + rejection-date parse
    grievance.ts   grievance-letter drafter + dated escalation ladder (template + cited clauses)
    hindi.ts       Hindi verdict summary (template-driven)
    gemini.ts      live extraction via Gemini (nginx proxy by default, BYOK override)
    schemas.ts     zod schemas + responseSchema constraining Gemini's output
    pdf.ts         client-side PDF text extraction (pdf.js)
    format.ts      ₹ Indian-format helpers
  data/samples.ts  three synthetic case files (fictional people/insurers)
  sections/        Landing + Workbench (three-column analysis desk)
  components/      ScoreStamp (rotating verdict stamp), design-kit primitives
server/
  index.js         sidecar: /generate → Vertex AI via ADC (no API key), /healthz
```

## Notes

- All sample people, hospitals, insurers and policy numbers are **fictional**.
- This is an assistive analysis tool — **not insurance or legal advice**. The insurer's
  computation is final; the point is to know the number before they tell you.
