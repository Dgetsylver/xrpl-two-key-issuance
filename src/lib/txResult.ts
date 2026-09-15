import type { SubmittableTransaction, TxResponse } from 'xrpl'

export function getTransactionResult(result: TxResponse<SubmittableTransaction>): string {
  const meta = result.result.meta
  if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
    return String((meta as { TransactionResult: unknown }).TransactionResult)
  }
  return 'UNKNOWN'
}

export function assertTesSuccess(result: TxResponse<SubmittableTransaction>, label: string): void {
  const engineResult = getTransactionResult(result)
  if (engineResult !== 'tesSUCCESS') {
    throw new Error(`${label} failed with result ${engineResult}.`)
  }
}
