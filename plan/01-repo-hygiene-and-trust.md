# Phase 01 — Repo Hygiene & Regulatory Trust

Fixes: AUD-01, AUD-02, AUD-03, AUD-08, AUD-09
Target: 11–12 Oct

## Objective

Make the repository self-verifying (tests + CI gate + working lint), make the
AI boundary robust (schema-validated Gemini output), and correct every stale
regulatory number in user-facing copy. After this phase, `npm ci && npm run
test && npm run lint && npm run build` must pass from a fresh clone.

## Tasks

### 1.1 Restore linting (AUD-01)

- [ ] Add dev dependencies: `eslint`, `@eslint/js`, `typescript-eslint`,
      `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (versions
      compatible with eslint 9 flat config).
- [ ] Create `eslint.config.js` (flat config): typescript-eslint recommended,
      react-hooks recommended, react-refresh for vite; ignore `dist/`.
- [ ] Fix everything `npm run lint` flags; do not silence with blanket
      `eslint-disable` — the `@ts-ignore` in `vite.config.ts` gets a
      one-line justification comment instead.

### 1.2 Ship the test suite (AUD-08)

- [ ] `npm i -D vitest`; add `"test": "vitest run"` to package.json.
- [ ] Create `src/engine/__tests__/rules.test.ts` and port the 14 assertions
      from the local verifier into proper vitest specs:
  - room-rent allowed amount for `percent_si`, `daily_cap`, `no_limit`,
    `single_room`
  - proportional deduction ratio math on Ramesh Iyer's case (ratio 0.625,
    roomCut and proportionalCut to the rupee)
  - `estimatePayable` waterfall ordering: room cut → co-pay → non-payables
  - `waitingPeriodCheck` boundary at exactly 30 days
  - `buildVerdict` score bands at 75/50 boundaries and deduction stacking
  - `analyzeRejection` pattern matching for all six categories + unknown
  - the three sample cases produce their documented scores and payouts
    (53/₹3,34,750 — 96/₹1,80,500 — 20% co-pay ₹70,400/₹2,81,600)
- [ ] Add `src/engine/__tests__/grievance.test.ts`: letter contains the cited
      regulation references, the policyholder name, and the claim number; no
      template placeholders (`{{` or `__`) survive rendering.
- [ ] Add `src/engine/__tests__/hindi.test.ts`: summary renders for all three
      verdict bands without throwing; Hindi text contains Devanagari.

### 1.3 CI quality gate (AUD-08)

- [ ] In `.github/workflows/deploy.yml`, insert before the Docker build:
      `actions/setup-node@v4` (node 20, `cache: npm`), `npm ci`, `npm run test`,
      `npx tsc --noEmit`. Deploy must not proceed if any step fails.

### 1.4 Validate Gemini output (AUD-09)

- [ ] `npm i zod`.
- [ ] Create `src/engine/schemas.ts` with zod schemas mirroring the extraction
      payload (policy fields, hospital episode, bill lines with
      `roomLinked`/`isRoomRent`/`nonPayable` flags, rejection fields). All
      money fields `z.number().nonnegative()`; enums match `types.ts` unions.
- [ ] In `src/engine/gemini.ts`: pass `generationConfig.responseMimeType:
      "application/json"` and a `responseSchema` (JSON-Schema subset matching
      the zod schema) so the API itself constrains output.
- [ ] Parse responses with `schema.safeParse`. On failure: one automatic retry
      with the validation errors appended to the prompt; if the retry also
      fails, surface a readable error ("The document could not be read
      reliably — try a clearer scan or enter the details manually") instead of
      throwing raw JSON.
- [ ] Add vitest specs: valid sample payload parses; payload with a string
      amount fails; retry path is exercised with a mocked fetch.

### 1.5 Regulatory copy corrections (AUD-02)

Use `plan/research-notes.md` as the authority. Grep first: `grep -rn "15 day\|
15-day\|30 lakh\|₹30" src/ README.md`.

- [ ] Free-look period: **15 days → 30 days** everywhere (disclaimer,
      Landing, any explainer copy).
- [ ] `src/engine/grievance.ts` escalation steps:
  - Insurer GRO: resolve within **14 days** (was 15).
  - If unresolved in 30 days → Insurance Ombudsman directly.
  - Ombudsman: compensation ceiling **₹50 lakh** (G.S.R. 828(E), 9 Nov 2023);
    insurer must comply with an award within **30 days**, else **₹5,000/day
    penalty**; filing window **one year** from rejection (condonable); no fee,
    no lawyer; video hearing on request.
  - Bima Bharosa step: portal URL, complaints@irdai.gov.in, 155255.
- [ ] Moratorium copy: confirm it says 5 years continuous coverage, fraud the
      sole exception, portability carries continuity (already correct —
      verify, don't rewrite).
- [ ] Add a "Sources" line at the end of the grievance letter listing the two
      instruments cited (Master Circular IRDAI/HLT/CIR/PRO/84/5/2024;
      Insurance Ombudsman Rules 2017 as amended 9 Nov 2023).

### 1.6 README refresh (AUD-03)

- [ ] Remove the stale "package-lock.json is not committed" note.
- [ ] Rewrite the Gemini section: proxy is the default path (key in Secret
      Manager); BYOK override exists for local development; link to Phase 02
      for the dev-proxy setup.
- [ ] Add a `plan/` section pointing to this folder.
- [ ] Add a "Verified against" note listing the two IRDAI instruments.

## Acceptance criteria

- Fresh clone: `npm ci && npm run test && npm run lint && npx tsc --noEmit &&
  npm run build` all pass.
- `grep -rn "15 day\|15-day" src/` returns no free-look or grievance-TAT hits.
- A forced-malformed Gemini response (mock) produces the readable error, never
  a raw stack or silent wrong numbers.
- deploy.yml runs tests before the Docker build (verified by a pushed commit
  going green).

## Kickoff prompt for Kimi Code

```
Read plan/README.md, plan/00-current-state-audit.md, plan/research-notes.md and
this phase file. Execute Phase 01 exactly: restore eslint flat config, add
vitest with the listed engine specs, add the CI test gate to deploy.yml, add
zod + responseSchema validation with one retry to src/engine/gemini.ts, correct
the regulatory copy per research-notes.md, and refresh the README. Keep the
design system untouched. Run npm run test, npm run lint, npx tsc --noEmit and
npm run build before committing. Commit per task group with conventional
commit messages.
```
