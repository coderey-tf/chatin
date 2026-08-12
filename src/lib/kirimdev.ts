import { Kirim } from '@kirimdev/sdk'

let _kirimInstance: Kirim | null = null

export function getKirim(): Kirim {
  if (!_kirimInstance) {
    const key = process.env.KIRIMDEV_API_KEY
    if (!key) {
      // Fallback key during build or dev initialization
      _kirimInstance = new Kirim({ apiKey: 'kdv_placeholder_key_for_build' })
    } else {
      _kirimInstance = new Kirim({ apiKey: key })
    }
  }
  return _kirimInstance
}

// Proxy export for backward compatibility so kirim.phoneNumbers(...) works everywhere
export const kirim = new Proxy({} as Kirim, {
  get(_target, prop) {
    const instance = getKirim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (instance as any)[prop]
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

export const PHONE_NUMBER_ID = process.env.KIRIMDEV_PHONE_NUMBER_ID || ''
export const TEAM_ID = process.env.KIRIMDEV_TEAM_ID || undefined
export const APP_URL = process.env.KIRIMDEV_APP_URL || 'https://chatin.coderey.dev'
