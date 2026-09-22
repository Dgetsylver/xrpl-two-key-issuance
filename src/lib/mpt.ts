import {
  MPTokenIssuanceCreateFlags,
  MPTokenIssuanceSetFlags,
  type Clawback,
  type MPTokenAuthorize,
  type MPTokenIssuanceCreate,
  type MPTokenIssuanceSet,
  type Payment,
} from 'xrpl'

/**
 * Builds the (unsigned) MPTokenIssuanceCreate transaction for this project's
 * token: transferable, lockable, and clawback-able; no supply cap; whole
 * units only (AssetScale omitted).
 */
export function buildMptIssuanceCreateTx(issuerAddress: string, metadataHex: string): MPTokenIssuanceCreate {
  return {
    TransactionType: 'MPTokenIssuanceCreate',
    Account: issuerAddress,
    MPTokenMetadata: metadataHex,
    Flags:
      MPTokenIssuanceCreateFlags.tfMPTCanTransfer |
      MPTokenIssuanceCreateFlags.tfMPTCanLock |
      MPTokenIssuanceCreateFlags.tfMPTCanClawback,
  }
}

export function buildMptAuthorizeTx(holderAddress: string, mptIssuanceId: string): MPTokenAuthorize {
  return {
    TransactionType: 'MPTokenAuthorize',
    Account: holderAddress,
    MPTokenIssuanceID: mptIssuanceId,
  }
}

export interface MemoInput {
  /** Plain-text label describing the memo's purpose, e.g. "mint-period". */
  type: string
  /** Plain-text value, e.g. "2026". */
  data: string
}

/**
 * UTF-8-encodes and hex-encodes `value`. Deliberately avoids Node's
 * `Buffer` global (only `TextEncoder`, which is available everywhere --
 * Node and browsers alike) since this module is reused unmodified in the
 * browser bundle under `web/`.
 */
function utf8ToHex(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function toMemo({ type, data }: MemoInput): NonNullable<Payment['Memos']>[number] {
  return {
    Memo: {
      MemoType: utf8ToHex(type),
      MemoData: utf8ToHex(data),
    },
  }
}

/**
 * Builds an MPT Payment transaction. `value` is a whole-number string (no
 * decimals -- AssetScale is omitted for this token) representing the raw
 * ledger amount.
 */
export function buildMptPaymentTx(
  fromAddress: string,
  toAddress: string,
  mptIssuanceId: string,
  value: string,
  memo?: MemoInput,
): Payment {
  return {
    TransactionType: 'Payment',
    Account: fromAddress,
    Destination: toAddress,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value,
    },
    ...(memo ? { Memos: [toMemo(memo)] } : {}),
  }
}

/**
 * Builds an MPTokenIssuanceSet transaction to lock or unlock a balance.
 * Omit `holderAddress` to lock/unlock the entire issuance.
 */
export function buildMptLockTx(
  issuerAddress: string,
  mptIssuanceId: string,
  lock: boolean,
  holderAddress?: string,
): MPTokenIssuanceSet {
  return {
    TransactionType: 'MPTokenIssuanceSet',
    Account: issuerAddress,
    MPTokenIssuanceID: mptIssuanceId,
    Flags: lock ? MPTokenIssuanceSetFlags.tfMPTLock : MPTokenIssuanceSetFlags.tfMPTUnlock,
    ...(holderAddress ? { Holder: holderAddress } : {}),
  }
}

/** Builds a Clawback transaction reclaiming `value` MPT units from `holderAddress`. */
export function buildClawbackTx(
  issuerAddress: string,
  mptIssuanceId: string,
  holderAddress: string,
  value: string,
): Clawback {
  return {
    TransactionType: 'Clawback',
    Account: issuerAddress,
    Holder: holderAddress,
    Amount: {
      mpt_issuance_id: mptIssuanceId,
      value,
    },
  }
}
