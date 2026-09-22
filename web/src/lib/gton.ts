/**
 * The ledger stores raw whole-unit MPT integers (no `AssetScale`). This app
 * displays them as "Gton": 1 Gton = 1e9 raw units. BigInt is used throughout
 * (never `Number`/floating point) to avoid precision loss at supply scale.
 */
const GTON_SCALE = 1_000_000_000n

/** Formats a raw ledger amount (string/number/bigint) as a Gton display string. */
export function toGton(raw: string | number | bigint): string {
  const value = BigInt(raw)
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / GTON_SCALE
  const frac = abs % GTON_SCALE
  const sign = negative ? '-' : ''
  if (frac === 0n) return `${sign}${whole.toString()}`
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '')
  return `${sign}${whole.toString()}.${fracStr}`
}

/** Parses a Gton display string (e.g. from an amount input) into a raw ledger integer string. */
export function fromGton(input: string): string {
  const trimmed = input.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`"${input}" is not a valid Gton amount.`)
  }
  const [wholePart, fracPart = ''] = trimmed.split('.')
  if (fracPart.length > 9) {
    throw new Error(`"${input}" has more precision than Gton supports (max 9 decimal places).`)
  }
  const paddedFrac = fracPart.padEnd(9, '0')
  const raw = BigInt(wholePart || '0') * GTON_SCALE + BigInt(paddedFrac || '0')
  return raw.toString()
}
