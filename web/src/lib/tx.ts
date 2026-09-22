// Reuses this repo's existing, unmodified transaction builders -- the same
// ones the CLI scripts and integration tests use -- rather than
// re-implementing transaction shapes in the browser.
import { buildMptAuthorizeTx, buildMptPaymentTx, type MemoInput } from '../../../src/lib/mpt.js'
import { computeMultisigFeeDrops, getAccountSequence } from './xrplClient'

export { buildMptAuthorizeTx, buildMptPaymentTx }
export type { MemoInput }

/**
 * Builds a fresh multisig Payment proposal (a mint, issuer -> governance, or
 * a disbursement, governance -> any recipient): `SigningPubKey` is cleared
 * (GHOSTSIG's signal that this starts a new co-signing chain), `Fee` is
 * sized for the account's quorum, and `Sequence` is fetched and set
 * explicitly. GHOSTSIG never autofills `Sequence` for a multisig-shaped
 * payload -- "a multi-signed transaction is fixed by its first signer, so
 * add it" -- even for this wallet's own account, so the app must provide it
 * itself before the very first signature. `LastLedgerSequence` is
 * deliberately left unset: a ceremony may sit for a while waiting on
 * another signer, and an unexpired proposal just becomes permanently
 * inapplicable once the account's Sequence moves past it for any other
 * reason, so there's no real downside to leaving it open-ended.
 */
export async function buildProposalPaymentTx(
  fromAddress: string,
  toAddress: string,
  mptIssuanceId: string,
  valueRaw: string,
  quorum: number,
  memo?: MemoInput,
): Promise<Record<string, unknown>> {
  const tx = buildMptPaymentTx(fromAddress, toAddress, mptIssuanceId, valueRaw, memo) as unknown as Record<string, unknown>
  tx.SigningPubKey = ''
  const [fee, sequence] = await Promise.all([computeMultisigFeeDrops(quorum), getAccountSequence(fromAddress)])
  tx.Fee = fee
  tx.Sequence = sequence
  return tx
}
