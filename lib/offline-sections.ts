/** Sections backed by local CRM records, never arbitrary cached reports. */
export function isOfflineSection(screen: string): boolean {
  return screen === 'kassa' || screen === 'sklad' || screen === 'kabinet' || screen === 'revisions'
}
