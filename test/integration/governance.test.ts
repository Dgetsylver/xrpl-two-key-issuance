import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readMptHolding } from '../../src/lib/ledger.js'
import { submitMultisigned } from '../../src/lib/multisig.js'
import { buildMptPaymentTx } from '../../src/lib/mpt.js'
import { startLocalNetwork, type LocalNetworkHandle } from '../helpers/localNetwork.js'
import { connectClient, setupAuthorizedHolder, setupGovernance, setupIssuer, testEnv } from '../helpers/fixtures.js'

describe('governance', () => {
  let network: LocalNetworkHandle

  beforeAll(async () => {
    network = await startLocalNetwork()
  })

  afterAll(async () => {
    await network.teardown()
  })

  it('is set up with a 2-of-3 SignerList, a disabled master key, and successful MPTokenAuthorize', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const governance = await setupGovernance(client, netCfg, mptIssuanceId)

      const signerLists = await client.command.accountObjects({ account: governance.address, type: 'signer_list' })
      const signerList = signerLists.result.account_objects[0]
      expect(signerList?.SignerQuorum).toBe(2)
      expect(signerList?.SignerEntries).toHaveLength(3)

      const accountInfo = await client.command.accountInfo({ account: governance.address })
      expect(accountInfo.result.account_flags?.disableMasterKey).toBe(true)

      const mptObjects = await client.command.accountObjects({ account: governance.address, type: 'mptoken' })
      expect(mptObjects.result.account_objects).toHaveLength(1)
      const holding = await readMptHolding(client, governance.address, mptIssuanceId)
      expect(holding).toBeDefined()
      expect(holding?.MPTAmount ?? '0').toBe('0')
    } finally {
      await client.disconnect()
    }
  })

  it('can redistribute a balance to an authorized recipient via 2-of-3 multisig', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const governance = await setupGovernance(client, netCfg, mptIssuanceId)
      const recipient = await setupAuthorizedHolder(client, netCfg, mptIssuanceId)

      await submitMultisigned(
        client,
        buildMptPaymentTx(issuer.address, governance.address, mptIssuanceId, '1000'),
        issuer.signers.slice(0, issuer.quorum),
      )

      await submitMultisigned(
        client,
        buildMptPaymentTx(governance.address, recipient.address, mptIssuanceId, '400'),
        governance.signers.slice(0, governance.quorum),
      )

      const recipientMpt = await readMptHolding(client, recipient.address, mptIssuanceId)
      expect(recipientMpt?.MPTAmount).toBe('400')

      const governanceMpt = await readMptHolding(client, governance.address, mptIssuanceId)
      expect(governanceMpt?.MPTAmount).toBe('600')
    } finally {
      await client.disconnect()
    }
  })
})
