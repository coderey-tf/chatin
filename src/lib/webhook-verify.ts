import crypto from 'crypto'

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false

  // KirimDev format: "t=TIMESTAMP,v1=HEX_SIGNATURE"
  // Extract the hex part
  let hexPart = signature
  if (signature.includes('v1=')) {
    const match = signature.match(/v1=([a-fA-F0-9]+)/)
    if (match) hexPart = match[1]
  } else if (signature.includes('sha256=')) {
    hexPart = signature.replace('sha256=', '')
  }

  // Clean secret: remove whsec_ prefix if present
  const cleanSecret = secret.replace(/^whsec_/, '')

  // Try: secret is raw webhook secret from KirimDev
  // They compute: HMAC-SHA256(secret, payload)
  // But the timestamp prefix means they hash: "TIMESTAMP.payload"
  // Let's try multiple approaches

  const timestampMatch = signature.match(/t=(\d+)/)
  const timestamp = timestampMatch ? timestampMatch[1] : null

  const candidates: string[] = []

  // 1. Raw payload with raw secret
  candidates.push(crypto.createHmac('sha256', cleanSecret).update(payload).digest('hex'))

  // 2. Try with full secret (including whsec_)
  candidates.push(crypto.createHmac('sha256', secret).update(payload).digest('hex'))

  // 3. With timestamp prefix: "t.payload" raw secret
  if (timestamp) {
    const rawBody = typeof payload === 'string' ? payload : payload.toString()
    candidates.push(crypto.createHmac('sha256', cleanSecret).update(`${timestamp}.${rawBody}`).digest('hex'))
    candidates.push(crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex'))
  }

  // 4. Try base64 decoded secret
  try {
    const decodedSecret = Buffer.from(cleanSecret, 'base64')
    const rawBody = typeof payload === 'string' ? payload : payload.toString()
    candidates.push(crypto.createHmac('sha256', decodedSecret).update(payload).digest('hex'))
    if (timestamp) {
      candidates.push(crypto.createHmac('sha256', decodedSecret).update(`${timestamp}.${rawBody}`).digest('hex'))
    }
  } catch {}

  for (const expected of candidates) {
    try {
      if (hexPart.length === expected.length) {
        if (crypto.timingSafeEqual(Buffer.from(hexPart, 'hex'), Buffer.from(expected, 'hex'))) {
          return true
        }
      }
    } catch {}
  }

  return false
}
