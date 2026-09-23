import { RippledError, type Client } from 'xrpl'

/** Only classify explicit ledger errors; transport failures are not missing accounts. */
export function isLedgerError(error: unknown, code: string): boolean {
  return error instanceof RippledError &&
    typeof error.data === 'object' && error.data !== null &&
    'error' in error.data && error.data.error === code
}

/** Exact lookup avoids silently missing holdings beyond the first account_objects page. */
export async function readMptHolding(client: Client, account: string, issuanceId: string) {
  try {
    const { result } = await client.command.ledgerEntry({
      mptoken: { account, mpt_issuance_id: issuanceId },
      ledger_index: 'validated',
    })
    return result.node
  } catch (error) {
    if (isLedgerError(error, 'entryNotFound')) return undefined
    throw error
  }
}
