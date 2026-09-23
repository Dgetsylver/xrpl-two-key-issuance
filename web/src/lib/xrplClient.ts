import { Client } from 'xrpl'

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
  const res = await client.request({ command: 'ledger_entry', mpt_issuance: mptIssuanceId })
  const node = res.result.node as { OutstandingAmount?: string }
  return node.OutstandingAmount ?? '0'
}

export interface MptHolding {
  authorized: boolean
  balanceRaw: string
  locked: boolean
}

const LSF_MPT_LOCKED = 0x00000001

/** Reads a holder's MPT authorization/balance/lock status. Never throws -- an unauthorized/unfunded address just reads as `{ authorized: false, balanceRaw: '0', locked: false }`. */
export async function getMptHolding(address: string, mptIssuanceId: string): Promise<MptHolding> {
  const client = await getClient()
  try {
    const res = await client.request({ command: 'account_objects', account: address, type: 'mptoken' })
    const mptoken = res.result.account_objects.find(
      (o) => (o as { MPTokenIssuanceID?: string }).MPTokenIssuanceID === mptIssuanceId,
    ) as { MPTAmount?: string; Flags?: number } | undefined
    if (!mptoken) return { authorized: false, balanceRaw: '0', locked: false }
    return {
      authorized: true,
      balanceRaw: mptoken.MPTAmount ?? '0',
      locked: ((mptoken.Flags ?? 0) & LSF_MPT_LOCKED) !== 0,
    }
  } catch {
    return { authorized: false, balanceRaw: '0', locked: false }
  }
}

/**
 * A human-readable warning if `address` can't yet receive this MPT --
 * it hasn't self-authorized, or doesn't exist on the ledger yet -- or
 * `null` if it looks ready. A Payment to a destination that hasn't
 * authorized fails once it's actually submitted; for a multisig
 * ceremony that's only discovered when the *last* signature finally
 * reaches quorum, wasting everyone's part in collecting it. Checking
 * up front (when proposing, and again before adding a later signature)
 * catches this before anyone signs anything.
 */
export async function destinationReadinessWarning(address: string, mptIssuanceId: string, ticker: string): Promise<string | null> {
  const holding = await getMptHolding(address, mptIssuanceId)
  if (holding.authorized) return null
  return `${address} hasn't authorized themself to hold ${ticker} yet (or doesn't exist on Testnet) — sending to it will fail until it does. They can self-authorize from the dashboard once they connect with GhostSig.`
}

/** Returns the account's XRP balance in drops, or `undefined` if it isn't funded/activated yet. */
export async function getXrpBalanceDrops(address: string): Promise<string | undefined> {
  const client = await getClient()
  try {
    const res = await client.request({ command: 'account_info', account: address })
    return res.result.account_data.Balance
  } catch {
    return undefined
  }
}

export async function isAccountFunded(address: string): Promise<boolean> {
  return (await getXrpBalanceDrops(address)) !== undefined
}

/**
 * The account's current `Sequence`. GHOSTSIG refuses to autofill `Sequence`
 * for any multisig-shaped payload (an empty `SigningPubKey`/a `Signers`
 * array) -- "a multi-signed transaction is fixed by its first signer" --
 * even when it's this wallet's own account, so a ceremony proposal must
 * fetch and set it explicitly before ever calling GHOSTSIG.
 */
export async function getAccountSequence(address: string): Promise<number> {
  const client = await getClient()
  const res = await client.request({ command: 'account_info', account: address })
  return res.result.account_data.Sequence
}

/** The current network reference (base) transaction cost, in drops. */
export async function getBaseFeeDrops(): Promise<bigint> {
  const client = await getClient()
  const res = await client.request({ command: 'fee' })
  return BigInt(res.result.drops.base_fee)
}

/**
 * A multisig transaction's fee scales with the number of signatures applied
 * (base_fee * (1 + signatures)). GHOSTSIG fills in `Sequence`/
 * `LastLedgerSequence` for its own account automatically, but can't know in
 * advance how many signers a ceremony will eventually need, so this app
 * sizes `Fee` itself, for the account's configured quorum.
 */
export async function computeMultisigFeeDrops(quorum: number): Promise<string> {
  const baseFee = await getBaseFeeDrops()
  return (baseFee * BigInt(quorum + 1)).toString()
}

export interface MintRecord {
  period: string
  amountRaw: string
  hash?: string
}

function hexToUtf8(hex: string): string {
  const clean = hex.trim()
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

/**
 * Reads the issuer's `account_tx` history for `Payment`s carrying a
 * `mint-period` memo (a public, secretless ledger read) -- this is how the
 * propose-a-mint form discovers previously-used periods, instead of
 * tracking them in a local file the browser has no access to.
 */
export async function getMintHistory(issuerAddress: string): Promise<MintRecord[]> {
  const client = await getClient()
  const res = await client.request({ command: 'account_tx', account: issuerAddress, limit: 200 })
  const records: MintRecord[] = []
  for (const entry of res.result.transactions ?? []) {
    const tx = (entry as { tx?: Record<string, unknown>; tx_json?: Record<string, unknown> }).tx ?? (entry as { tx_json?: Record<string, unknown> }).tx_json
    if (!tx || tx.TransactionType !== 'Payment') continue
    const memos = (tx.Memos ?? []) as Array<{ Memo?: { MemoType?: string; MemoData?: string } }>
    for (const wrapper of memos) {
      const memo = wrapper.Memo
      if (!memo?.MemoType || hexToUtf8(memo.MemoType) !== 'mint-period') continue
      const period = memo.MemoData ? hexToUtf8(memo.MemoData) : ''
      const amount = tx.Amount as { value?: string } | undefined
      records.push({
        period,
        amountRaw: amount?.value ?? '0',
        hash: (tx as { hash?: string }).hash ?? (entry as { hash?: string }).hash,
      })
    }
  }
  return records
}

/** Suggests the next mint period: the highest numeric period on record, plus one; falls back to the current year. */
export function suggestNextMintPeriod(history: MintRecord[]): string {
  const numericPeriods = history
    .map((record) => record.period)
    .filter((period) => /^\d+$/.test(period))
    .map((period) => Number.parseInt(period, 10))
  if (numericPeriods.length === 0) return String(new Date().getFullYear())
  return String(Math.max(...numericPeriods) + 1)
}
