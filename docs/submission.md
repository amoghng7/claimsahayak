# ClaimSahayak — Submission write-up

**Google Cloud AI Builder Cup 2026 (JAPAC) · Theme: BFSI**

- Live prototype: <https://claimsahayak-tvghig4oya-el.a.run.app> — the landing page is
  open; opening the desk (including the three sample cases) asks you to sign in with
  Google or an email/password account
- Repository: <https://github.com/amoghng7/claimsahayak>
- Architecture: [docs/architecture.md](architecture.md) ([PNG](architecture.png) / [SVG](architecture.svg))

## The problem — and who it hurts

Roughly 1 in 5 Indian health-insurance claims is rejected or cut, and the most
reversible class — documentation gaps, procedural lapses, room-rent arithmetic — is
the one families discover last. A first-claim family chooses a slightly better room,
and because of a 1%-of-sum-insured sub-limit they never read, every charge
contractually linked to room category (surgeon, anaesthesia, OT) is paid in the same
reduced ratio. On a ₹4.35 lakh surgery that one choice quietly removes ~₹75,000
(₹12,000 of excess room rent plus a ₹63,750 proportional cut). When
a claim *is* rejected, the letter is written in regulatory language nobody at home can
parse — and the deadlines to fight it (14 days to the grievance cell, 12 months to the
Ombudsman, the 5-year moratorium on non-disclosure rejections) start ticking
immediately.

## The solution in three sentences

1. **Document readiness** — ClaimSahayak reads the policy schedule and hospital bill
   (digital PDFs locally, scanned or photographed ones through Cloud Document AI OCR),
   checks the document set against the IRDAI-standard claim list, and prices every
   deduction trap (room-rent proportional cut, named sub-limits, PED waiting periods,
   co-pay, non-payables, permanent exclusions) to the rupee, before the claim is filed.
2. **Arithmetic of the payable estimate** — a claim-readiness score and an
   expected-settlement waterfall show total billed → each deduction, cited to its
   clause → expected payout, so the family sees exactly where the money leaks.
3. **Rejection reversal path** — paste a repudiation letter and the desk classifies
   the ground, judges whether it is reversible (e.g. the IRDAI 5-year moratorium), and
   drafts a filing-ready grievance letter with a dated escalation ladder: insurer GRO →
   Bima Bharosa → Insurance Ombudsman.

## Responsible AI / reliability

The system is deliberately built so the language model can never invent a number.

- **The LLM only reads.** Gemini (`gemini-3.8-flash` on **Vertex AI**, temperature 0,
  enforced JSON schema) turns document text into structured facts. Its output is
  validated with zod and retried once with validation errors appended; malformed output
  is rejected at the API level (`responseSchema`), not parsed loosely.
- **All money math is deterministic and unit-tested.** Score, room-rent ratio,
  proportional deduction, sub-limit caps, PED cuts, co-pay and the settlement
  waterfall are computed by a framework-free TypeScript rules engine
  (`src/engine/rules.ts`). The CI run on the current `main` commit reports 132 vitest
  specs passing across 8 files (engine, rejection, grievance, Hindi, extraction, OCR,
  case store, auth-error mapping), plus 26 `node --test` specs for the server sidecar.
  They include the three bundled case files' documented scores and payouts (e.g. the
  room-rent-trap case: score 53, expected payout ₹3,49,750 on a ₹4,35,000 bill).
- **Citations are verified, not hallucinated.** Every regulatory claim in the UI
  (IRDAI PPHI/HPR 2024, the 36-month PED cap, the 5-year moratorium, Bima Bharosa
  timelines) was re-verified against the source instrument and is recorded with links
  in `plan/research-notes.md`; the clause sits next to the arithmetic it justifies.
- **Fallbacks are honest.** When the regex rejection classifier can't place a letter,
  a Gemini fallback classifier takes over — zod-validated, confidence-gated, and
  visibly labelled "AI assistance" in the UI. Extraction mistakes are correctable:
  every bill line is editable and the whole verdict recomputes through the same
  engine.
