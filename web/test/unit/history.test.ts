import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client, encodeMemo } from 'xrpl'
import { getMintHistory } from '../../src/lib/xrplClient'
import { formatUnits, parseUnits } from '../../src/lib/units'

beforeEach(() => {
  vi.spyOn(Client.prototype, 'connect').mockResolvedValue()
})
afterEach(() => vi.restoreAllMocks())

describe('typed mint history and display units', () => {
  it('uses delivered amounts and skips binary memos and unknown historical delivery', async () => {
    const history = vi.spyOn(Client.prototype, 'getMptPaymentHistory').mockResolvedValue({
      ledgerIndexMin: 1,
      ledgerIndexMax: 42,
      payments: [
        {
          transaction: {
            Memos: [{ Memo: { MemoData: 'FF' } }, encodeMemo({ type: 'mint-period', data: '2026' })],
          },
          deliveredAmount: '3',
          hash: 'hash',
        },
        { transaction: { Memos: [encodeMemo({ type: 'mint-period', data: '2027' })] } },
      ],
    } as never)
    expect(await getMintHistory('issuer', 'issuance')).toEqual([
      { period: '2026', amountRaw: '3', hash: 'hash' },
    ])
    expect(history).toHaveBeenCalledWith('issuer', 'issuance')
  })
  it('round-trips 3 dp amounts at the ledger scale, floors display, and rejects excess precision', () => {
    expect(parseUnits(formatUnits('9223372036854000000'))).toBe('9223372036854000000')
    expect(formatUnits('9223372036854775807')).toBe('9,223,372,036.854')
    expect(formatUnits('1000000001')).toBe('1.000')
    expect(() => parseUnits('1.0001')).toThrow()
  })
})
