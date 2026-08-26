import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Daftar Akun Baru',
  description:
    'Daftar akun Chatin dan hubungkan nomor WhatsApp Business Anda dengan Meta Embedded Signup dalam hitungan menit.',
  openGraph: {
    title: 'Daftar Akun Baru | Chatin',
    description:
      'Daftar akun Chatin dan hubungkan nomor WhatsApp Business Anda dengan Meta Embedded Signup dalam hitungan menit.',
    url: 'https://chatin.coderey.dev/register',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children
}
