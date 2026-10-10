# Phase 05 — Mobile & Accessibility

Fixes: AUD-15
Target: 16 Oct

## Objective

The dossier must hold up on a phone — claimants will photograph documents and
check verdicts on mobile — and meet baseline WCAG AA. This is a polish phase:
layout and semantics, no new features, no design-system changes.

## Tasks

### 5.1 Responsive pass

- [x] Audit at 360px, 768px, 1024px, 1440px. Fix in priority order:
  - Workbench: the case rail becomes a horizontal case switcher (or sheet)
    below 1024px; verdict panel stacks above the document ledger.
  - Waterfall and ledger rows: allow horizontal scroll with a fixed first
    column rather than wrapping amounts.
  - Landing: the numbered sections and the dark "Arithmetic, not opinion"
    block must not overflow; display type scales down via `clamp()`.
  - ScoreStamp: keep legible at ~120px on mobile; rotation animation may slow.
- [x] Touch targets ≥ 44px on all interactive elements (toggles, file input,
      settings controls).
- [x] Upload flow on mobile: file input accepts camera capture
      (`accept="application/pdf,image/*"` stays as-is; just verify the picker
      UX on a real device or devtools device mode).

### 5.2 Accessibility

- [x] Landmarks: `header`, `main`, `nav` (case rail), `footer`; every section
      has an accessible name.
- [x] The verdict panel announces updates: `aria-live="polite"` on the
      score/verdict region.
- [x] All toggles and buttons have visible focus rings (use the ink/chart
      tokens — no default blue outline removal without replacement).
- [x] Colour contrast: `--ink-3` on `--paper` for body text must meet 4.5:1 —
      verify; if it fails, darken `--ink-3` one step and record the token
      change in the commit message.
- [x] Forms: every input has a `<label>`; the settings sheet traps focus and
      closes on Escape.
- [x] `prefers-reduced-motion`: audit that rise/stamp/pulse animations are
      all disabled or reduced (the base rule exists — verify coverage).
- [x] Keyboard walkthrough: landing → samples → verdict → rejection desk →
      letter, fully operable without a mouse.

### 5.3 Verification

- [x] Lighthouse (desktop + mobile): Accessibility ≥ 95, Best Practices ≥ 95.
      Paste scores in the commit message.
- [x] Screenshots at 360px and 1440px for landing, workbench, rejection desk.

## Acceptance criteria

- No horizontal page scroll at 360px (internal ledger scrolling is fine).
- Lighthouse a11y ≥ 95 on both form factors; keyboard walkthrough complete.
- No visual regressions at 1440px — the dossier aesthetic is unchanged.

## Kickoff prompt for Kimi Code

```
Read plan/README.md and this phase file. Execute Phase 05: responsive pass at
360/768/1024/1440 (case rail → switcher, ledger horizontal scroll with fixed
first column, clamp-scaled display type), then the accessibility list
(landmarks, aria-live verdict, focus rings, contrast check on --ink-3, labelled
inputs, focus trap + Escape in settings, reduced-motion audit, full keyboard
walkthrough). Run Lighthouse and include the scores and before/after
screenshots in the commit message. No new features, no design-token changes
beyond the documented --ink-3 contrast fix if needed.
```
