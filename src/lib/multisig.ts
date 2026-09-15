import { Client, Wallet, multisign as combineMultisignedBlobs, type SignerListSet, type SubmittableTransaction, type TxResponse } from 'xrpl'
import type { SignerWallet } from './config.js'
import { assertTesSuccess, getTransactionResult } from './txResult.js'

export { assertTesSuccess, getTransactionResult }

/**
 * Builds an (unsigned) SignerListSet transaction establishing a placeholder
 * N-of-M multisig on `account`. Each signer gets equal weight (1), so the
 * quorum is simply the number of required signatures.
 */
export function buildSignerListSetTx(account: string, signers: SignerWallet[], quorum: number): SignerListSet {
  if (quorum < 1 || quorum > signers.length) {
    throw new Error(`Invalid quorum ${quorum} for ${signers.length} signer(s).`)
  }
  return {
    TransactionType: 'SignerListSet',
    Account: account,
    SignerQuorum: quorum,
    SignerEntries: signers.map((signer) => ({
      SignerEntry: {
        Account: signer.address,
        SignerWeight: 1,
      },
    })),
  }
}

export type ExpiryMode =
  /** Set a very large LastLedgerSequence window (see CEREMONY_LEDGER_OFFSET
   * below) so the transaction stays valid long enough for a real, possibly
   * slow, multi-person signing ceremony. This is the default. */
  | 'ceremony'
  /** Keep the short (~1-2 minute) LastLedgerSequence window that
   * `client.autofill` sets by default -- only appropriate for fast,
   * fully-automated flows such as local integration tests. */
  | 'fast'

export interface SubmitMultisignedOptions {
  expiry?: ExpiryMode
}

/**
 * How many ledgers beyond the current one a "ceremony" mode transaction
 * remains valid for. xrpl.js's submitAndWait refuses to submit a
 * transaction with no LastLedgerSequence at all (it considers that unsafe
 * for reliable submission), so instead of omitting it we set a very
 * generous window -- on a live network closing ledgers every few seconds,
 * this is on the order of weeks, comfortably covering a slow, multi-person
 * signing ceremony.
 */
const CEREMONY_LEDGER_OFFSET = 1_000_000

/**
 * Prepares `tx` for multisigning (fee sized for `signerWallets.length`
 * signatures, per XRPL's multisig fee rule), collects one signature per
 * wallet in `signerWallets`, combines them, and submits.
 *
 * Does not throw on a non-tesSUCCESS engine result -- callers decide whether
 * that's an expected failure (e.g. a negative test) or should raise (see
 * `assertTesSuccess`).
 */
export async function submitMultisigned(
  client: Client,
  tx: SubmittableTransaction,
  signerWallets: SignerWallet[],
  options: SubmitMultisignedOptions = {},
): Promise<TxResponse<SubmittableTransaction>> {
  const expiry = options.expiry ?? 'ceremony'

  const prepared = await client.autofill(tx, signerWallets.length)
  // Multisigned transactions must not carry a single-key SigningPubKey.
  ;(prepared as Record<string, unknown>).SigningPubKey = ''
  if (expiry === 'ceremony') {
    const currentLedger = await client.getLedgerIndex()
    ;(prepared as Record<string, unknown>).LastLedgerSequence = currentLedger + CEREMONY_LEDGER_OFFSET
  }

  const signedBlobs = signerWallets.map((signer) => {
    const wallet = Wallet.fromSeed(signer.seed)
    const { tx_blob } = wallet.sign(prepared, true)
    return tx_blob
  })

  const combinedBlob = combineMultisignedBlobs(signedBlobs)
  return submitAndNormalizeFailures(client, combinedBlob)
}

/**
 * Wraps `client.submitAndWait`. When a transaction is preliminarily
 * rejected (e.g. `tefBAD_QUORUM` for too few signatures) and then expires
 * without ever entering a ledger, xrpl.js throws an `XrplError` instead of
 * returning a result -- which would defeat the "never throws on a
 * non-success engine result" contract this module documents. This catches
 * that specific shape and turns it back into an ordinary failed result so
 * callers (including tests asserting on expected failures) have one
 * consistent, non-throwing interface.
 */
export async function submitAndNormalizeFailures(
  client: Client,
  combinedBlob: string,
): Promise<TxResponse<SubmittableTransaction>> {
  try {
    return await client.submitAndWait(combinedBlob)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const match = /Preliminary result: (\w+)/.exec(message)
    if (match) {
      return {
        result: { meta: { TransactionResult: match[1] } },
      } as unknown as TxResponse<SubmittableTransaction>
    }
    throw err
  }
}

