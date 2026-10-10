# Demo video script — 2:30, one continuous recording

Record at 1080p, cropped to the app window. Voiceover optional; the beats below carry
the story without it. No copyrighted background music.
Rehearse unattended with `node scratch/phase07-demo.cjs` (drives the live deployment
with recording-paced pauses).

All numbers below are asserted in the vitest suite — they will be exactly what the
recording shows.

## Beat 1 — Problem (0:00–0:20)

**Visual:** landing page, slow scroll.
**Line:** "1 in 5 Indian health claims is rejected or cut — usually for paperwork and
room-rent arithmetic the family discovers too late."

## Beat 2 — The room-rent trap (0:20–1:00)

**Visual:** open the readiness desk → case "Room-rent trap" (Ramesh Iyer).
**Show, in order:**
1. The room-rent flag: room at ₹8,000/day against a ₹5,000/day cap (1% of the ₹5 lakh
   sum insured) → ratio 0.625.
2. The waterfall: every room-linked charge cut to 62.5% — total billed ₹4,35,000 →
   expected payout **₹3,49,750**.
3. The readiness score **53**, with the reasons listed — not just a number.

**Line:** "The room choice alone removed eighty-five thousand rupees. ClaimSahayak
prices that trap before the claim is filed, not after the rejection."

## Beat 3 — The rejection desk (1:00–1:40)

**Visual:** case "Rejected — PED ground" (Arvind Rao). The bundled rejection letter is
already in the desk.
**Show, in order:**
1. Classification: PED non-disclosure.
2. The moratorium flag: policy running since 2019 — 7.7 years, past the IRDAI 5-year
   moratorium → rejection is **challengeable** ("reversible: yes").
3. The drafted grievance letter with IRDAI citations and the computed deadlines;
   the dated escalation ladder (GRO → Bima Bharosa → Ombudsman).
4. Click "Print / Save as PDF" — show the clean A4 letter in the print preview.

**Line:** "The letter said non-disclosure. The regulation says: after five years, that
ground is gone. The desk drafts the reply with the clause cited and the deadline
computed."

## Beat 4 — Responsible AI (1:40–2:10)

**Visual:** split attention — `docs/architecture.md` diagram (engine boundary), then a
terminal running `npm run test` → **103 passing**.
**Line:** "Every rupee figure comes from a deterministic rules engine — a hundred and
three unit tests. The AI only reads documents; it is never allowed to invent your
policy."

## Beat 5 — Reach (2:10–2:30)

**Visual:** scroll to the हिंदी सारांश panel; then devtools device toolbar → 360px
viewport, quick scroll of the desk. Close on the deployed URL in the address bar.
**Line:** "Every verdict closes in Hindi, works on a phone, and meets accessibility
checks. ClaimSahayak — before the rejection, not after."
