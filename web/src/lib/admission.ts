import type { TextMemo } from 'xrpl'
import { formatShortDate, shortAddress } from './format'
import type { ReadinessNotice } from './readiness'
import type { IssuanceTransaction, MptHolding, MptPayment } from './xrplClient'

/**
 * Holder admission under RequireAuth. An investor's account asks to hold
 * units by creating an empty holding (its own MPTokenAuthorize); two
 * Register keys then admit it (the issuer's MPTokenAuthorize naming the
 * account as `Holder`), relying on the KYC the Dealing Desk has completed
 * off-ledger. The admission carries a `kyc-ref` memo naming that KYC file,
 * e.g. `ADM-0007 · Desk KYC reliance`. Nothing on the ledger checks the
 * reference; it's the public trail that makes a missing one visible.
 */
export const KYC_MEMO_TYPE = 'kyc-ref'
export const KYC_RELIANCE = 'Desk KYC reliance'

/** `tfMPTUnauthorize`: from a holder, withdraws its holding; from the issuer, revokes an admission. */
const TF_MPT_UNAUTHORIZE = 0x00000001

export interface Admission {
  holder: string
  memos: TextMemo[]
  hash?: string
  ledgerIndex?: number
  sequence?: number
  date?: Date
}

export interface AdmissionRequest {
  /** The account that set up a holding, asking to be admitted. */
  account: string
  hash?: string
  ledgerIndex?: number
  date?: Date
}

function newestFirst<T extends { ledgerIndex?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.ledgerIndex ?? 0) - (a.ledgerIndex ?? 0))
}

function isAuthorize(tx: IssuanceTransaction): boolean {
  return tx.type === 'MPTokenAuthorize' && (tx.flags & TF_MPT_UNAUTHORIZE) === 0
}

/** Every admission by the Register (`issuer`), newest first. */
export function admissionsOf(transactions: IssuanceTransaction[], issuer: string): Admission[] {
  return newestFirst(
    transactions
      .filter((tx) => isAuthorize(tx) && tx.account === issuer && tx.holder !== undefined && tx.holder !== issuer)
      .map((tx) => ({ holder: tx.holder!, memos: tx.memos, hash: tx.hash, ledgerIndex: tx.ledgerIndex, sequence: tx.sequence, date: tx.date })),
  )
}

/**
 * Each account's latest admission request (a holder setting up its own
 * holding), newest first. A holder that withdrew since (its own
 * tfMPTUnauthorize, which deletes the empty holding) has none.
 */
export function admissionRequestsOf(transactions: IssuanceTransaction[], issuer: string): AdmissionRequest[] {
  const latest = new Map<string, AdmissionRequest | null>()
  for (const tx of newestFirst(transactions)) {
    if (tx.type !== 'MPTokenAuthorize' || tx.account === issuer || tx.holder !== undefined || latest.has(tx.account)) continue
    latest.set(tx.account, isAuthorize(tx) ? { account: tx.account, hash: tx.hash, ledgerIndex: tx.ledgerIndex, date: tx.date } : null)
  }
  return [...latest.values()].filter((request): request is AdmissionRequest => request !== null)
}

/**
 * Requests with no admission after them, newest first: the accounts that
 * may be awaiting admission. History only; read each holding before acting
 * on it (a holder can withdraw its request).
 */
export function unadmittedRequests(requests: AdmissionRequest[], admissions: Admission[], exclude: string[] = []): AdmissionRequest[] {
  return requests.filter(
    (request) =>
      !exclude.includes(request.account) &&
      !admissions.some((admission) => admission.holder === request.account && (admission.ledgerIndex ?? 0) >= (request.ledgerIndex ?? 0)),
  )
}

/** When `address` was last admitted to the register, if the history shows it. */
export function admittedOn(admissions: Admission[], address: string): Date | undefined {
  return newestFirst(admissions).find((admission) => admission.holder === address)?.date
}

/**
 * The Dealing Desk KYC reference an admission's memo carries: the `kyc-ref`
 * memo's data without the reliance suffix (`ADM-0007 · Desk KYC reliance`
 * gives `ADM-0007`). Undefined when there's none.
 */
export function kycReferenceOf(memos: TextMemo[]): string | undefined {
  const data = memos.find((memo) => memo.type === KYC_MEMO_TYPE && memo.data?.trim())?.data
  if (!data) return undefined
  const reference = data
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && part !== KYC_RELIANCE)
    .join(' · ')
  return reference || undefined
}

/** The admission memo for a KYC reference: `{ type: 'kyc-ref', data: 'ADM-0007 · Desk KYC reliance' }`. */
export function admissionMemo(reference: string): TextMemo {
  return { type: KYC_MEMO_TYPE, data: `${reference.trim()} · ${KYC_RELIANCE}` }
}

