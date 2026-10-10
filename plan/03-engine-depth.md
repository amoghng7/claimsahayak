# Phase 03 — Engine Depth

Fixes: AUD-11, AUD-12, AUD-13, AUD-14
Target: 13–15 Oct

## Objective

Deepen the deterministic engine so the verdict reflects the four most common
real-world deduction drivers beyond room rent — PED waiting periods, named
sub-limits, permanent exclusions — and let the user correct extraction
mistakes before trusting the numbers. All arithmetic stays in `rules.ts`;
Gemini's role is unchanged (extraction only).

## Tasks

### 3.1 Exclusions surfaced (AUD-11)

- [ ] Verdict panel: new "Permanent exclusions in this policy" section listing
      `policy.exclusions` (already extracted). Style: plain ledger rows,
      mono numerals where relevant — no icon cards.
- [ ] Keyword-match the hospitalisation diagnosis/treatment against the
      exclusion list (case-insensitive, word-boundary). On a hit, raise a
      crimson flag: "This treatment appears in the policy's permanent
      exclusions" and exclude matching bill lines from the estimate.
- [ ] vitest: policy excluding "cosmetic surgery" + rhinoplasty bill → flag
      raised, lines excluded.

### 3.2 PED waiting-period scoring (AUD-12)

- [ ] `types.ts`: `Policy.pedWaitMonths?: number` (default 36 — the IRDAI cap;
      a higher extracted value triggers a "non-compliant policy term" note per
      research-notes.md) and `Policy.pedsDeclared: string[]`.
- [ ] Extend the Gemini extraction schema (zod + responseSchema together) to
      pull the PED waiting period and declared-PED list from the policy
      schedule/CIS.
- [ ] `rules.ts` `pedWaitingCheck(policy, episode)`: match the episode
      diagnosis against `pedsDeclared` plus a small synonym map
      (diabetes~sugar, hypertension~BP~high blood pressure, thyroid, asthma,
      arthritis). If matched and `monthsSinceStart < pedWaitMonths`:
      crimson flag, score −30, and the matched treatment's lines excluded from
      the estimate. If within 3 months of completing the wait, amber
      "waiting period completes on <date>" note.
- [ ] vitest: diabetes declared, policy 14 months old, diabetic foot admission
      → excluded + score drop; same case at 37 months → clean.

### 3.3 Sub-limits beyond room rent + ICU nuance (AUD-13)

- [ ] Use the existing `Policy.subLimits` array; extend its type to
      `{ name: string; match: string[]; type: 'fixed' | 'percent_si' |
      'percent_claim'; value: number }` where `match` holds keywords
      (cataract, knee replacement, hip replacement, hernia, piles, modern
      treatments like robotic/ cyberknife/ stem cell).
- [ ] `estimatePayable`: after the room-rent step, apply each sub-limit by
      capping the sum of matched bill lines at the limit; each applied cap is
      its own waterfall row ("Cataract cap: ₹40,000 applied").
- [ ] ICU nuance: bill lines matching /icu|intensive care|ventilator/i are
      **never** proportionally reduced by the room-rent ratio and are exempt
      from `isRoomRent` caps (IRDAI convention: ICU charges are not subject
      to room-rent proportionate deduction).
- [ ] Update the Ramesh Iyer sample: add a cataract sub-limit or an ICU line
      so the waterfall visibly exercises the new steps; adjust the asserted
      expected payout and the test from Phase 01 accordingly (compute the new
      number by hand first, write it in the test, then make the engine match).
- [ ] vitest: sub-limit cap applied exactly; ICU lines untouched by ratio;
      non-ICU room-linked lines still reduced.

### 3.4 Line-item editor (AUD-14)

- [ ] Workbench: after extraction, bill lines render as an editable ledger —
      amount editable (mono, right-aligned), `roomLinked` and `nonPayable`
      as toggles, delete-row and add-row actions. Edits recompute the verdict
      live through the same engine path (no separate math).
- [ ] "Reset to extracted values" restores the Gemini output. A small
      "edited" marker appears on rows the user touched.
- [ ] Guard: amounts clamp to non-negative numbers; totals footer always
      reconciles with the sum of rows.
- [ ] vitest: engine-level recompute from edited lines equals hand-computed
      expectation (UI itself verified manually + screenshots).

## Acceptance criteria

- All new engine behaviour covered by vitest; total suite green; sample-case
  assertions updated and passing with hand-verified numbers.
- A policy PDF containing "Cataract … limit ₹40,000 per eye" produces a
  waterfall row showing the cap.
- A scanned-style policy with diabetes PED + 36-month wait + diabetic
  admission at month 14 produces the PED flag and exclusion.
- Editing a bill line amount changes the verdict instantly; reset restores it.
- No new colours, fonts, or card patterns introduced; ledger aesthetic
  preserved (check screenshots at 1440px).

## Kickoff prompt for Kimi Code

```
Read plan/README.md, plan/00-current-state-audit.md, plan/research-notes.md
and this phase file. Execute Phase 03: exclusions display + matching, PED
waiting-period scoring (36-month IRDAI cap default, non-compliant-term note),
named sub-limits with waterfall rows, ICU exemption from proportional
deduction, and the editable bill-line ledger wired to the same engine. Extend
zod schema and responseSchema together for the new extraction fields. Hand-
compute the new Ramesh Iyer expectation before writing the assertion. All
money math stays in src/engine/rules.ts. Tests must pass before each commit.
```
