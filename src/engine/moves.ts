import type { CaseFile } from './types'
import type { RejectionVerdict, Verdict } from './rules'
import { isPolicyScheduleKnown } from './rules'
import { formatDate, formatINR } from './format'

/** Next moves from the rules verdict only. The model never decides what would raise payment.
 * "raise" is still in the claimant's hands; "know" is already fixed by the contract. */
export interface ClaimMove {
  id: string
  title: string
  detail: string
  impact: 'raise' | 'know'
}

/** An implant invoice only belongs on a file that actually used one. */
const IMPLANT_RE = /implant|stent|\blens\b|prosthes|\bdhs\b|screw/i

function episodeText(c: CaseFile): string {
  return [c.episode.diagnosis, c.episode.procedure, ...c.episode.billLines.map((l) => l.head)].join(' ')
}

export function claimMoves(c: CaseFile, v: Verdict, rejection?: RejectionVerdict | null): ClaimMove[] {
  const moves: ClaimMove[] = []
  const text = episodeText(c)

  if (rejection && rejection.reversible !== 'hard' && rejection.patternId !== 'unknown') {
    moves.push({
      id: 'rejection',
      impact: 'raise',
      title:
        rejection.reversible === 'yes'
          ? `Answer the rejection: ${rejection.reason}`
          : `Contest the rejection: ${rejection.reason}`,
      detail: rejection.steps[0] ?? rejection.explanation,
    })
  }

  // Before anything else: without the schedule the score could not check
  // waiting periods, PED waits or sub-limits, so that is the first fix.
  if (!isPolicyScheduleKnown(c.policy)) {
    moves.push({
      id: 'policy-schedule',
      impact: 'raise',
      title: 'Attach the policy schedule copy',
      detail:
        'Waiting periods, PED waits, room-rent caps and sub-limits could not be verified without it. The score treats those checks as unverified, not as passed.',
    })
  }

  if (v.exclusions.hits.length > 0) {
    moves.push({
      id: 'exclusion',
      impact: 'know',
      title: 'This treatment is permanently excluded',
      detail: `${v.exclusions.hits.join(', ')} is never payable, however long the policy has run. Filing on this ground will not succeed.`,
    })
  }

  const ped = v.ped
  if (ped.breach && ped.matchedPed && ped.nearingCompletion && ped.completesOn) {
    moves.push({
      id: 'ped-wait',
      impact: 'raise',
      title: `Wait until ${formatDate(ped.completesOn)} if treatment can wait`,
      detail: `"${ped.matchedPed}" clears its waiting period on that date. An admission after it is not caught by this clause.`,
    })
  } else if (ped.breach && ped.matchedPed && !ped.nearingCompletion) {
    moves.push({
      id: 'ped-breach',
      impact: 'know',
      title: 'This admission sits inside a PED waiting period',
      detail: `"${ped.matchedPed}" was declared, and the wait has not run out. Treatment linked to it is excluded from the estimate.`,
    })
  }

  v.waiting.forEach((w, i) => {
    moves.push({
      id: `wait-${i}`,
      impact: 'know',
      title: w.label,
      detail: w.detail,
    })
  })

  const mandatory = v.missing.filter((m) => m.mandatory)
  if (mandatory.length > 0) {
    const names = mandatory.map((m) => m.label).join('; ')
    moves.push({
      id: 'docs',
      impact: 'raise',
      title:
        mandatory.length === 1
          ? `Add the ${mandatory[0].label.toLowerCase()}`
          : `Add ${mandatory.length} mandatory documents`,
      detail: `${names}. A missing mandatory paper is the most common reason a payable claim is sent back.`,
    })
  }

  const pharmacy = v.missing.find((m) => m.id === 'pharmacy')
  const hasPharmacyBill = c.episode.billLines.some((l) => /pharmac|medicine/i.test(l.head))
  if (pharmacy && hasPharmacyBill) {
    moves.push({
      id: 'pharmacy',
      impact: 'raise',
      title: 'Map the pharmacy bills to the prescriptions',
      detail: pharmacy.why,
    })
  }

  const implantMissing = v.missing.some((m) => m.id === 'implant')
  const implantUsed = IMPLANT_RE.test(text)
  if (implantMissing && implantUsed) {
    moves.push({
      id: 'implant',
      impact: 'raise',
      title: 'Attach the implant sticker and invoice',
      detail: 'Implant cost is routinely queried without the sticker and the invoice.',
    })
  }

  if (v.roomRent) {
    const rr = v.roomRent
    const pct = Math.round(rr.ratio * 1000) / 10
    moves.push({
      id: 'room',
      impact: 'know',
      title: 'The room was above the sub-limit',
      detail: `The cap is ${formatINR(rr.allowed)} a day. The bill shows ${formatINR(rr.actual)}. Linked charges settle at ${pct}% of what was billed. File the admissible amount. Disputing the ratio itself rarely succeeds.`,
    })
  }

  for (const cut of v.payable.subLimitCuts) {
    moves.push({
      id: `sublimit-${cut.label}`,
      impact: 'know',
      title: 'A sub-limit caps part of this bill',
      detail: `${cut.label}. ${formatINR(cut.amount)} sits above it. Claim the capped amount so a query on that head does not hold the rest.`,
    })
  }

  const consumable = v.flags.find((f) => f.kind === 'non_payable')
  if (consumable) {
    moves.push({
      id: 'consumables',
      impact: 'raise',
      title: 'Leave non-payable consumables off the claim',
      detail: `${formatINR(consumable.amountAtRisk)} of gloves, masks and similar items will not be paid. Dropping them from the claimed amount keeps the file from being queried over them.`,
    })
  }

  if (c.policy.copayPct > 0) {
    moves.push({
      id: 'copay',
      impact: 'know',
      title: `A ${c.policy.copayPct}% co-pay will come off`,
      detail: 'It applies after every other deduction. It is in the contract, so budget for it.',
    })
  }

  if (moves.length === 0) {
    const tail = implantMissing
      ? 'The implant invoice on the checklist matters only when an implant was used.'
      : 'Nothing else will raise the chance of payment.'
    moves.push({
      id: 'ready',
      impact: 'raise',
      title: 'File it',
      detail: `The mandatory papers are on the file and no deduction trap is open. ${tail}`,
    })
  }

  return moves
}
