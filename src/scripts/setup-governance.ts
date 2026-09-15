import { connectClient } from '../lib/client.js'
import { fundNewWallet, fundSignerWallets } from '../lib/fund.js'
import { establishMultisigAndDisableMasterKey } from '../lib/accountSetup.js'
import { submitMultisigned } from '../lib/multisig.js'
import { assertTesSuccess } from '../lib/txResult.js'
import { buildMptAuthorizeTx } from '../lib/mpt.js'
import { loadDeploymentState, requireMptIssuanceId, saveDeploymentState } from '../lib/config.js'

const SIGNER_COUNT = 3
const SIGNER_QUORUM = 2

async function main(): Promise<void> {
  const state = loadDeploymentState()
  if (state.governance) {
    console.log(`Governance already set up at ${state.governance.address}.`)
    console.log('Delete .deployment.json (or its "governance" field) to redo this from scratch.')
    return
  }
  const mptIssuanceId = requireMptIssuanceId(state)

  const { client, network } = await connectClient()
  try {
    console.log(`Connected to ${network.name} (${network.wsUrl}).`)

    const governance = await fundNewWallet(client, network)
    console.log(`Funded governance account: ${governance.address}`)

    const signers = await fundSignerWallets(client, network, SIGNER_COUNT)
    console.log(`Funded ${signers.length} placeholder governance signer wallets: ${signers.map((s) => s.address).join(', ')}`)

    await establishMultisigAndDisableMasterKey(client, governance, signers, SIGNER_QUORUM)
    console.log(`Configured ${SIGNER_QUORUM}-of-${SIGNER_COUNT} multisig and disabled the governance account's master key.`)

    const authorizeTx = buildMptAuthorizeTx(governance.address, mptIssuanceId)
    const authorizeResult = await submitMultisigned(client, authorizeTx, signers.slice(0, SIGNER_QUORUM))
    assertTesSuccess(authorizeResult, 'MPTokenAuthorize')
    console.log('Governance account authorized to hold the MPT.')

    saveDeploymentState({
      ...state,
      governance: { address: governance.address, seed: governance.seed!, signers, quorum: SIGNER_QUORUM },
    })
    console.log('Saved governance state to .deployment.json.')
  } finally {
    await client.disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
