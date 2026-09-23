import {
  Client,
  RippledError,
  decodeMemo,
  fetchMPTokenOrUndefined,
  parseAccountRootFlags,
  parseMPTokenFlags,
  parseMPTokenIssuanceFlags,
  rippleTimeToUnixTime,
  type MPTokenIssuanceFlagsInterface,
  type TextMemo,
} from 'xrpl'
import { suggestNextDealingDay } from './dealing'

// GHOSTSIG only understands XRPL testnet/devnet/mainnet, so this demo is
// pinned to the public Testnet -- the same network `XRPL_NETWORK=testnet`
// selects for the CLI scripts.
const TESTNET_WS_URL = 'wss://s.altnet.rippletest.net:51233'
export const TESTNET_EXPLORER_BASE = 'https://testnet.xrpl.org'

let clientPromise: Promise<Client> | undefined

/** A single shared, lazily-connected Client for the lifetime of the page. */
export async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client(TESTNET_WS_URL)
      await client.connect()
      return client
    })().catch((err) => {
      clientPromise = undefined
      throw err
    })
  }
  return clientPromise
}

export async function getOutstandingSupplyRaw(mptIssuanceId: string): Promise<string> {
  const client = await getClient()
  const res = await client.command.ledgerEntry({ mpt_issuance: mptIssuanceId })
  return res.result.node.OutstandingAmount
}

export interface MptHolding {
  authorized: boolean
  balanceRaw: string
  locked: boolean
}

/** Read confirmed holdings. A missing entry is distinct from a failed network read. */
export async function getMptHolding(address: string, mptIssuanceId: string): Promise<MptHolding> {
  const client = await getClient()
  const token = await fetchMPTokenOrUndefined(client, address, mptIssuanceId, 'validated')
  return {
    authorized: token !== undefined,
    balanceRaw: token?.MPTAmount ?? '0',
    locked: token ? Boolean(parseMPTokenFlags(token.Flags).lsfMPTLocked) : false,
  }
}

/** Advisory checks for this transfer; failed reads remain visible as errors. */
export async function destinationReadinessWarning(
  account: string,
  destination: string,
  mptIssuanceId: string,
  amount?: string,
): Promise<string | null> {
  const client = await getClient()
  const readiness = await client.getMptTransferReadiness({ account, destination, mptIssuanceId, amount })
  if (readiness.status === 'eligible') return null
  return readiness.checks
    .filter((check) => check.status !== 'pass')
    .map((check) => check.message)
    .join(' ')
}

/** Returns the account's XRP balance in drops, or `undefined` if it isn't funded/activated yet. */
export async function getXrpBalanceDrops(address: string): Promise<string | undefined> {
  const client = await getClient()
  try {
    const res = await client.command.accountInfo({ account: address })
    return res.result.account_data.Balance
  } catch (error) {
    if (error instanceof RippledError && error.code === 'actNotFound') return undefined
    throw error
  }
}

export async function isAccountFunded(address: string): Promise<boolean> {
  return (await getXrpBalanceDrops(address)) !== undefined
}

/** The issuance's live state: units in issue and its flags (including the lock that suspends dealing). */
export interface IssuanceState {
  outstandingRaw: string
  flags: MPTokenIssuanceFlagsInterface
}

export async function getIssuanceState(mptIssuanceId: string): Promise<IssuanceState> {
  const client = await getClient()
  const res = await client.command.ledgerEntry({ mpt_issuance: mptIssuanceId })
  const node = res.result.node as { OutstandingAmount?: string; Flags?: number }
  return { outstandingRaw: node.OutstandingAmount ?? '0', flags: parseMPTokenIssuanceFlags(node.Flags ?? 0) }
}

/** Whether the account's master key is disabled (so only its signer list can sign for it). */
export async function isMasterKeyDisabled(address: string): Promise<boolean> {
  const client = await getClient()
  const res = await client.command.accountInfo({ account: address })
  return Boolean(parseAccountRootFlags(res.result.account_data.Flags).lsfDisableMaster)
}