- **No key to leak.** In production the model is called by a Node sidecar using the
  Cloud Run service account (Application Default Credentials). There is no API key in
  the client, the image or the container, and access is governed by IAM and audited in
  Cloud Logging.

## Google Cloud usage

| Service | Role |
|---|---|
| **Cloud Run** (asia-south1) | One container, two processes: nginx serves the SPA with security headers/CSP and same-origin, method-restricted `/api/*` routes (rate-limited to 20 req/min per IP); a Node sidecar on 127.0.0.1 calls the Google Cloud APIs below |
| **Vertex AI — Gemini** (`gemini-3.8-flash`, global endpoint) | Document extraction and the gated rejection fallback, structured output only; called with ADC, so no key is needed |
| **Cloud Document AI** (OCR processor, `us` multi-region) | Text for scanned PDFs and photographed bills when pdf.js finds no text layer; the OCR text goes through the same extraction schema |
| **Firestore** (Native, asia-south1) | Opt-in case history under an anonymous session id, with a 30-day TTL |
| **Cloud Storage** | Opt-in archive of uploaded documents, with a 30-day auto-delete lifecycle rule |
| **Firebase Authentication** | Sign-in gate for the desk: Google sign-in or email/password, client-side |
| **IAM + Cloud Logging** | Runtime service account scoped to Vertex AI, Document AI, Firestore and the bucket; per-request audit |
| **Cloud Billing budgets + Cloud Monitoring** | ₹1,000/month budget with 50/90/100% alerts; alerts on Cloud Run 5xx and on Gemini-call spikes |
| **Artifact Registry** | Docker image builds |
| **GitHub Actions + Workload Identity Federation** | Keyless CI/CD: vitest, sidecar tests and typecheck gate, then build/push/deploy on every push to `main` |

Built since the first draft of this write-up (Phase 06, all live on the deployed
URL): Vertex AI with ADC replaced the API-key proxy (the old Secret Manager key is
retired), Document AI OCR for scanned bills, budget and monitoring alerts, and
consent-gated optional persistence. Still on the roadmap: Cloud Armor edge protection
(deferred, as it needs an external HTTPS load balancer and a custom domain; nginx rate
limiting is the edge control until then), a Document AI form-parser upgrade for bills,
per-request audit dashboards, and account-based case sync.

## Scale story

- **Any Indian health policy.** The engine models IRDAI-standard constructs
  (room-rent sub-limits, PED waiting periods up to the 36-month cap, named sub-limits,
  moratorium rules), not one insurer's product.
- **Any document a family actually has.** Digital PDFs, scanned PDFs and phone photos
  of bills all feed the same extraction path.
- **Language access.** Every verdict closes with a plain Hindi summary
  (हिंदी सारांश) — the claim is usually managed by family, not policy nerds.
- **Mobile-first, accessible.** Responsive to 360px; WCAG-checked (100/100 Lighthouse
  accessibility on mobile and desktop), keyboard-operable, reduced-motion safe.
- **Rails to real remedies.** The grievance path ends at actual institutions — the
  insurer's GRO, IRDAI's Bima Bharosa portal, the Insurance Ombudsman — with deadlines
  computed from the rejection date.

## Privacy posture

Stateless by default, no tracking. Opening the desk needs a Firebase Auth sign-in
(Google or email/password), handled client-side; the account gates access and is not
tied to any stored case. Digital PDFs are read locally in the browser (pdf.js) and
only the extracted text goes to the model through the same-origin sidecar; scanned
or photographed documents are sent to Document AI for OCR. Request bodies are never
logged. Optional case saving (Settings toggle, default **off**) stores case history in
Firestore under an anonymous session id and uploaded documents in Cloud Storage, both
deleted automatically after 30 days. Turning the toggle off deletes the saved cases
on the server right away (archived documents still age out under the 30-day rule) and
returns the app to fully local behavior.
