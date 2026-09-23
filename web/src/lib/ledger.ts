import type { TextMemo } from 'xrpl'
import { contractNote, formatEuro, isDealingDay } from './dealing'
import { shortAddress } from './format'
import { formatUnits } from './units'
import type { MptPayment } from './xrplClient'

/**
 * The public register ledger, read-only: every issue by the Register (the
 * issuer account) and every delivery by the Dealing Desk (the governance
 * account), newest first. Nothing here is enforced by the ledger; it's the
 * public trail that makes a skipped step visible.
 */
export type LedgerStamp = 'ISSUE' | 'DELIVER' | 'REDEEM'

export interface LedgerRow {
  stamp: LedgerStamp
  title: string
  memo: string
  hash?: string
  ledgerIndex?: number
  date?: Date
  /** Set when the entry is valid but doesn't follow the procedure. */
  offProcedure?: string
}

export interface LedgerInput {
  issuerPayments: MptPayment[]
  deskPayments: MptPayment[]
  issuer: string
  desk: string
  ticker: string
}

/** The order reference a delivery carries: an `order-ref` memo, else the first text memo's data. */
export function orderRefOf(memos: TextMemo[]): string | undefined {
  return memos.find((memo) => memo.type === 'order-ref' && memo.data)?.data ?? memos.find((memo) => memo.data)?.data
}

function mintPeriod(memos: TextMemo[]): string | undefined {
  return memos.find((memo) => memo.type === 'mint-period' && memo.data)?.data
}

/** Whether an issue's units are exactly what the dealing day's contract note says. */
export function matchesContractNote(day: string, amountRaw: string): boolean {
  return isDealingDay(day) && contractNote(day).unitsRaw === BigInt(amountRaw)
}

function issueRow(payment: MptPayment, input: LedgerInput): LedgerRow {
  const units = `${formatUnits(payment.amountRaw)} ${input.ticker}`
  const day = mintPeriod(payment.memos)
  const toDesk = payment.destination === input.desk
  let memo = day ?? '(no dealing-day memo)'
  if (day && matchesContractNote(day, payment.amountRaw)) {
    const note = contractNote(day)
    memo = `${day} · ${formatEuro(note.cash, 0)} ÷ ${formatEuro(note.nav, 4)} (illustrative)`
  }
  let offProcedure: string | undefined
  if (!toDesk) offProcedure = 'Skipped the Dealing Desk'
  else if (!day) offProcedure = 'No dealing-day memo'
  return {
    stamp: 'ISSUE',
    title: toDesk ? `Issued ${units} to the Dealing Desk` : `Issued ${units} directly to ${shortAddress(payment.destination)}`,
    memo,
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    date: payment.date,
    offProcedure,
  }
}

function deskRow(payment: MptPayment, input: LedgerInput): LedgerRow {
  const units = `${formatUnits(payment.amountRaw)} ${input.ticker}`
  const ref = orderRefOf(payment.memos)
  const base = { hash: payment.hash, ledgerIndex: payment.ledgerIndex, date: payment.date }
  if (payment.destination === input.issuer) {
    return { ...base, stamp: 'REDEEM', title: `Returned ${units} to the Register for cancellation`, memo: ref ?? '(no memo)' }
  }
  return {
    ...base,
    stamp: 'DELIVER',
    title: `Delivered ${units} to ${shortAddress(payment.destination)}`,
    memo: ref ?? '(no order reference)',
  }
}

export function buildRegisterLedger(input: LedgerInput): LedgerRow[] {
  const rows = [...input.issuerPayments.map((p) => issueRow(p, input)), ...input.deskPayments.map((p) => deskRow(p, input))]
  return rows.sort((a, b) => (b.ledgerIndex ?? 0) - (a.ledgerIndex ?? 0))
}
