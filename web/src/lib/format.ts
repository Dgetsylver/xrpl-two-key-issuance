/** `rAb7Tq…Q7Kx`: enough of an address to recognise it, for sentences and lists. Full addresses stay visible nearby. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

/** `01 Sep 2026` */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** `01 Sep`, or `01 Sep 2025` outside the current year. */
export function formatShortDate(date: Date, now: Date = new Date()): string {
  if (date.getFullYear() !== now.getFullYear()) return formatDate(date)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

/** Escapes text for interpolation into innerHTML templates. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Joins `a`, `a and b`, `a, b and c`. */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
