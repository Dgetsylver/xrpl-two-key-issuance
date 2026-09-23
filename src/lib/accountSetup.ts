import { AccountSetAsfFlags, type WalletClient } from 'xrpl'
import type { SignerWallet } from './config.js'
import { signerListFields } from './multisig.js'

/** Establish the signer quorum before disabling the master key. Either failure throws. */
export async function establishMultisigAndDisableMasterKey(
  client: WalletClient,
  signers: SignerWallet[],
  quorum: number,
): Promise<void> {
  await client.tx.signerListSet(signerListFields(signers, quorum)).signAndSubmit()
  await client.tx.accountSet({ SetFlag: AccountSetAsfFlags.asfDisableMaster }).signAndSubmit()
}
