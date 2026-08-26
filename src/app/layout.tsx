import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://chatin.coderey.dev'),
  title: {
    default: 'Chatin — Platform WhatsApp Business API & Lead Collector',
    template: '%s | Chatin',
  },
  description:
    'Platform WhatsApp Business API resmi dengan chatbot otomatis pengumpul prospek leads, katalog pricelist dinamis, dan Live Inbox realtime.',
  applicationName: 'Chatin',
  authors: [{ name: 'Chatin', url: 'https://chatin.coderey.dev' }],
  creator: 'Chatin',
  publisher: 'Chatin',
  keywords: [
    'WhatsApp Business API',
    'WABA',
    'Chatbot WhatsApp',
    'Lead Collector',
    'KirimDev',
    'WhatsApp Automation',
    'Live Inbox WhatsApp',
    'Chatin',
    'Meta Cloud API',
    'Katalog Pricelist WhatsApp',
  ],
  openGraph: {
    title: 'Chatin — Platform WhatsApp Business API & Lead Collector',
    description:
      'Kumpulkan leads pelanggan otomatis dari chat WhatsApp, kirim katalog pricelist dinamis, dan kelola percakapan Live Inbox realtime.',
    url: 'https://chatin.coderey.dev',
    siteName: 'Chatin',
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chatin — Platform WhatsApp Business API & Lead Collector',
    description:
      'Platform WhatsApp Business API resmi dengan chatbot otomatis pengumpul prospek leads & Live Inbox realtime.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
