import { Capacitor } from '@capacitor/core'

/**
 * Returns true if running inside the native iOS/Android shell (Capacitor),
 * false when running as a PWA, web browser, or server-side test.
 */
export function isNative() {
  try {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
