'use client'

import { use } from 'react'
import CustomerDetailClient from './CustomerDetailClient'

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <CustomerDetailClient customerId={id} />
}
