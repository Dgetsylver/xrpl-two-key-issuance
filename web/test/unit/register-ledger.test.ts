import { describe, expect, it } from 'vitest'
import { buildRegisterLedger, orderRefOf } from '../../src/lib/ledger'
import type { MptPayment } from '../../src/lib/xrplClient'

const REGISTER = 'r9FBRP7L5gnqG7LiHw1SqDwZ14V9rXhEHY'
const DESK = 'rf8KiuvfVqZ3GkwmQTUCyWySAW1Pv5qEVA'
const INVESTOR = 'rLBbnqV3WCc2C28zhG8BdEr4TRJK8bgARY'

function pay(destination: string, amountRaw: string, ledgerIndex: number, memos: MptPayment['memos'] = []): MptPayment {
  return { destination, amountRaw, ledgerIndex, hash: `H${ledgerIndex}`, memos }
}

describe('register ledger rows', () => {
  it('lists ISSUE, DELIVER and REDEEM rows newest first, with memos and contract-note figures', () => {
    const rows = buildRegisterLedger({
      issuer: REGISTER,
      desk: DESK,
      ticker: 'HQUAY',
      issuerPayments: [pay(DESK, '235187958000000', 10, [{ type: 'mint-period', data: '2026-10' }])],
      deskPayments: [
        pay(INVESTOR, '25000000000000', 12, [{ type: 'order-ref', data: 'ORD-2026-10-014' }]),
        pay(REGISTER, '1000000000', 14),
      ],
    })
    expect(rows.map((r) => r.stamp)).toEqual(['REDEEM', 'DELIVER', 'ISSUE'])
    expect(rows[2]).toMatchObject({
      title: 'Issued 235,187.958 HQUAY to the Dealing Desk',
      memo: '2026-10 · €2,450,000 ÷ €10.4172 (illustrative)',
      hash: 'H10',
    })
    expect(rows[2]!.offProcedure).toBeUndefined()
    expect(rows[1]).toMatchObject({ title: 'Delivered 25,000.000 HQUAY to rLBbnq…gARY', memo: 'ORD-2026-10-014' })
    expect(rows[0]).toMatchObject({ title: 'Returned 1.000 HQUAY to the Register for cancellation' })
  })

  it('flags issues that skip the Desk or carry no dealing day, and omits € when units differ from the note', () => {
    const rows = buildRegisterLedger({
      issuer: REGISTER,
      desk: DESK,
      ticker: 'HQUAY',
      issuerPayments: [pay(INVESTOR, '1000000000', 2, [{ type: 'mint-period', data: '2026-10' }]), pay(DESK, '1000000000', 1)],
      deskPayments: [],
    })
    expect(rows[0]).toMatchObject({ title: 'Issued 1.000 HQUAY directly to rLBbnq…gARY', memo: '2026-10', offProcedure: 'Skipped the Dealing Desk' })
    expect(rows[1]).toMatchObject({ memo: '(no dealing-day memo)', offProcedure: 'No dealing-day memo' })
  })

  it('prefers an order-ref memo, else the first text memo', () => {
    expect(orderRefOf([{ type: 'note', data: 'x' }, { type: 'order-ref', data: 'ORD-1' }])).toBe('ORD-1')
    expect(orderRefOf([{ type: 'note', data: 'x' }])).toBe('x')
    expect(orderRefOf([])).toBeUndefined()
  })
})
