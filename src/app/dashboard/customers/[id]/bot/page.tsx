'use client'

import { use } from 'react'
import BotSettingsClient from './BotSettingsClient'

export default function BotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BotSettingsClient customerId={id} />
}
