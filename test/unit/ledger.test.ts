import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client, RippledError } from 'xrpl'
import { readMptHolding } from '../../src/lib/ledger.js'

const client = new Client('ws://localhost:6006')
afterEach(() => vi.restoreAllMocks())

describe('MPT holding lookup', () => {
  it('queries the exact holding at a validated ledger, without a paginated account scan', async () => {
    const request = vi.spyOn(client, 'request').mockRejectedValue(new RippledError('Not found', { error: 'entryNotFound' }))
    expect(await readMptHolding(client, 'rHolder', 'issuance')).toBeUndefined()
    expect(request).toHaveBeenCalledWith({
      command: 'ledger_entry',
      mptoken: { account: 'rHolder', mpt_issuance_id: 'issuance' },
      ledger_index: 'validated',
    })
  })

  it.each([
    new Error('Connection closed'),
    new RippledError('Not synced', { error: 'noNetwork' }),
    new RippledError('Bad address', { error: 'malformedAddress' }),
  ])('preserves lookup failures instead of claiming no authorization: %s', async (failure) => {
    vi.spyOn(client, 'request').mockRejectedValue(failure)
    await expect(readMptHolding(client, 'rHolder', 'issuance')).rejects.toBe(failure)
  })
})
