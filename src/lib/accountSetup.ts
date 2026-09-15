import { AccountSetAsfFlags, Client, Wallet } from 'xrpl'
import type { SignerWallet } from './config.js'
import { buildSignerListSetTx } from './multisig.js'
import { assertTesSuccess } from './txResult.js'

/**
 * Establishes a placeholder N-of-M multisig on `account` and immediately
 * disables its master key, in that order. After this returns, `account`'s
 * master key can no longer sign anything -- every future transaction from
 * this account (including ones this same setup script sends next, like
 * MPTokenIssuanceCreate or MPTokenAuthorize) must go through the signer
 * quorum. Each step is checked for `tesSUCCESS` before proceeding, since a
 * mistake after the master-key-disable step can only be corrected via the
 * multisig itself.
 */
export async function establishMultisigAndDisableMasterKey(
  client: Client,
  account: Wallet,
  signers: SignerWallet[],
  quorum: number,
): Promise<void> {
  const signerListSetTx = await client.autofill(buildSignerListSetTx(account.address, signers, quorum))
  const signerListSetResult = await client.submitAndWait(account.sign(signerListSetTx).tx_blob)
  assertTesSuccess(signerListSetResult, `SignerListSet for ${account.address}`)

  const disableMasterKeyTx = await client.autofill({
    TransactionType: 'AccountSet',
    Account: account.address,
    SetFlag: AccountSetAsfFlags.asfDisableMaster,
  })
  const disableMasterKeyResult = await client.submitAndWait(account.sign(disableMasterKeyTx).tx_blob)
  assertTesSuccess(disableMasterKeyResult, `AccountSet asfDisableMaster for ${account.address}`)
}
