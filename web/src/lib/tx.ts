// Reuses this repo's existing, unmodified transaction builders -- the same
// ones the CLI scripts and integration tests use -- rather than
// re-implementing transaction shapes in the browser.
import { buildMptAuthorizeTx, buildMptPaymentTx, type MemoInput } from '../../../src/lib/mpt.js'
import { computeMultisigFeeDrops } from './xrplClient'

export { buildMptAuthorizeTx, buildMptPaymentTx }
export type { MemoInput }

/**
 * Builds a fresh multisig Payment proposal (a mint, issuer -> governance, or
 * a disbursement, governance -> any recipient): `SigningPubKey` is cleared
 * (GHOSTSIG's signal that this starts a new co-signing chain) and `Fee` is
 * sized for the account's quorum. `Sequence`/`LastLedgerSequence` are left
 * unset for GHOSTSIG to fill in for its own connected account.
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
  tx.Fee = await computeMultisigFeeDrops(quorum)
  return tx
}
