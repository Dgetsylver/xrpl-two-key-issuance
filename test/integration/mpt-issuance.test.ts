import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { decodeMPTokenMetadata } from 'xrpl'
import { startLocalNetwork, type LocalNetworkHandle } from '../helpers/localNetwork.js'
import { connectClient, setupIssuer, testEnv } from '../helpers/fixtures.js'

describe('MPT issuance', () => {
  let network: LocalNetworkHandle

  beforeAll(async () => {
    network = await startLocalNetwork()
  })

  afterAll(async () => {
    await network.teardown()
  })

  it('is created with the expected flags, no supply cap, whole-unit scale, and correct metadata; issuer master key ends up disabled', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)

      const issuance = await client.request({ command: 'ledger_entry', mpt_issuance: mptIssuanceId })
      const node = issuance.result.node as {
        Flags?: number
        AssetScale?: number
        MaximumAmount?: string
        OutstandingAmount?: string
        MPTokenMetadata?: string
        Issuer?: string
      }

      // tfMPTCanLock (2) | tfMPTCanTransfer (32) | tfMPTCanClawback (64) = 98
      expect(node.Flags).toBe(98)
      expect(node.AssetScale ?? 0).toBe(0)
      expect(node.MaximumAmount).toBeUndefined()
      expect(node.OutstandingAmount).toBe('0')
      expect(node.Issuer).toBe(issuer.address)

      const decoded = decodeMPTokenMetadata(node.MPTokenMetadata!)
      expect(decoded.ticker).toBe(env.TOKEN_TICKER)
      expect(decoded.name).toBe(env.TOKEN_NAME)

      const accountInfo = await client.request({ command: 'account_info', account: issuer.address })
      expect(accountInfo.result.account_flags?.disableMasterKey).toBe(true)
    } finally {
      await client.disconnect()
    }
  })
})
