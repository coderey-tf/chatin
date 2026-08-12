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

// Generate valid 26-char Crockford Base32 KirimDev customer ID matching /^cus_[0-9A-HJKMNP-TV-Z]{26}$/
export function generateKirimDevCustomerId(): string {
  const chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let result = 'cus_'
  for (let i = 0; i < 26; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Validate if customer ID matches KirimDev ULID pattern
export function isValidKirimDevCustomerId(id: string): boolean {
  return /^cus_[0-9A-HJKMNP-TV-Z]{26}$/.test(id)
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
