# ClaimSahayak — Submission write-up

**Google Cloud AI Builder Cup 2026 (JAPAC) · Theme: BFSI**

- Live prototype: <https://claimsahayak-tvghig4oya-el.a.run.app>
- Repository: <https://github.com/amoghng7/claimsahayak>
- Architecture: [docs/architecture.md](architecture.md) ([PNG](architecture.png) / [SVG](architecture.svg))

## The problem — and who it hurts

Roughly 1 in 5 Indian health-insurance claims is rejected or cut, and the most
reversible class — documentation gaps, procedural lapses, room-rent arithmetic — is
the one families discover last. A first-claim family chooses a slightly better room,
and because of a 1%-of-sum-insured sub-limit they never read, every charge
contractually linked to room category (surgeon, anaesthesia, OT) is paid in the same
reduced ratio. On a ₹4.35 lakh surgery that one choice quietly removes ~₹85,000. When
a claim *is* rejected, the letter is written in regulatory language nobody at home can
parse — and the deadlines to fight it (14 days to the grievance cell, 12 months to the
Ombudsman, the 5-year moratorium on non-disclosure rejections) start ticking
immediately.

## The solution in three sentences

1. **Document readiness** — ClaimSahayak reads the policy schedule and hospital bill,
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

- **The LLM only reads.** Gemini (`gemini-3.8-flash`, temperature 0, enforced JSON
  schema) turns document text into structured facts. Its output is validated with zod
  and retried once with validation errors appended; malformed output is rejected at
  the API level (`responseSchema`), not parsed loosely.
- **All money math is deterministic and unit-tested.** Score, room-rent ratio,
  proportional deduction, sub-limit caps, PED cuts, co-pay and the settlement
  waterfall are computed by a framework-free TypeScript rules engine
  (`src/engine/rules.ts`) — 103 vitest assertions, including the three bundled case
  files' documented scores and payouts (e.g. the room-rent-trap case: score 53,
  expected payout ₹3,49,750 on a ₹4,35,000 bill).
- **Citations are verified, not hallucinated.** Every regulatory claim in the UI
  (IRDAI PPHI/HPR 2024, the 36-month PED cap, the 5-year moratorium, Bima Bharosa
  timelines) was re-verified against the source instrument and is recorded with links
  in `plan/research-notes.md`; the clause sits next to the arithmetic it justifies.
- **Fallbacks are honest.** When the regex rejection classifier can't place a letter,
  a Gemini fallback classifier takes over — zod-validated, confidence-gated, and
  visibly labelled "AI assistance" in the UI. Extraction mistakes are correctable:
  every bill line is editable and the whole verdict recomputes through the same
  engine.

## Google Cloud usage

| Service | Role |
|---|---|
| **Cloud Run** (asia-south1) | Hosts the SPA behind nginx; same-origin POST-only proxy `/api/gemini/generate` with per-IP rate limiting |
| **Gemini API** (`gemini-3.8-flash`) | Document extraction and the gated rejection fallback — structured output only |
| **Secret Manager** | The managed Gemini key; injected into nginx env at deploy, never in the client or the image |
| **Artifact Registry** | Docker image builds |
| **GitHub Actions + Workload Identity Federation** | Keyless CI/CD: tests + typecheck gate, then build/push/deploy on every push to `main` |

Post-submission roadmap (Phase 06, planned): Vertex AI with Application Default
Credentials instead of an API key, Cloud Document AI OCR for scanned bills, Cloud
Armor edge protection with budget/monitoring alerts, and consent-gated optional
persistence.

## Scale story

- **Any Indian health policy.** The engine models IRDAI-standard constructs
  (room-rent sub-limits, PED waiting periods up to the 36-month cap, named sub-limits,
  moratorium rules), not one insurer's product.
- **Language access.** Every verdict closes with a plain Hindi summary
  (हिंदी सारांश) — the claim is usually managed by family, not policy nerds.
- **Mobile-first, accessible.** Responsive to 360px; WCAG-checked (100/100 Lighthouse
  accessibility on mobile and desktop), keyboard-operable, reduced-motion safe.
- **Rails to real remedies.** The grievance path ends at actual institutions — the
  insurer's GRO, IRDAI's Bima Bharosa portal, the Insurance Ombudsman — with deadlines
  computed from the rejection date.

## Privacy posture

Stateless by default: no accounts, no tracking. Documents are read locally in the
browser (pdf.js); only extracted text crosses to the proxy, request bodies are never
logged, and nothing persists server-side. Optional case saving (Settings toggle,
default **off**) stores case history in Firestore under an anonymous session id and
uploaded documents in Cloud Storage with automatic 30-day deletion — turning the
toggle off erases the session and returns the app to fully local behavior.
