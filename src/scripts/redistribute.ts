import { isValidClassicAddress } from 'xrpl'
import { connectClient } from '../lib/client.js'
import { localSigners, submitMultisigned } from '../lib/multisig.js'
import { buildMptPaymentTx } from '../lib/mpt.js'
import { loadDeploymentState, requireGovernance, requireMptIssuanceId } from '../lib/config.js'

function parseArgs(argv: string[]): { destination: string; amount: string } {
  const [destination, amount] = argv
  if (!destination || !isValidClassicAddress(destination)) {
    throw new Error('Usage: npm run redistribute -- <destinationAddress> <amount>')
  }
  if (!amount || !/^\d+$/.test(amount)) {
    throw new Error('Usage: npm run redistribute -- <destinationAddress> <amount>\n  <amount> must be a whole non-negative integer.')
  }
  return { destination, amount }
}

async function main(): Promise<void> {
  const { destination, amount } = parseArgs(process.argv.slice(2))

  const state = loadDeploymentState()
  const governance = requireGovernance(state)
  const mptIssuanceId = requireMptIssuanceId(state)

  const { client, network } = await connectClient()
  try {
    console.log(`Connected to ${network.name} (${network.wsUrl}).`)
    console.log(`Sending ${amount} unit(s) from governance (${governance.address}) to ${destination}...`)

    const paymentTx = buildMptPaymentTx(governance.address, destination, mptIssuanceId, amount)
    const result = await submitMultisigned(client, paymentTx, localSigners(governance.signers, governance.quorum))
    console.log(`Redistribution succeeded (tx hash: ${result.result.hash}).`)
  } finally {
    await client.disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
