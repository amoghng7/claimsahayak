# Submission checklist — Google Cloud AI Builder Cup 2026 (JAPAC)

Source: official FAQ at <https://aibuildercup.com/Faqs.html> (re-verified during Phase 07).
The portal is the authority — re-open it before submitting and reconcile this list.

## Required artifacts (from the official FAQ)

> "a working deployed link of your prototype, a video demo under 3 minutes, the public
> GitHub repository of your prototype and a deck explaining your solution in detail."

- [ ] **Deployed link** — <https://claimsahayak-tvghig4oya-el.a.run.app>
  - [x] Loads fresh (fresh browser context, no console errors) — verified via
        `scratch/phase07-live-smoke.cjs`
  - [x] All three sample cases run — verified (Room-rent trap / Clean claim / Rejected, PED)
  - [x] Managed proxy works — verified (`POST /api/gemini/generate` → 200 JSON from Gemini)
  - [ ] Re-run the smoke script on the final tagged build before submitting
- [ ] **Video demo, under 3 minutes** — script + rehearsal automation in
      `docs/demo-script.md` / `scratch/phase07-demo.cjs`; record at 1080p, no
      copyrighted music
- [ ] **Public GitHub repository** — <https://github.com/amoghng7/claimsahayak>
  - [x] README current
  - [x] `.env.example` accurate (`GEMINI_API_KEY` only)
  - [x] No secrets in history (`git log -p | grep -E "AIza[0-9A-Za-z_-]{20,}"` → empty)
  - [ ] Repo visibility confirmed public
- [ ] **Deck** explaining the solution — architecture diagram exported in
      `docs/architecture.{png,svg}`, content in `docs/submission.md`

## Eligibility constraints (FAQ)

- [x] Runs on Google Cloud (Cloud Run + Gemini) — required for evaluation
- [x] Working prototype demonstrating the idea end-to-end
- [ ] Confirm: fresh project built during the hackathon timeline
- [ ] Confirm: one submission under one theme (BFSI)

## Submission

- [ ] Tag `v1.0-submission` on the exact submitted commit
- [ ] Every artifact uploaded before the portal deadline
- [ ] Judge can run locally with only `GEMINI_API_KEY` (README "Run it" section)
