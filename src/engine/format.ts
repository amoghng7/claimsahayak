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
