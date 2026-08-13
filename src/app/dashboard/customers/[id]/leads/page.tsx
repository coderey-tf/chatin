'use client'

import { use } from 'react'
import LeadsClient from './LeadsClient'

export default function LeadsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <LeadsClient customerId={id} />
}
