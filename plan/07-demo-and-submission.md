# Phase 07 — Demo & Submission

Target: 16–18 Oct — prototype deadline **18 Oct 2026**.

## Objective

Ship the submission, not just the code: a working deployed prototype, a demo
that proves the three hardest claims, and a write-up a judge can score without
talking to us.

## Tasks

### 7.1 Submission checklist (confirm against the official portal on 16 Oct)

- [ ] Re-open the hackathon submission page and list every required artifact
      (deck? video? repo link? live URL?). Record the list here as checkboxes
      before producing anything — requirements, not memory, drive this phase.
- [ ] Deployed Cloud Run URL loads fresh (incognito), all three sample cases
      run, managed proxy works, no console errors.
- [ ] Repo is presentable: README current (Phase 01), plan/ merged,
      `.env.example` accurate, no secrets anywhere in history (`git log -p |
      grep -i "api.key\|AIza"` returns nothing).
- [ ] Tag `v1.0-submission` on the exact submitted commit.

### 7.2 Demo video (2–3 minutes)

Storyboard — one continuous screen recording, voiceover optional:

1. **0:00–0:20** Problem: "1 in 5 Indian health claims is rejected or cut —
   usually for paperwork and room-rent arithmetic the family discovers too
   late." (Use the landing page as the visual.)
2. **0:20–1:00** Ramesh Iyer walkthrough: upload policy + bill → the
   room-rent trap found (₹8,000 vs ₹5,000 cap, ratio 0.625) → waterfall shows
   the exact deduction → score 53 with the three fixes that would raise it.
3. **1:00–1:40** Arvind Rao: rejection letter pasted → classified as PED
   non-disclosure → the 5-year moratorium flag (policy 7.7 years old —
   rejection challengeable) → grievance letter generated with the IRDAI
   citations and the 14-day deadline → print to PDF.
4. **1:40–2:10** The responsible-AI story: every rupee figure comes from a
   deterministic rules engine; the LLM only reads documents. Show the engine
   test suite passing (`npm run test`) — 5 seconds of green.
5. **2:10–2:30** Hindi summary panel + mobile viewport: accessibility and
   reach. Close on the deployed URL.

- [ ] Record at 1080p, crop to the app; no copyrighted background music.

### 7.3 Architecture diagram

- [ ] One diagram (browser SPA → nginx/Cloud Run → Gemini via proxy; engine
      boundary marked "deterministic — no AI"; Secret Manager, WIF deploy
      pipeline). Mermaid source in `docs/architecture.md`, exported PNG/SVG
      committed for the deck.

### 7.4 Write-up (map to judging criteria)

Draft `docs/submission.md` with:

- [ ] Problem + who it hurts (first-claim families, cashless-to-reimbursement
      surprises).
- [ ] Solution in three sentences: document readiness, arithmetic of the
      payable estimate, rejection reversal path.
- [ ] **Responsible AI / reliability**: LLM constrained to extraction with
      schema validation; all money math deterministic and unit-tested;
      regulatory citations verified against IRDAI instruments (link
      `plan/research-notes.md`).
- [ ] **Google Cloud usage**: Cloud Run, Artifact Registry, Secret Manager,
      Workload Identity Federation, Gemini 2.5 Flash (structured output);
      Phase 06 roadmap (Vertex AI, Document AI, Cloud Armor).
- [ ] Scale story: works for any Indian health policy; Hindi output; mobile-
      first pass; grievance rails to Bima Bharosa/Ombudsman.

### 7.5 Buffer

- [ ] Keep 17 Oct evening free for portal issues and re-uploads.
- [ ] Final smoke matrix: Chrome/Safari/Firefox, 360px + 1440px, fresh
      incognito session, all three samples, one live upload through the
      proxy.

## Acceptance criteria

- Every artifact the portal requires is uploaded before 18 Oct 23:59 IST, from
  the `v1.0-submission` tag.
- A judge following the README can run the app locally with only
  `GEMINI_API_KEY`.

## Kickoff prompt for Kimi Code

```
Read plan/README.md and this phase file. Execute Phase 07: re-check the
hackathon portal for required artifacts, draft docs/submission.md and
docs/architecture.md (mermaid), then help rehearse the demo script against
the live deployment. Run the final smoke matrix and tag v1.0-submission once
everything passes.
```