/** The next `ADM-NNNN` reference: one past the highest on the ledger, `ADM-0001` when there's none. */
export function suggestAdmissionRef(admissions: Admission[]): string {
  const numbers = admissions
    .map((admission) => /^ADM-(\d+)$/.exec(kycReferenceOf(admission.memos) ?? '')?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1
  return `ADM-${String(next).padStart(4, '0')}`
}

/**
 * Whether the ledger would accept an admission of this account now:
 * `ready` when it has asked (it has a holding) and isn't admitted yet. The
 * co-signer's GhostSig submits without a preflight, so an admission the
 * ledger rejects still spends its fee and sequence.
 */
export type AdmissionState = 'ready' | 'no-holding' | 'already-admitted' | 'not-required'

export function admissionState(holding: Pick<MptHolding, 'hasHolding' | 'admitted'>, requireAuth: boolean): AdmissionState {
  if (!requireAuth) return 'not-required'
  if (!holding.hasHolding) return 'no-holding'
  return holding.admitted ? 'already-admitted' : 'ready'
}

/** Plain copy for an admission that isn't `ready`, as a blocking notice; null when it is. */
export function admissionNotice(state: AdmissionState, holder: string, ticker: string): ReadinessNotice | null {
  const who = shortAddress(holder)
  switch (state) {
    case 'ready':
      return null
    case 'no-holding':
      return {
        blocked: true,
        label: 'No admission request',
        lines: [
          `${who} hasn't requested admission: it has no ${ticker} holding on the ledger, so the ledger would reject an admission. The investor connects on the fund overview and requests admission first.`,
        ],
      }
    case 'already-admitted':
      return { blocked: true, label: 'Already on the register', lines: [`${who} is already admitted. Admitting it again changes nothing.`] }
    case 'not-required':
      return {
        blocked: true,
        label: 'No admission on this issuance',
        lines: ["This issuance doesn't set RequireAuth, so any wallet can hold units and the ledger would reject an admission."],
      }
  }
}

export interface InvestorPick {
  address: string
  /** Right-hand status: 'Admitted' or 'Awaiting admission' under RequireAuth, else the last delivery; 'Stop-transfer in place' for a stopped holding. */
  status: string
  pending: boolean
}

export const STOPPED_STATUS = 'Stop-transfer in place'

export interface InvestorPicksInput {
  /** Desk deliveries, newest first. */
  deliveries: MptPayment[]
  /** Register admissions, newest first. */
  admissions: Admission[]
  /** Requests confirmed as still awaiting admission, newest first. */
  pending: AdmissionRequest[]
  /** Accounts never listed (the Register and the Desk). */
  exclude: string[]
  requireAuth: boolean
  /** Listed accounts whose holding has a stop-transfer in place, read from the ledger. */
  stopped?: ReadonlySet<string>
  now?: Date
}

/**
 * The Deliver units investor list: accounts on the register first (the
 * newest deliveries, then admissions), then accounts awaiting admission,
 * which the Desk can't deliver to yet. On an open issuance it's the Phase 1
 * list of past delivery destinations. A holding with a stop-transfer in
 * place (`stopped`) says so and goes after the others: the Desk can't
 * deliver to it either.
 */
export function investorPicks(input: InvestorPicksInput, limits: { known: number; pending: number } = { known: 5, pending: 3 }): InvestorPick[] {
  const seen = new Set(input.exclude)
  const known: InvestorPick[] = []
  const add = (address: string, status: string) => {
    if (seen.has(address) || known.length >= limits.known) return
    seen.add(address)
    known.push({ address, status, pending: false })
  }
  for (const payment of input.deliveries) {
    const status = input.requireAuth
      ? 'Admitted'
      : payment.date
        ? `Last delivery ${formatShortDate(payment.date, input.now)}`
        : 'Delivered before'
    add(payment.destination, status)
  }
  if (input.requireAuth) for (const admission of input.admissions) add(admission.holder, 'Admitted')
  const stopped = input.stopped ?? new Set<string>()
  const listed = [
    ...known.filter((pick) => !stopped.has(pick.address)),
    ...known.filter((pick) => stopped.has(pick.address)).map((pick) => ({ ...pick, status: STOPPED_STATUS })),
  ]
  if (!input.requireAuth) return listed
  const pending = input.pending
    .filter((request) => !seen.has(request.account))
    .slice(0, limits.pending)
    .map((request) => ({ address: request.account, status: 'Awaiting admission', pending: true }))
  return [...listed, ...pending]
}
