import { toGton } from './gton'

export interface PaymentPreview {
  kind: 'mint' | 'disbursement' | 'payment'
  summary: string
  account: string
  destination: string
  amountGton: string
  period?: string
}

function hexToUtf8(hex: string): string {
  const clean = hex.trim()
  const bytes = new Uint8Array(Math.floor(clean.length / 2))
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

function findMintPeriod(tx: Record<string, unknown>): string | undefined {
  const memos = (tx.Memos ?? []) as Array<{ Memo?: { MemoType?: string; MemoData?: string } }>
  for (const wrapper of memos) {
    const memo = wrapper.Memo
    if (!memo?.MemoType) continue
    if (hexToUtf8(memo.MemoType) === 'mint-period' && memo.MemoData) {
      return hexToUtf8(memo.MemoData)
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
export function describePaymentTx(tx: Record<string, unknown>, ticker: string, issuerAddress?: string, governanceAddress?: string): PaymentPreview {
  const account = String(tx.Account ?? '')
  const destination = String(tx.Destination ?? '')
  const amount = tx.Amount as { value?: string } | undefined
  const amountGton = amount?.value ? toGton(amount.value) : '0'
  const period = findMintPeriod(tx)

  if (issuerAddress && account === issuerAddress) {
    return {
      kind: 'mint',
      summary: `Mint ${amountGton} ${ticker} to governance (${destination})${period ? ` for period "${period}"` : ''}.`,
      account,
      destination,
      amountGton,
      period,
    }
  }
  if (governanceAddress && account === governanceAddress) {
    return {
      kind: 'disbursement',
      summary: `Disburse ${amountGton} ${ticker} from governance to ${destination}.`,
      account,
      destination,
      amountGton,
      period,
    }
  }
  return {
    kind: 'payment',
    summary: `Send ${amountGton} ${ticker} from ${account} to ${destination}.`,
    account,
    destination,
    amountGton,
    period,
  }
}
