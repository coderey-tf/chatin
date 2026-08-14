'use client'

import React from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: '🗑️',
      iconBg: 'bg-red-500/15 text-red-400 border-red-500/30',
      buttonBg: 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/40',
    },
    warning: {
      icon: '⚠️',
      iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      buttonBg: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/40',
    },
    info: {
      icon: 'ℹ️',
      iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40',
    },
  }[variant]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 transform transition-all scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shrink-0 border ${variantStyles.iconBg}`}>
            {variantStyles.icon}
          </div>

          <div className="space-y-1 flex-1">
            <h3 className="text-sm font-bold text-white leading-snug">{title}</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl transition disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition shadow-lg disabled:opacity-50 flex items-center gap-1.5 ${variantStyles.buttonBg}`}
          >
            {loading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Memproses...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
