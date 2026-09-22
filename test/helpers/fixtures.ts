import { Client, Wallet } from 'xrpl'
import { connectClient } from '../../src/lib/client.js'
import { fundNewWallet, fundSignerWallets } from '../../src/lib/fund.js'
import { establishMultisigAndDisableMasterKey } from '../../src/lib/accountSetup.js'
import { assertTesSuccess } from '../../src/lib/txResult.js'
import { buildMptAuthorizeTx, buildMptIssuanceCreateTx } from '../../src/lib/mpt.js'
import { buildMptMetadataHex, readTokenMetadataConfig } from '../../src/lib/metadata.js'
import type { AccountState } from '../../src/lib/config.js'
import type { NetworkConfig } from '../../src/lib/network.js'

export const SIGNER_COUNT = 3
export const SIGNER_QUORUM = 2

export function testEnv(wsUrl: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    XRPL_NETWORK: 'local',
    XRPL_WS_URL: wsUrl,
    TOKEN_TICKER: 'TEST',
    TOKEN_NAME: 'Test Token',
    TOKEN_ICON_URL: 'https://example.org/icon.png',
    TOKEN_ASSET_CLASS: 'other',
    TOKEN_ISSUER_NAME: 'Test Issuer',
  }
}

async function toAccountState(wallet: Wallet, signers: AccountState['signers'], quorum: number): Promise<AccountState> {
  return { address: wallet.address, seed: wallet.seed!, signers, quorum }
}

/**
 * Funds and fully configures an issuer account (single-sig issuance, then
 * multisig + disabled master key) exactly like `setup-issuer.ts`.
 */
export async function setupIssuer(client: Client, network: NetworkConfig, env: NodeJS.ProcessEnv): Promise<{ issuer: AccountState; mptIssuanceId: string }> {
  const issuerWallet = await fundNewWallet(client, network)
  const signers = await fundSignerWallets(client, network, SIGNER_COUNT)

  const metadataHex = buildMptMetadataHex(readTokenMetadataConfig(env))
  const issuanceTx = await client.autofill(buildMptIssuanceCreateTx(issuerWallet.address, metadataHex))
  const issuanceResult = await client.submitAndWait(issuerWallet.sign(issuanceTx).tx_blob)
  assertTesSuccess(issuanceResult, 'MPTokenIssuanceCreate')
  const mptIssuanceId = (issuanceResult.result.meta as { mpt_issuance_id?: string }).mpt_issuance_id
  if (!mptIssuanceId) throw new Error('MPTokenIssuanceCreate did not return mpt_issuance_id')

  await establishMultisigAndDisableMasterKey(client, issuerWallet, signers, SIGNER_QUORUM)

  return { issuer: await toAccountState(issuerWallet, signers, SIGNER_QUORUM), mptIssuanceId }
}

/**
 * Funds and fully configures a governance account (single-sig authorize,
 * then multisig + disabled master key) exactly like `setup-governance.ts`.
 */
export async function setupGovernance(client: Client, network: NetworkConfig, mptIssuanceId: string): Promise<AccountState> {
  const governanceWallet = await fundNewWallet(client, network)
  const signers = await fundSignerWallets(client, network, SIGNER_COUNT)

  const authorizeTx = await client.autofill(buildMptAuthorizeTx(governanceWallet.address, mptIssuanceId))
  const authorizeResult = await client.submitAndWait(governanceWallet.sign(authorizeTx).tx_blob)
  assertTesSuccess(authorizeResult, 'MPTokenAuthorize')

  await establishMultisigAndDisableMasterKey(client, governanceWallet, signers, SIGNER_QUORUM)

  return toAccountState(governanceWallet, signers, SIGNER_QUORUM)
}

/** Funds a plain holder wallet and authorizes it to hold the given MPT issuance. */
export async function setupAuthorizedHolder(client: Client, network: NetworkConfig, mptIssuanceId: string): Promise<Wallet> {
  const wallet = await fundNewWallet(client, network)
  const authTx = await client.autofill(buildMptAuthorizeTx(wallet.address, mptIssuanceId))
  const result = await client.submitAndWait(wallet.sign(authTx).tx_blob)
  assertTesSuccess(result, 'MPTokenAuthorize (holder)')
  return wallet
}

export { connectClient }
