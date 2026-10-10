/** Indian-format ₹ formatting: 420000 → ₹4,20,000 */
export function formatINR(n: number): string {
  const rounded = Math.round(n)
  const s = Math.abs(rounded).toLocaleString('en-IN')
  return `${rounded < 0 ? '−' : ''}₹${s}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

export function yearsBetween(a: string, b: string): number {
  return daysBetween(a, b) / 365.25
}

/** Calendar months between two ISO dates (day-of-month aware). */
export function monthsBetween(a: string, b: string): number {
  const d1 = new Date(a)
  const d2 = new Date(b)
  let m = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth())
  if (d2.getDate() < d1.getDate()) m -= 1
  return m
}

/** ISO date `months` calendar months after `iso` (clamped to month end). */
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0) // Jan 31 + 1 → Feb 28, not Mar 3
  return d.toISOString().slice(0, 10)
}

/** ISO date `days` days after `iso`. UTC arithmetic — no local-timezone drift. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** ISO date `years` calendar years after `iso` (Feb 29 clamps to Feb 28). */
export function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCFullYear(d.getUTCFullYear() + years)
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}
