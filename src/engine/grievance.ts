import type { CaseFile } from './types'
import type { RejectionVerdict } from './rules'
import { formatDate, formatINR } from './format'

/**
 * Deterministic grievance-letter drafter.
 * The letter is assembled from the case record and the rejection analysis —
 * every factual claim in it traces to an extracted field or a cited clause,
 * never to a model's imagination.
 */
export function buildGrievanceLetter(c: CaseFile, rej: RejectionVerdict): string {
  const p = c.policy
  const ep = c.episode
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const grounds = rej.steps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')
  const citations = rej.clauses.map((cl, i) => `   (${String.fromCharCode(97 + i)}) ${cl}`).join('\n')

  return `To,
The Grievance Redressal Officer,
${p.insurer}

Date: ${date}

Subject: Appeal against repudiation of claim — Policy No. ${p.policyNo} — ${c.claimant}

Dear Sir/Madam,

I write in respect of my health insurance claim under policy ${p.policyNo}
(${p.product}), arising from hospitalisation at ${ep.hospital}, ${ep.city},
from ${formatDate(ep.admissionDate)} to ${formatDate(ep.dischargeDate)} for
${ep.diagnosis}${ep.procedure ? ` (${ep.procedure})` : ''}. The claim of
${formatINR(ep.totalBill)} has been repudiated on the ground of
"${rej.reason.toLowerCase()}".

I submit that the repudiation is not sustainable, for the following reasons:

${grounds}

I rely upon the following regulatory positions:

${citations}

I request that the claim be re-examined and settled within 15 days of this
letter, failing which I shall be constrained to escalate the matter through
the Bima Bharosa portal (IRDAI) and approach the Insurance Ombudsman, whose
remedies are free of cost to policyholders.

Enclosures: policy schedule, discharge summary, itemised final bill,
investigation reports, payment receipts, and a copy of the repudiation letter.

Yours faithfully,

${c.claimant}
Policy No. ${p.policyNo}

—
Drafted by ClaimSahayak. Verify every fact and figure against your own
documents before sending. This letter is an assistive draft, not legal advice.`
}