/** One validated, successful outgoing payment of the issuance, with its text memos decoded. */
export interface MptPayment {
  destination: string
  /** Delivered amount, raw ledger units. */
  amountRaw: string
  hash?: string
  ledgerIndex?: number
  sequence?: number
  date?: Date
  /** Memos that decode as UTF-8 text; binary memos are skipped. */
  memos: TextMemo[]
}

function textMemos(memos: ReadonlyArray<Parameters<typeof decodeMemo>[0]> | undefined): TextMemo[] {
  const decoded: TextMemo[] = []
  for (const memo of memos ?? []) {
    try {
      decoded.push(decodeMemo(memo))
    } catch {
      /* Binary or malformed memos carry no text. */
    }
  }
  return decoded
}

/** Every available page of `account`'s outgoing payments of this issuance whose delivered amount is known. */
export async function getOutgoingMptPayments(account: string, mptIssuanceId: string): Promise<MptPayment[]> {
  const client = await getClient()
  const { payments } = await client.getMptPaymentHistory(account, mptIssuanceId)
  return payments.flatMap(({ transaction, deliveredAmount, hash, ledgerIndex }) => {
    if (deliveredAmount === undefined) return []
    // API v1 history rows carry the close time on the transaction itself.
    const closeTime = (transaction as { date?: unknown }).date
    return [
      {
        destination: String(transaction.Destination ?? ''),
        amountRaw: deliveredAmount,
        hash,
        ledgerIndex,
        sequence: typeof transaction.Sequence === 'number' ? transaction.Sequence : undefined,
        date: typeof closeTime === 'number' ? new Date(rippleTimeToUnixTime(closeTime)) : undefined,
        memos: textMemos(transaction.Memos),
      },
    ]
  })
}

/** The dealing-day label an issue carries (memo type `mint-period`), if any. */
export function mintPeriodOf(memos: TextMemo[]): string | undefined {
  return memos.find((memo) => memo.type === 'mint-period' && memo.data)?.data
}

export interface MintRecord {
  period: string
  amountRaw: string
  hash?: string
  destination?: string
  ledgerIndex?: number
  date?: Date
}

/** Successful outgoing issues of this issuance that carry a dealing-day memo, across every available page. */
export async function getMintHistory(issuerAddress: string, mptIssuanceId: string): Promise<MintRecord[]> {
  const payments = await getOutgoingMptPayments(issuerAddress, mptIssuanceId)
  return payments.flatMap((payment) => {
    const period = mintPeriodOf(payment.memos)
    if (!period) return []
    return [
      {
        period,
        amountRaw: payment.amountRaw,
        hash: payment.hash,
        destination: payment.destination,
        ledgerIndex: payment.ledgerIndex,
        date: payment.date,
      },
    ]
  })
}

/**
 * Suggests the next dealing day (`YYYY-MM`): the month after the latest
 * dealing day on record, or the current month when there is none. Older
 * numeric labels still count when they name a month (`202610`); a bare year
 * (`2026`) doesn't.
 */
export function suggestNextMintPeriod(history: MintRecord[], now: Date = new Date()): string {
  return suggestNextDealingDay(
    history.map((record) => record.period),
    now,
  )
}

export type ProposalStatus =
  | { status: 'pending' }
  | { status: 'done'; hash?: string }
  | { status: 'superseded' }

/**
 * Checks a prepared multisig proposal: still `pending` while the account's
 * sequence hasn't moved past it, `done` once a successful payment with that
 * sequence is on the ledger, `superseded` if something else used the
 * sequence (the proposal can then never be submitted).
 */
export async function getProposalStatus(account: string, sequence: number, mptIssuanceId: string): Promise<ProposalStatus> {
  const client = await getClient()
  const info = await client.command.accountInfo({ account, ledger_index: 'validated' })
  if (info.result.account_data.Sequence <= sequence) return { status: 'pending' }
  const payments = await getOutgoingMptPayments(account, mptIssuanceId)
  const match = payments.find((payment) => payment.sequence === sequence)
  return match ? { status: 'done', hash: match.hash } : { status: 'superseded' }
}
