import type { CaseFile } from './types'
import type { RejectionVerdict } from './rules'
import { addDays, addYears, formatDate, formatINR } from './format'

/** Drafts the grievance letter from the case and the rejection analysis.
 * Every fact traces to an extracted field or a cited clause. */
export function buildGrievanceLetter(c: CaseFile, rej: RejectionVerdict, rejectionDate?: string): string {
  const p = c.policy
  const ep = c.episode
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const grounds = rej.steps.map((s, i) => `   ${i + 1}. ${s}`).join('\n')
  const citations = rej.clauses.map((cl, i) => `   (${String.fromCharCode(97 + i)}) ${cl}`).join('\n')

  const deadline = rejectionDate
    ? `within 14 days of this letter, i.e. by ${formatDate(addDays(rejectionDate, 14))} (reckoned
from the repudiation dated ${formatDate(rejectionDate)}), as prescribed by the
Master Circular on Protection of Policyholders' Interests, 2024`
    : `within 14 days of this
letter, as prescribed by the Master Circular on Protection of Policyholders'
Interests, 2024`

  return `To,
The Grievance Redressal Officer,
Grievance Cell, ${p.insurer}
[Grievance-cell address, from the policy schedule or the insurer's website]

Date: ${date}

Policy No.: ${p.policyNo}
Claim No.: [as stated in the repudiation letter]

Subject: Appeal against repudiation of claim, policy ${p.policyNo}, ${c.claimant}

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

I request that the claim be re-examined and settled ${deadline},
failing which I shall be constrained to escalate the matter:

   1. Bima Bharosa portal (https://bimabharosa.irdai.gov.in), or by email to
      complaints@irdai.gov.in, or toll-free 155255.
   2. If the complaint remains unresolved within 30 days, the Insurance
      Ombudsman directly. Compensation up to ₹50 lakh (Insurance Ombudsman
      Rules, 2017, as amended by G.S.R. 828(E) dated 9 November 2023). The
      insurer must comply with an award within 30 days, failing which a
      penalty of ₹5,000 per day is payable to me. The complaint may be filed
      within one year of the repudiation (delay condonable with reasons);
      there is no fee, no lawyer is required, and hearings may be held by
      video conference on request.

Enclosures: policy schedule, discharge summary, itemised final bill,
investigation reports, payment receipts, and a copy of the repudiation letter.

Yours faithfully,

${c.claimant}
Policy No. ${p.policyNo}

Sources: Master Circular on Health Insurance Business, Ref.
IRDAI/HLT/CIR/PRO/84/5/2024 (29 May 2024); Master Circular on Protection of
Policyholders' Interests, 2024; Insurance Ombudsman Rules, 2017, as amended
by G.S.R. 828(E) (9 November 2023).

Drafted by ClaimSahayak. Check every fact and figure against your own
documents before sending. This letter is an assistive draft, not legal advice.`
}

export interface EscalationStep {
  title: string
  /** ISO date the step's deadline/window is computed to, or null when none applies */
  date: string | null
  dateLabel: string
  detail: string
}

/** Four IRDAI grievance rungs, dated from the repudiation.
 * Insurer TAT is 14 days (PPI 2024); the Ombudsman window follows G.S.R. 828(E). */
export function buildEscalationLadder(rejectionDate: string): EscalationStep[] {
  const groDeadline = addDays(rejectionDate, 14)
  const ombudsmanOpens = addDays(rejectionDate, 30)
  const ombudsmanWindow = addYears(rejectionDate, 1)
  return [
    {
      title: 'Insurer Grievance Redressal Officer (GRO)',
      date: groDeadline,
      dateLabel: `reply due by ${formatDate(groDeadline)}`,
      detail:
        'File the written grievance with the insurer\'s grievance cell now. The PPI Master Circular 2024 requires acknowledgement immediately and a reasoned decision within 14 days. If it cannot resolve the complaint, the insurer must point you to the Ombudsman.',
    },
    {
      title: 'Bima Bharosa (IRDAI)',
      date: ombudsmanOpens,
      dateLabel: `if unresolved by ${formatDate(ombudsmanOpens)}`,
      detail:
        'Escalate on the Bima Bharosa portal (bimabharosa.irdai.gov.in), by email to complaints@irdai.gov.in, or toll-free 155255 once the GRO stays silent or the reply is unsatisfactory.',
    },
    {
      title: 'Insurance Ombudsman',
      date: ombudsmanWindow,
      dateLabel: `file by ${formatDate(ombudsmanWindow)}`,
      detail:
        'Approach the Ombudsman directly if the complaint is unresolved 30 days after the grievance. Compensation up to ₹50 lakh (G.S.R. 828(E), 9 Nov 2023). The insurer must comply with an award within 30 days or pay ₹5,000/day. File within one year of the repudiation. Delay can be condoned with reasons. No fee, no lawyer needed. Hearings can be by video conference.',
    },
    {
      title: 'Consumer forum',
      date: null,
      dateLabel: 'alternative route',
      detail:
        'The District/State Consumer Commission is an alternative, not a parallel track: Rule 14(5) bars a matter that is pending before a court, consumer forum or arbitrator from going to the Ombudsman at the same time. Choose one forum.',
    },
  ]
}
