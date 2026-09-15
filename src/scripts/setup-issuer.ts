import { connectClient } from '../lib/client.js'
import { fundNewWallet, fundSignerWallets } from '../lib/fund.js'
import { establishMultisigAndDisableMasterKey } from '../lib/accountSetup.js'
import { submitMultisigned } from '../lib/multisig.js'
import { assertTesSuccess } from '../lib/txResult.js'
import { buildMptIssuanceCreateTx } from '../lib/mpt.js'
import { buildMptMetadataHex, readTokenMetadataConfig } from '../lib/metadata.js'
import { loadDeploymentState, saveDeploymentState } from '../lib/config.js'

const SIGNER_COUNT = 3
const SIGNER_QUORUM = 2

async function main(): Promise<void> {
  const state = loadDeploymentState()
  if (state.issuer) {
    console.log(`Issuer already set up at ${state.issuer.address} (mpt_issuance_id: ${state.mptIssuanceId}).`)
    console.log('Delete .deployment.json (or its "issuer"/"mptIssuanceId" fields) to redo this from scratch.')
    return
  }

  const { client, network } = await connectClient()
  try {
    console.log(`Connected to ${network.name} (${network.wsUrl}).`)

    const issuer = await fundNewWallet(client, network)
    console.log(`Funded issuer account: ${issuer.address}`)

    const signers = await fundSignerWallets(client, network, SIGNER_COUNT)
    console.log(`Funded ${signers.length} placeholder issuer signer wallets: ${signers.map((s) => s.address).join(', ')}`)

    await establishMultisigAndDisableMasterKey(client, issuer, signers, SIGNER_QUORUM)
    console.log(`Configured ${SIGNER_QUORUM}-of-${SIGNER_COUNT} multisig and disabled the issuer's master key.`)

    const metadataHex = buildMptMetadataHex(readTokenMetadataConfig())
    const issuanceTx = buildMptIssuanceCreateTx(issuer.address, metadataHex)
    const issuanceResult = await submitMultisigned(client, issuanceTx, signers.slice(0, SIGNER_QUORUM))
    assertTesSuccess(issuanceResult, 'MPTokenIssuanceCreate')
    const mptIssuanceId = (issuanceResult.result.meta as { mpt_issuance_id?: string }).mpt_issuance_id
    if (!mptIssuanceId) {
      throw new Error('MPTokenIssuanceCreate succeeded but no mpt_issuance_id was returned.')
    }
    console.log(`Created MPT issuance: ${mptIssuanceId}`)

    saveDeploymentState({
      ...state,
      network: network.name,
      issuer: { address: issuer.address, seed: issuer.seed!, signers, quorum: SIGNER_QUORUM },
      mptIssuanceId,
    })
    console.log('Saved issuer state to .deployment.json.')
  } finally {
    await client.disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
