# Phase 04 — Rejection Intelligence

Fixes: AUD-10, AUD-16, AUD-17
Target: 15–16 Oct

## Objective

Close the loop on the rejection-desk flow: AI-assisted classification when
regex can't read a letter, Hindi coverage for rejection outcomes, and a
grievance letter the user can actually file — printable, dated, with the
escalation ladder and its deadlines.

## Tasks

### 4.1 Gemini fallback classifier (AUD-10)

- [x] `src/engine/rejection.ts` (new): when `analyzeRejection` returns
      `unknown`, send the rejection-letter text through the existing proxy
      path with a dedicated prompt + `responseSchema`:
      `{ category: enum-of-the-six-known | 'genuinely-other',
         confidence: number, citedClause: string, plainLanguageReason: string }`.
- [x] Validate with zod (same discipline as Phase 01). If confidence < 0.6 or
      category is `genuinely-other`, keep the `unknown` verdict but append the
      model's `plainLanguageReason` as advisory text, clearly labelled as an
      AI interpretation.
- [x] The deterministic regex classifier remains the primary path — Gemini is
      only the fallback. The UI marks AI-classified results with a subtle
      "classified with AI assistance" note.
- [x] If no key/proxy is available, degrade silently to the current `unknown`
      guidance.
- [x] vitest: routing logic (regex hit → no API call; miss → API call; low
      confidence → unknown preserved). Mock fetch; no live calls in tests.

### 4.2 Hindi for rejection outcomes (AUD-16)

- [x] Extend `src/engine/hindi.ts` with a rejection template: what the insurer
      said, why the analysis disagrees (or agrees), and the next step —
      mirroring the English structure. Keep sentence patterns from the
      existing template; all numerals stay in ₹-formatted Latin digits (as the
      existing template does).
- [x] HindiPanel renders for the rejection desk too, with the Devanagari font
      stack unchanged.
- [x] Native-speaker review is out of scope for the hackathon; mark the panel
      "सरल हिंदी सारांश (प्रायोगिक)" — experimental.

### 4.3 Filing-ready grievance letter (AUD-17)

- [x] Print stylesheet (`@media print` in `index.css`): letter renders as a
      clean A4 document — ink on white, Fraunces/serif acceptable in print,
      no background paper texture, page-break rules so the signature block
      never orphans. "Print / Save as PDF" button (`window.print()`).
- [x] Letter header gains: today's date, insurer grievance-cell placeholder
      line, claim number, policy number, and a deadline line computed from the
      rejection date ("Reply requested within 14 days, per IRDAI PPI Master
      Circular 2024").
- [x] Escalation ladder UI (rejection desk): four steps with computed dates —
      GRO (14 days from letter), Bima Bharosa (after GRO silence/unsatisfactory),
      Ombudsman (within 1 year of rejection; award ≤ ₹50 lakh; insurer complies
      in 30 days or ₹5,000/day), Consumer forum (alternative, note Rule 14(5)
      exclusivity). Data from `research-notes.md`; dates computed in
      `grievance.ts`, not hard-coded.
- [x] vitest: ladder dates computed correctly from a fixed rejection date;
      letter contains the 14-day deadline line and the sources footer from
      Phase 01.

## Acceptance criteria

- An unmatched rejection letter (paste a novel phrasing) gets an AI-classified
  category with the assistance note; with the key removed it degrades to the
  current guidance without errors.
- Arvind Rao's rejection flow shows the Hindi panel and the dated escalation
  ladder (spot-check the 14-day date arithmetic).
- Print preview of the grievance letter is a clean single-purpose A4 document.
- Suite green; no live API calls in tests.

## Kickoff prompt for Kimi Code

```
Read plan/README.md, plan/00-current-state-audit.md, plan/research-notes.md
and this phase file. Execute Phase 04: add the Gemini fallback rejection
classifier (regex stays primary, zod-validated, confidence-gated, mocked in
tests), extend the Hindi template to rejection outcomes, add the print
stylesheet + print button, and build the dated escalation ladder from the
rejection date using the timelines in research-notes.md. Keep all arithmetic
and dates deterministic in the engine. Verify acceptance criteria before
committing.
```
