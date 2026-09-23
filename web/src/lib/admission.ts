import type { TextMemo } from 'xrpl'
import type { IssuanceTransaction } from './xrplClient'

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

/** Each account's latest admission request (a holder setting up its own holding), newest first. */
export function admissionRequestsOf(transactions: IssuanceTransaction[], issuer: string): AdmissionRequest[] {
  const latest = new Map<string, AdmissionRequest>()
  for (const tx of newestFirst(transactions)) {
    if (!isAuthorize(tx) || tx.account === issuer || tx.holder !== undefined || latest.has(tx.account)) continue
    latest.set(tx.account, { account: tx.account, hash: tx.hash, ledgerIndex: tx.ledgerIndex, date: tx.date })
  }
  return [...latest.values()]
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
