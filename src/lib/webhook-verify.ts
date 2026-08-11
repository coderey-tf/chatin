import crypto from 'crypto'

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false

  // KirimDev uses HMAC-SHA256
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  // Support both plain hex and sha256= prefix
  const cleanSignature = signature.replace('sha256=', '')

  return crypto.timingSafeEqual(
    Buffer.from(cleanSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )
}
