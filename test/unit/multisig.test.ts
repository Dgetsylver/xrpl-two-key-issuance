import { describe, expect, it } from 'vitest'
import { Client } from 'xrpl'
import { buildMptAuthorizeTx } from '../../src/lib/mpt.js'
import { localSigners, signerListFields, trySubmitMultisigned } from '../../src/lib/multisig.js'

const external = { address: 'rExternal', seed: '' }
const first = { address: 'rFirst', seed: 'first-test-placeholder' }
const second = { address: 'rSecond', seed: 'second-test-placeholder' }

describe('local signer selection', () => {
  it('selects available keys without depending on storage order', () => {
    expect(localSigners([external, first, second], 2)).toEqual([first, second])
  })
  it('directs an external quorum to the signing ceremony before preparing a transaction', () => {
    expect(() => localSigners([external, first], 2)).toThrow(/GhostSig browser ceremony/)
  })
  it('returns signing errors through the explicit outcome too', async () => {
    const client = new Client('ws://localhost:6006')
    const outcome = await trySubmitMultisigned(client, buildMptAuthorizeTx('rAccount', 'issuance'), [external])
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.message).toMatch(/GhostSig/)
  })
  it('rejects duplicate signers and fractional quorum before disabling a master key', () => {
    expect(() => signerListFields([first, first], 2)).toThrow(/unique/)
    expect(() => signerListFields([first, second], 1.5)).toThrow(/Invalid quorum/)
  })
})
