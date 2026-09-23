import { MPTokenFlags } from 'xrpl'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { submitMultisigned } from '../../src/lib/multisig.js'
import { buildClawbackTx, buildMptLockTx, buildMptPaymentTx } from '../../src/lib/mpt.js'
import { startLocalNetwork, type LocalNetworkHandle } from '../helpers/localNetwork.js'
import { connectClient, setupAuthorizedHolder, setupIssuer, testEnv } from '../helpers/fixtures.js'


describe('freeze and clawback', () => {
  let network: LocalNetworkHandle

  beforeAll(async () => {
    network = await startLocalNetwork()
  })

  afterAll(async () => {
    await network.teardown()
  })

  it('lets the issuer lock and unlock an individual holder balance', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const holder = await setupAuthorizedHolder(client, netCfg, mptIssuanceId)
      const otherHolder = await setupAuthorizedHolder(client, netCfg, mptIssuanceId)

      await submitMultisigned(client, buildMptPaymentTx(issuer.address, holder.address, mptIssuanceId, '1000'), issuer.signers.slice(0, issuer.quorum))

      await submitMultisigned(client, buildMptLockTx(issuer.address, mptIssuanceId, true, holder.address), issuer.signers.slice(0, issuer.quorum))

      const lockedMpt = await client.command.accountObjects({ account: holder.address, type: 'mptoken' })
      const lockedFlags = lockedMpt.result.account_objects[0]?.Flags ?? 0
      expect(lockedFlags & MPTokenFlags.lsfMPTLocked).not.toBe(0)

      // A locked holder's balance can't be transferred elsewhere. `holder` is a
      // plain (non-multisig) wallet, so it signs with its own regular key.
      const blockedTransferTx = await client.autofill(buildMptPaymentTx(holder.address, otherHolder.address, mptIssuanceId, '100'))
      const signedBlockedTransfer = holder.sign(blockedTransferTx)
      const blockedTransferResult = await client.trySubmitAndWait(signedBlockedTransfer.tx_blob)
      expect(blockedTransferResult.ok).toBe(false)
      if (!blockedTransferResult.ok) expect(blockedTransferResult.error).toMatchObject({ engineResult: 'tecLOCKED' })

      await submitMultisigned(client, buildMptLockTx(issuer.address, mptIssuanceId, false, holder.address), issuer.signers.slice(0, issuer.quorum))

      const unlockedMpt = await client.command.accountObjects({ account: holder.address, type: 'mptoken' })
      const unlockedFlags = unlockedMpt.result.account_objects[0]?.Flags ?? 0
      expect(unlockedFlags & MPTokenFlags.lsfMPTLocked).toBe(0)
    } finally {
      await client.disconnect()
    }
  })

  it('lets the issuer claw back tokens from a holder', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const holder = await setupAuthorizedHolder(client, netCfg, mptIssuanceId)

      await submitMultisigned(client, buildMptPaymentTx(issuer.address, holder.address, mptIssuanceId, '1000'), issuer.signers.slice(0, issuer.quorum))

      await submitMultisigned(
        client,
        buildClawbackTx(issuer.address, mptIssuanceId, holder.address, '300'),
        issuer.signers.slice(0, issuer.quorum),
      )

      const holderMpt = await client.command.accountObjects({ account: holder.address, type: 'mptoken' })
      expect(holderMpt.result.account_objects[0]?.MPTAmount).toBe('700')

      const issuance = await client.command.ledgerEntry({ mpt_issuance: mptIssuanceId })
      expect(issuance.result.node.OutstandingAmount).toBe('700')
    } finally {
      await client.disconnect()
    }
  })
})
