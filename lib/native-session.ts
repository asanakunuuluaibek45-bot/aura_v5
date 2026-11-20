import { Capacitor, registerPlugin } from '@capacitor/core'

interface AuraNativePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
  action(options: {
    module: string; action: string; args: unknown[]; accessToken: string
  }): Promise<{ value: unknown }>
}

export const AuraNative = registerPlugin<AuraNativePlugin>('AuraNative')
export function usesKeychain(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}
