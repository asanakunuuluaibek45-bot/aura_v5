/**
 * Realtime handles normal updates. This interval is only a safety-net for
 * missed events, so keep it sparse and avoid syncing background tabs.
 */
export const PERIODIC_SYNC_MS = 2 * 60 * 1000

export function shouldRunPeriodicSync(state: {
  online: boolean
  running: boolean
  stopped: boolean
  visible: boolean
}): boolean {
  return state.online && !state.running && !state.stopped && state.visible
}
