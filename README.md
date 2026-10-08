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

1. **Document ingestion** — upload policy schedule, discharge summary, itemised bill (PDF text
   layer read locally with pdf.js, structured by Gemini), or explore three bundled synthetic
   case files with zero setup.
2. **Claim-readiness score (0–100)** — with explicit reasons, never just a number.
3. **Document checklist** vs the IRDAI-standard hospitalisation claim list — mandatory gaps
   flagged with *why each document exists*.
4. **Deduction traps** — room-rent sub-limit breach, proportional deduction on linked charges,
   co-pay, non-payable consumables, waiting-period breaches — each priced to the rupee and
   cited to the clause it stands on.
5. **Expected-settlement waterfall** — total billed → each deduction → expected payout.
6. **Rejection desk** — paste a repudiation letter; the desk classifies the ground
   (non-disclosure, waiting period, deficiency, delay, sub-limit, exclusion), judges whether
   it is reversible (e.g. the 5-year moratorium in IRDAI's 2024 regulations), and lists the
   counter-steps.
7. **Grievance letter** — drafted deterministically from the case record, with the regulation
   cited clause-by-clause and the escalation route (grievance cell → Bima Bharosa → Insurance
   Ombudsman).
8. **हिंदी सारांश** — every verdict closes with a plain Hindi summary, because the claim is
   usually managed by family, not policy nerds.

## Design principle: arithmetic, not opinion. Words, grounded.

Every rupee figure — the room-rent ratio, the proportional cut, the co-pay, the score — is
computed by a **deterministic TypeScript rules engine** (`src/engine/rules.ts`) from extracted
values. Gemini is used only for what language models are actually good at: turning documents
into structured facts. A model can read your documents; it is never allowed to invent your policy.

## Run it

```bash
npm install        # regenerates the lockfile (not committed — see below)
npm run dev        # http://localhost:3000
npm run build      # production build → dist/
```

Works out of the box in **demo mode** (three synthetic case files). To analyze your own
documents, open **Settings → API key** in the app and paste a Gemini API key
(Google AI Studio → “Get API key”). The key is stored only in your browser's localStorage.

## Production path on Google Cloud

The browser-direct Gemini call in `src/engine/gemini.ts` is the demo path. For production:

| Concern | Demo (this repo) | Production |
|---|---|---|
| Extraction | Gemini Developer API, browser-direct | **Vertex AI** (Gemini 2.5) behind **Cloud Run**, key in **Secret Manager** |
| Scanned PDFs | text-layer only | **Document AI** OCR pipeline |
| Storage | none (stateless) | **Cloud Storage** (docs) + **Firestore** (case records) |
| Rules engine | client-side TS | same code, server-side, versioned per regulation change |

## Repo layout

```
src/
  engine/
    types.ts       domain model (policy, episode, bill lines, case file)
    rules.ts       deterministic rules: score, missing docs, room-rent math,
                   waiting periods, payable waterfall, rejection classifier
    grievance.ts   grievance-letter drafter (template + cited clauses)
    hindi.ts       Hindi verdict summary (template-driven)
    gemini.ts      live extraction via Gemini (optional, user-supplied key)
    pdf.ts         client-side PDF text extraction (pdf.js)
    format.ts      ₹ Indian-format helpers
  data/samples.ts  three synthetic case files (fictional people/insurers)
  sections/        Landing + Workbench (three-column analysis desk)
  components/      ScoreStamp (rotating verdict stamp), design-kit primitives
```

## Notes

- `package-lock.json` is intentionally not committed in this prototype push; `npm install`
  regenerates it. Dependencies are pinned to caret ranges in `package.json`.
- All sample people, hospitals, insurers and policy numbers are **fictional**.
- This is an assistive analysis tool — **not insurance or legal advice**. The insurer's
  computation is final; the point is to know the number before they tell you.
