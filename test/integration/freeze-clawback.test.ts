import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getTransactionResult, submitAndNormalizeFailures, submitMultisigned } from '../../src/lib/multisig.js'
import { assertTesSuccess } from '../../src/lib/txResult.js'
import { buildClawbackTx, buildMptLockTx, buildMptPaymentTx } from '../../src/lib/mpt.js'
import { startLocalNetwork, type LocalNetworkHandle } from '../helpers/localNetwork.js'
import { connectClient, setupAuthorizedHolder, setupIssuer, testEnv } from '../helpers/fixtures.js'

const LSF_MPT_LOCKED = 0x00000001

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

      assertTesSuccess(
        await submitMultisigned(client, buildMptPaymentTx(issuer.address, holder.address, mptIssuanceId, '1000'), issuer.signers.slice(0, issuer.quorum)),
        'mint to holder',
      )

      const lockResult = await submitMultisigned(client, buildMptLockTx(issuer.address, mptIssuanceId, true, holder.address), issuer.signers.slice(0, issuer.quorum))
      assertTesSuccess(lockResult, 'MPTokenIssuanceSet lock')

      const lockedMpt = await client.request({ command: 'account_objects', account: holder.address, type: 'mptoken' })
      const lockedFlags = (lockedMpt.result.account_objects[0] as { Flags?: number }).Flags ?? 0
      expect(lockedFlags & LSF_MPT_LOCKED).not.toBe(0)

      // A locked holder's balance can't be transferred elsewhere. `holder` is a
      // plain (non-multisig) wallet, so it signs with its own regular key.
      const blockedTransferTx = await client.autofill(buildMptPaymentTx(holder.address, otherHolder.address, mptIssuanceId, '100'))
      const signedBlockedTransfer = holder.sign(blockedTransferTx)
      const blockedTransferResult = await submitAndNormalizeFailures(client, signedBlockedTransfer.tx_blob)
      expect(getTransactionResult(blockedTransferResult)).not.toBe('tesSUCCESS')

      const unlockResult = await submitMultisigned(client, buildMptLockTx(issuer.address, mptIssuanceId, false, holder.address), issuer.signers.slice(0, issuer.quorum))
      assertTesSuccess(unlockResult, 'MPTokenIssuanceSet unlock')

      const unlockedMpt = await client.request({ command: 'account_objects', account: holder.address, type: 'mptoken' })
      const unlockedFlags = (unlockedMpt.result.account_objects[0] as { Flags?: number }).Flags ?? 0
      expect(unlockedFlags & LSF_MPT_LOCKED).toBe(0)
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

      assertTesSuccess(
        await submitMultisigned(client, buildMptPaymentTx(issuer.address, holder.address, mptIssuanceId, '1000'), issuer.signers.slice(0, issuer.quorum)),
        'mint to holder',
      )

      const clawbackResult = await submitMultisigned(
        client,
        buildClawbackTx(issuer.address, mptIssuanceId, holder.address, '300'),
        issuer.signers.slice(0, issuer.quorum),
      )
      assertTesSuccess(clawbackResult, 'Clawback')

      const holderMpt = await client.request({ command: 'account_objects', account: holder.address, type: 'mptoken' })
      expect((holderMpt.result.account_objects[0] as { MPTAmount?: string }).MPTAmount).toBe('700')

      const issuance = await client.request({ command: 'ledger_entry', mpt_issuance: mptIssuanceId })
      expect((issuance.result.node as { OutstandingAmount?: string }).OutstandingAmount).toBe('700')
    } finally {
      await client.disconnect()
    }
  })
})
