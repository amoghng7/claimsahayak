# ClaimSahayak — Implementation Plan

This folder is the execution plan for taking ClaimSahayak from its current working
prototype to a complete, hardened, submission-ready product. It is written to be
executed phase-by-phase by **Kimi Code** (or any coding agent) with a human
reviewing diffs between phases.

- Prototype submission deadline: **18 Oct 2026**
- Plan written: 11 Oct 2026
- Repo: `amoghng7/claimsahayak`, branch `main`

## How to use this folder

1. Read `00-current-state-audit.md` first. It is the source of truth about what
   exists today, what is verified working, and the numbered issue register
   (AUD-01 … AUD-18) that the phases fix.
2. Read `research-notes.md` before any phase that touches regulatory copy,
   grievance text, or the rules engine. Every regulation cited there was
   re-verified on 11 Oct 2026 with a source link.
3. Execute phases **in order** (01 → 05, then 07). Each phase file is
   self-contained: objective, scope, exact tasks with file paths, acceptance
   criteria, verification commands, and a ready-to-paste kickoff prompt.
4. Do not start a phase until the previous phase's acceptance criteria pass.
5. Phase 06 (production backend) is a stretch track — it is **not** required for
   the 18 Oct submission and must not destabilise the demo path.

## Phase map

| Phase | File | Goal | Target |
|-------|------|------|--------|
| 00 | `00-current-state-audit.md` | Shared understanding of current state | read-only |
| 01 | `01-repo-hygiene-and-trust.md` | Fix broken tooling, ship tests + CI gate, validate AI output, correct regulatory copy | 11–12 Oct |
| 02 | `02-proxy-coherence.md` | Make the Gemini proxy work identically in dev and prod; fix key UX; harden the proxy | 12–13 Oct |
| 03 | `03-engine-depth.md` | Exclusions display, PED waiting-period scoring, broader sub-limits, ICU nuance, line-item editor | 13–15 Oct |
| 04 | `04-rejection-intelligence.md` | Gemini fallback classifier, Hindi for rejections, printable grievance letter, escalation timeline | 15–16 Oct |
| 05 | `05-mobile-and-accessibility.md` | Responsive pass + WCAG accessibility | 16 Oct |
| 07 | `07-demo-and-submission.md` | Demo video, architecture diagram, write-up, release tag, submission checklist | 16–18 Oct |
| 06 | `06-production-backend.md` | Vertex AI, Document AI OCR, persistence, monitoring | post-deadline stretch |

Phases 01 and 02 are small and can share a day. Phase 07 overlaps the end of
05 — start the demo script as soon as the verdict flow is stable.

## Ground rules — apply to every phase

### Design guardrails (do not drift)

The "claims dossier" design system is deliberate. Any UI work must respect it:

- Colours come only from the tokens in `src/index.css` (`--paper`, `--paper-2`,
  `--paper-3`, `--ink`, `--ink-3`, `--chart`, `--mint`, `--brick`, `--crimson`,
  `--line`). New colours mean new tokens, not raw hex in components.
- Typography: Fraunces (display/serif), Instrument Sans (UI), IBM Plex Mono
  (all numerals, amounts, data), Tiro Devanagari Hindi / Noto Sans Devanagari
  for Hindi text. Never render Hindi in a Latin display face.
- Forbidden: Inter/Roboto, purple/indigo/violet utilities, gradient utilities,
  generic icon-in-rounded-square cards, marketing-template layout (centred hero
  + two CTAs + three feature cards). No emojis in UI copy.
- Motion stays subtle (`rise`, `stamp-ring`, `pulse-dot`) and must honour
  `prefers-reduced-motion`.

### Engineering rules

- **All money arithmetic lives in the deterministic rules engine**
  (`src/engine/rules.ts`). Gemini may extract document data and classify text;
  it never computes a rupee amount. If a feature needs a number, the engine
  computes it from typed inputs.
- Every engine change ships with vitest assertions in the same commit.
  `npm run test` must pass before the commit is made.
- `npx tsc --noEmit` and `npm run build` must stay clean. `npm run lint` must
  exist and pass after Phase 01.
- Never commit secrets. `GEMINI_API_KEY` lives in Cloud Secret Manager
  (production) or `.env` (local, gitignored). Sample data stays fictional.
- Commits: conventional-commit style (`feat:`, `fix:`, `test:`, `docs:` …),
  one logical task per commit.
- Regulatory claims in UI copy must match `research-notes.md`. If a regulation
  changes, update the research note and the copy together.

### Definition of done (every phase)

1. All tasks in the phase file are checked off.
2. Every acceptance criterion verified with the listed commands.
3. UI phases: before/after screenshots (desktop 1440px and mobile 360px) noted
   in the commit message or PR description.
4. README updated if user-facing behaviour changed.
5. No regressions in the three sample cases (expected numbers are asserted in
   the test suite from Phase 01 onward).
