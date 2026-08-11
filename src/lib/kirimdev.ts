import { Kirim } from '@kirimdev/sdk'

if (!process.env.KIRIMDEV_API_KEY) {
  throw new Error('KIRIMDEV_API_KEY is required')
}

export const kirim = new Kirim({
  apiKey: process.env.KIRIMDEV_API_KEY!,
})

export const PHONE_NUMBER_ID = process.env.KIRIMDEV_PHONE_NUMBER_ID!
export const TEAM_ID = process.env.KIRIMDEV_TEAM_ID || undefined
export const APP_URL = process.env.KIRIMDEV_APP_URL || 'https://chatin.coderey.dev'
