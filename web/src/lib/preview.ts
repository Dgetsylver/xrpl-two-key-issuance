import { decodeMemo, type Memo } from 'xrpl'
import { brand, type KeySet } from '../brand'
import { contractNote, isDealingDay, noteShortForm, type ContractNote } from './dealing'
import { shortAddress } from './format'
import { orderRefOf } from './ledger'
import { formatUnits } from './units'

/**
 * Plain-language description of a proposal, decoded from the transaction
 * itself -- never from a proposer's free text. The same sentence is the
 * relay message, the co-sign preview and the result line.
 *
 * A proposal is one of the procedures this demo runs, or UNRECOGNISED:
 * - issue: a Register (issuer) Payment of this issuance to the Dealing Desk,
 *   carrying the dealing day. Anything else from the Register is flagged
 *   OFF-PROCEDURE (still signable; the ledger doesn't forbid it).
 * - deliver: a Dealing Desk (governance) Payment of this issuance to an
 *   investor, carrying the order reference.
 * - return: a Dealing Desk Payment back to the Register, which cancels the
 *   units (the redemption leg).
 * - unrecognised: any other transaction type, source account, asset or
 *   malformed amount. The sign button is hidden for these.
 */
export type ProposalKind = 'issue' | 'deliver' | 'return' | 'unrecognised'

export interface ProposalContext {
  ticker: string
  mptIssuanceId?: string
  /** The Register (issuer) account. */
  issuer?: string
  /** The Dealing Desk (governance) account. */
  desk?: string
}

export interface ProposalPreview {
  kind: ProposalKind
  /** Which key set must sign. Undefined for unrecognised proposals. */
  keySet?: KeySet
  /** "Issue 235,187.958 HQUAY to the Dealing Desk for dealing day 2026-10 (€2,450,000 ÷ NAV €10.4172)" */
  sentence: string
  /** The past-tense result line, once quorum is met. */
  doneSentence: string
  /** Completes "The transaction is valid, but {reason} Check with the proposer before you sign." */
  offProcedure?: string
  /** The contract note, when the issue's units match it exactly. */
  note?: ContractNote
  day?: string
  orderRef?: string
  account: string
  destination?: string
  amountRaw?: string
  /** Every top-level field, for the record. */
  rawFields: Array<[string, string]>
}

export const OFF_PROCEDURE_SKIPS_DESK =
  'the units go straight to an investor and skip the Dealing Desk. Register issues normally go only to the Desk.'

function textMemos(tx: Record<string, unknown>) {
  const memos = Array.isArray(tx.Memos) ? (tx.Memos as Memo[]) : []
  return memos.flatMap((memo) => {
    try {
      return memo?.Memo ? [decodeMemo(memo)] : []
    } catch {
      return []
    }
  })
}

function rawValue(key: string, value: unknown): string {
  if (key === 'Flags' && typeof value === 'number') return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`
  if (key === 'Signers' && Array.isArray(value)) return `${value.length} signature${value.length === 1 ? '' : 's'}`
  if (key === 'Memos' && Array.isArray(value)) {
    const decoded = textMemos({ Memos: value })
    return decoded.length > 0 ? decoded.map((m) => `${m.type ?? '(no type)'}: ${m.data ?? ''}`).join('; ') : `${value.length} binary memo(s)`
  }
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

/** Every top-level field as display strings, signature material summarised. */
export function rawFieldsOf(tx: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(tx)
    .filter(([key, value]) => key !== 'TxnSignature' && !(key === 'SigningPubKey' && value === ''))
    .map(([key, value]) => [key, rawValue(key, value)])
}

function unrecognised(tx: Record<string, unknown>): ProposalPreview {
  return {
    kind: 'unrecognised',
    sentence: `This transaction doesn't match any ${brand.name} procedure.`,
    doneSentence: 'Submitted.',
    account: String(tx.Account ?? ''),
    destination: typeof tx.Destination === 'string' ? tx.Destination : undefined,
    rawFields: rawFieldsOf(tx),
  }
}

