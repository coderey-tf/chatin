'use client'

import React from 'react'
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SonnerToaster
        theme="dark"
        position="top-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: '#18181b',
            border: '1px solid #27272a',
            color: '#f4f4f5',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
          },
        }}
      />
    </>
  )
}

export const toast = sonnerToast

export function useToast() {
  return sonnerToast
}
