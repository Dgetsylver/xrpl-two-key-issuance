import { describe, expect, it } from 'vitest'
import { assertNoSeedKey, buildPublicConfig } from '../../src/scripts/sync-public-config.js'
import type { DeploymentState } from '../../src/lib/config.js'
import type { TokenMetadataConfig } from '../../src/lib/metadata.js'

const tokenConfig: TokenMetadataConfig = {
  ticker: 'CRBN',
  name: 'Carbon Coin',
  description: 'Aligning Long-Term Wealth with Planetary Decarbonization',
  icon: 'https://example.org/icon.png',
  assetClass: 'other',
  assetSubclass: 'other',
  issuerName: 'UN Ministry For The Future',
}

const state: DeploymentState = {
  network: 'testnet',
  mptIssuanceId: 'ABCDEF0123456789',
  issuer: {
    address: 'rIssuerAddress',
    seed: 'sIssuerSeedSecret',
    quorum: 2,
    signers: [
      { address: 'rSignerOne', seed: 'sSignerOneSeedSecret' },
      { address: 'rSignerTwo', seed: '' },
      { address: 'rSignerThree', seed: 'sSignerThreeSeedSecret' },
    ],
  },
  governance: {
    address: 'rGovernanceAddress',
    seed: 'sGovernanceSeedSecret',
    quorum: 2,
    signers: [
      { address: 'rGovSignerOne', seed: 'sGovSignerOneSeedSecret' },
      { address: 'rGovSignerTwo', seed: 'sGovSignerTwoSeedSecret' },
    ],
  },
}

describe('sync-public-config', () => {
  it('carries over only non-secret fields', () => {
    const publicConfig = buildPublicConfig(state, tokenConfig)

    expect(publicConfig).toEqual({
      network: 'testnet',
      mptIssuanceId: 'ABCDEF0123456789',
      token: {
        ticker: 'CRBN',
        name: 'Carbon Coin',
        description: 'Aligning Long-Term Wealth with Planetary Decarbonization',
        icon: 'https://example.org/icon.png',
        issuerName: 'UN Ministry For The Future',
      },
      issuer: {
        address: 'rIssuerAddress',
        quorum: 2,
        signers: [{ address: 'rSignerOne' }, { address: 'rSignerTwo' }, { address: 'rSignerThree' }],
      },
      governance: {
        address: 'rGovernanceAddress',
        quorum: 2,
        signers: [{ address: 'rGovSignerOne' }, { address: 'rGovSignerTwo' }],
      },
    })
  })

  it('never serializes a "seed" key, even though the input state is full of them', () => {
    const publicConfig = buildPublicConfig(state, tokenConfig)
    const serialized = JSON.stringify(publicConfig, null, 2)

    expect(serialized).not.toMatch(/"seed"\s*:/)
    expect(serialized).not.toContain('SeedSecret')
    expect(() => assertNoSeedKey(serialized)).not.toThrow()
  })

  it('assertNoSeedKey rejects output that does contain a seed key', () => {
    expect(() => assertNoSeedKey(JSON.stringify({ seed: 'sSomethingSecret' }))).toThrow(/seed/)
  })

  it('handles missing issuer/governance gracefully', () => {
    const publicConfig = buildPublicConfig({ network: 'testnet' }, tokenConfig)
    expect(publicConfig.issuer).toBeUndefined()
    expect(publicConfig.governance).toBeUndefined()
    expect(publicConfig.mptIssuanceId).toBeUndefined()
  })
})
