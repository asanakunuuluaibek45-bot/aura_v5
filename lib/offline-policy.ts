/** Stock writes require a live connection; POS and revision marks remain local. */
export function canMutateStock(online: boolean): boolean { return online }
export function requireStockConnection(online: boolean): void {
  if (!canMutateStock(online)) throw new Error('Добавление, редактирование и удаление товаров доступны только с интернетом')
}
export type LogoutOptions = { discardUnsynced?: boolean }
export class UnsyncedLogoutError extends Error {
  readonly count: number
  constructor(count: number) {
    super(`Несинхронизированных операций: ${count}. При выходе эти данные будут стёрты навсегда.`)
    this.count = count
    this.name = 'UnsyncedLogoutError'
  }
}
export function requireLogoutConsent(count: number, options: LogoutOptions = {}): void {
  if (count > 0 && options.discardUnsynced !== true) throw new UnsyncedLogoutError(count)
}
