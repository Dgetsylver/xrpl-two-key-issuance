import type { SubmittableTransaction, TxResponse } from 'xrpl'

export function getTransactionResult(result: TxResponse<SubmittableTransaction>): string {
  const meta = result.result.meta
  if (meta == null || typeof meta === 'string') {
    throw new Error('Transaction metadata unavailable (binary or unvalidated response).')
  }
  return meta.TransactionResult
}

export function assertTesSuccess(result: TxResponse<SubmittableTransaction>, label: string): void {
  const engineResult = getTransactionResult(result)
  if (engineResult !== 'tesSUCCESS') {
    throw new Error(`${label} failed with ${engineResult} (tx ${result.result.hash}).`)
  }
}
