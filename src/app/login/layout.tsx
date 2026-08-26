import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Masuk ke Dashboard',
  description:
    'Masuk ke dashboard Chatin untuk mengelola WhatsApp Business API, pantau leads masuk secara realtime, dan kelola Live Inbox.',
  openGraph: {
    title: 'Masuk ke Dashboard | Chatin',
    description:
      'Masuk ke dashboard Chatin untuk mengelola WhatsApp Business API, pantau leads masuk secara realtime, dan kelola Live Inbox.',
    url: 'https://chatin.coderey.dev/login',
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
