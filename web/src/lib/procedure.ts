import { contractNote, isDealingDay, type ContractNote } from './dealing'

/**
 * How a Register issue departs from the dealing-day procedure (issue to the
 * Dealing Desk, carrying a `YYYY-MM` dealing day, for exactly the contract
 * note's units). One classifier, so Co-sign and the register ledger flag
 * the same issues; each surface words the reason its own way.
 */
export type IssueDeviation =
  | { kind: 'skips-desk' }
  | { kind: 'no-day' }
  | { kind: 'not-a-month'; day: string }
  | { kind: 'units-differ'; day: string; note: ContractNote }

export interface IssueFacts {
  /** Whether the destination is the Dealing Desk. */
  toDesk: boolean
  /** The dealing-day memo, if any. */
  day?: string
  amountRaw: string
}

/** The first way this issue departs from the procedure, or undefined when it follows it. */
export function issueDeviation({ toDesk, day, amountRaw }: IssueFacts): IssueDeviation | undefined {
  if (!toDesk) return { kind: 'skips-desk' }
  if (!day) return { kind: 'no-day' }
  if (!isDealingDay(day)) return { kind: 'not-a-month', day }
  const note = contractNote(day)
  if (note.unitsRaw !== BigInt(amountRaw)) return { kind: 'units-differ', day, note }
  return undefined
}