export function describeProposal(tx: Record<string, unknown>, ctx: ProposalContext): ProposalPreview {
  const account = typeof tx.Account === 'string' ? tx.Account : ''
  const destination = typeof tx.Destination === 'string' ? tx.Destination : ''
  const amount = tx.Amount as { mpt_issuance_id?: unknown; value?: unknown } | string | undefined
  const fromRegister = Boolean(ctx.issuer) && account === ctx.issuer
  const fromDesk = Boolean(ctx.desk) && account === ctx.desk

  if (tx.TransactionType !== 'Payment' || (!fromRegister && !fromDesk)) return unrecognised(tx)
  if (typeof amount !== 'object' || amount === null || typeof amount.value !== 'string' || !/^[1-9]\d*$/.test(amount.value)) {
    return unrecognised(tx)
  }
  if (!ctx.mptIssuanceId || amount.mpt_issuance_id !== ctx.mptIssuanceId) return unrecognised(tx)
  if (!destination || destination === account) return unrecognised(tx)

  const amountRaw = amount.value
  const units = `${formatUnits(amountRaw)} ${ctx.ticker}`
  const memos = textMemos(tx)
  const base = { account, destination, amountRaw, rawFields: rawFieldsOf(tx) }

  if (fromRegister) {
    const day = memos.find((memo) => memo.type === 'mint-period' && memo.data)?.data
    if (destination !== ctx.desk) {
      return {
        ...base,
        kind: 'issue',
        keySet: 'register',
        day,
        sentence: `Issue ${units} directly to ${shortAddress(destination)}`,
        doneSentence: `${units} issued to ${shortAddress(destination)}.`,
        offProcedure: OFF_PROCEDURE_SKIPS_DESK,
      }
    }
    if (!day) {
      return {
        ...base,
        kind: 'issue',
        keySet: 'register',
        sentence: `Issue ${units} to the Dealing Desk`,
        doneSentence: `${units} issued to the Dealing Desk.`,
        offProcedure: 'it carries no dealing-day memo, so it belongs to no dealing day.',
      }
    }
    const done = `${units} issued to the Dealing Desk for dealing day ${day}.`
    if (!isDealingDay(day)) {
      return {
        ...base,
        kind: 'issue',
        keySet: 'register',
        day,
        sentence: `Issue ${units} to the Dealing Desk for dealing day ${day}`,
        doneSentence: done,
        offProcedure: `its dealing day "${day}" isn't a YYYY-MM month.`,
      }
    }
    const note = contractNote(day)
    if (note.unitsRaw !== BigInt(amountRaw)) {
      return {
        ...base,
        kind: 'issue',
        keySet: 'register',
        day,
        sentence: `Issue ${units} to the Dealing Desk for dealing day ${day}`,
        doneSentence: done,
        offProcedure: `the units don't match the contract note for dealing day ${day} (${formatUnits(note.unitsRaw)} ${ctx.ticker} at ${noteShortForm(note)}, illustrative).`,
      }
    }
    return {
      ...base,
      kind: 'issue',
      keySet: 'register',
      day,
      note,
      sentence: `Issue ${units} to the Dealing Desk for dealing day ${day} (${noteShortForm(note)})`,
      doneSentence: done,
    }
  }

  // From the Dealing Desk.
  if (destination === ctx.issuer) {
    return {
      ...base,
      kind: 'return',
      keySet: 'desk',
      sentence: `Return ${units} to the Register for cancellation`,
      doneSentence: `${units} returned to the Register for cancellation.`,
    }
  }
  const orderRef = orderRefOf(memos)
  return {
    ...base,
    kind: 'deliver',
    keySet: 'desk',
    orderRef,
    sentence: `Deliver ${units} to ${shortAddress(destination)}${orderRef ? `, order ${orderRef}` : ', no order reference'}`,
    doneSentence: `${units} delivered to ${shortAddress(destination)}${orderRef ? `, order ${orderRef}` : ''}.`,
  }
}

// --- Legacy summary, still used by the deliver and co-sign pages until they move to describeProposal. ---

export interface PaymentPreview {
  kind: 'mint' | 'disbursement' | 'payment'
  summary: string
  account: string
  destination: string
  amountUnits: string
  period?: string
}

function findMintPeriod(tx: Record<string, unknown>): string | undefined {
  const memos = (tx.Memos ?? []) as Array<{ Memo?: { MemoType?: string; MemoData?: string } }>
  for (const wrapper of memos) {
    const memo = wrapper.Memo
    if (!memo?.MemoType) continue
    try {
      const decoded = decodeMemo({ Memo: memo })
      if (decoded.type === 'mint-period') return decoded.data
    } catch {
      /* Binary/malformed memos are not a text period. */
    }
  }
  return undefined
}

/**
 * Builds a plain-language description of a decoded Payment transaction,
 * purely from its own fields -- never from a proposer's free-text summary.
 * Used for both a fresh proposal (already known to be a mint/disbursement
 * by which page built it) and an arbitrary hand-off blob opened on `/sign`
 * (where the only way to tell is by comparing `Account` to the known
 * issuer/governance addresses).
 */
export function describePaymentTx(
  tx: Record<string, unknown>,
  ticker: string,
  issuerAddress?: string,
  governanceAddress?: string,
): PaymentPreview {
  const account = String(tx.Account ?? '')
  const destination = String(tx.Destination ?? '')
  const amount = tx.Amount as { value?: string } | undefined
  const amountUnits = amount?.value ? formatUnits(amount.value) : '0'
  const period = findMintPeriod(tx)

  if (issuerAddress && account === issuerAddress) {
    return {
      kind: 'mint',
      summary: `Mint ${amountUnits} ${ticker} to governance (${destination})${period ? ` for period "${period}"` : ''}.`,
      account,
      destination,
      amountUnits,
      period,
    }
  }
  if (governanceAddress && account === governanceAddress) {
    return {
      kind: 'disbursement',
      summary: `Disburse ${amountUnits} ${ticker} from governance to ${destination}.`,
      account,
      destination,
      amountUnits,
      period,
    }
  }
  return {
    kind: 'payment',
    summary: `Send ${amountUnits} ${ticker} from ${account} to ${destination}.`,
    account,
    destination,
    amountUnits,
    period,
  }
}
