import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Wallet } from 'xrpl'
import { getTransactionResult, submitAndNormalizeFailures, submitMultisigned } from '../../src/lib/multisig.js'
import { assertTesSuccess } from '../../src/lib/txResult.js'
import { buildMptPaymentTx } from '../../src/lib/mpt.js'
import { fundNewWallet } from '../../src/lib/fund.js'
import { startLocalNetwork, type LocalNetworkHandle } from '../helpers/localNetwork.js'
import { connectClient, setupGovernance, setupIssuer, testEnv } from '../helpers/fixtures.js'

describe('mint', () => {
  let network: LocalNetworkHandle

  beforeAll(async () => {
    network = await startLocalNetwork()
  })

  afterAll(async () => {
    await network.teardown()
  })

  it('succeeds with a 2-of-3 issuer quorum and increases outstanding supply + governance balance', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const governance = await setupGovernance(client, netCfg, mptIssuanceId)

      const paymentTx = buildMptPaymentTx(issuer.address, governance.address, mptIssuanceId, '1000', {
        type: 'mint-period',
        data: '2026',
      })
      const result = await submitMultisigned(client, paymentTx, issuer.signers.slice(0, issuer.quorum))
      assertTesSuccess(result, 'mint Payment')

      const issuance = await client.request({ command: 'ledger_entry', mpt_issuance: mptIssuanceId })
      expect((issuance.result.node as { OutstandingAmount?: string }).OutstandingAmount).toBe('1000')

      const govMpt = await client.request({ command: 'account_objects', account: governance.address, type: 'mptoken' })
      const mptoken = govMpt.result.account_objects[0] as { MPTAmount?: string }
      expect(mptoken.MPTAmount).toBe('1000')
    } finally {
      await client.disconnect()
    }
  })

  it('is rejected with insufficient signatures (tefBAD_QUORUM)', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const governance = await setupGovernance(client, netCfg, mptIssuanceId)

      const paymentTx = buildMptPaymentTx(issuer.address, governance.address, mptIssuanceId, '1')
      const result = await submitMultisigned(client, paymentTx, issuer.signers.slice(0, 1), { expiry: 'fast' })
      expect(getTransactionResult(result)).toBe('tefBAD_QUORUM')
    } finally {
      await client.disconnect()
    }
  })

  it('is rejected when signed only by the (disabled) issuer master key', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const governance = await setupGovernance(client, netCfg, mptIssuanceId)

      const issuerWallet = Wallet.fromSeed(issuer.seed)
      const paymentTx = await client.autofill(buildMptPaymentTx(issuer.address, governance.address, mptIssuanceId, '1'))
      const signed = issuerWallet.sign(paymentTx)
      const result = await submitAndNormalizeFailures(client, signed.tx_blob)
      expect(getTransactionResult(result)).toBe('tefMASTER_DISABLED')
    } finally {
      await client.disconnect()
    }
  })

  it('fails cleanly when minting to a destination that has not run MPTokenAuthorize', async () => {
    const env = testEnv(network.wsUrl)
    const { client, network: netCfg } = await connectClient(env)
    try {
      const { issuer, mptIssuanceId } = await setupIssuer(client, netCfg, env)
      const unauthorized = await fundNewWallet(client, netCfg) // funded (exists), but never authorized

      const paymentTx = buildMptPaymentTx(issuer.address, unauthorized.address, mptIssuanceId, '1')
      const result = await submitMultisigned(client, paymentTx, issuer.signers.slice(0, issuer.quorum), { expiry: 'fast' })
      expect(getTransactionResult(result)).toBe('tecNO_AUTH')
    } finally {
      await client.disconnect()
    }
  })
})
