import { Client, Wallet, multisign, type SubmittableTransaction } from 'xrpl'
import type { SignerWallet } from './config.js'

/** Equal-weight signer entries for this demo's N-of-M policy. */
export function signerListFields(signers: SignerWallet[], quorum: number) {
  if (!Number.isInteger(quorum) || quorum < 1 || quorum > signers.length) {
    throw new Error(`Invalid quorum ${quorum} for ${signers.length} signer(s).`)
  }
  if (new Set(signers.map(({ address }) => address)).size !== signers.length) {
    throw new Error('Signer addresses must be unique.')
  }
  return {
    SignerQuorum: quorum,
    SignerEntries: signers.map(({ address }) => ({
      SignerEntry: { Account: address, SignerWeight: 1 },
    })),
  }
}

/** Select locally available signers; external signers must use the browser ceremony. */
export function localSigners(signers: SignerWallet[], quorum: number): SignerWallet[] {
  signerListFields(signers, quorum)
  const available = signers.filter(({ seed }) => seed.length > 0).slice(0, quorum)
  if (available.length < quorum) {
    throw new Error(`This account needs ${quorum} signatures but only ${available.length} local signer(s) are available. Use the GhostSig browser ceremony.`)
  }
  return available
}

/**
 * Prepare and combine local signatures. The SDK does not yet have a multisig
 * builder: retain this explicit boundary until it can own the signing strategy.
 * These signatures are collected immediately, so use autofill's bounded expiry.
 */
export async function signMultisigned(client: Client, tx: SubmittableTransaction, signers: SignerWallet[]): Promise<string> {
  if (signers.length === 0 || signers.some(({ seed }) => !seed)) {
    throw new Error('Local multisigning requires a seed for every selected signer. Use GhostSig for external signers.')
  }
  const prepared = await client.autofill(tx, signers.length)
  prepared.SigningPubKey = ''
  return multisign(signers.map(({ seed }) => Wallet.fromSeed(seed).sign(prepared, true).tx_blob))
}

/** Resolves only after validated success; failures retain the SDK's original error. */
export async function submitMultisigned(client: Client, tx: SubmittableTransaction, signers: SignerWallet[]) {
  return client.submitAndWait(await signMultisigned(client, tx, signers))
}

/** Explicit outcome for callers expecting a failure, with no fabricated ledger response. */
export async function trySubmitMultisigned(client: Client, tx: SubmittableTransaction, signers: SignerWallet[]) {
  // Preparation/signing errors still throw, just like local validation errors.
  return client.trySubmitAndWait(await signMultisigned(client, tx, signers))
}
