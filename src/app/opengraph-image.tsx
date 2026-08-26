import { ImageResponse } from 'next/og'

export const alt = 'Chatin — Platform WhatsApp Business API & Lead Collector'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#09090b',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '60px 80px',
        }}
      >
        {/* Top Radial Glow effect */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            left: 200,
            width: 800,
            height: 450,
            background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(9,9,11,0) 70%)',
          }}
        />

        {/* Logo Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#09090b',
              fontSize: 44,
              fontWeight: 900,
              boxShadow: '0 12px 30px rgba(16,185,129,0.35)',
            }}
          >
            C
          </div>
          <span
            style={{
              fontSize: 54,
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: -1,
            }}
          >
            Chatin
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: '#34d399',
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.35)',
              borderRadius: 10,
              padding: '5px 12px',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
            }}
          >
            WABA Engine
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.25,
            maxWidth: 960,
            marginBottom: 18,
          }}
        >
          Platform WhatsApp Business API & Smart Lead Collector
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 21,
            color: '#a1a1aa',
            textAlign: 'center',
            maxWidth: 820,
            lineHeight: 1.45,
          }}
        >
          Kumpulkan leads pelanggan dari chat WhatsApp, kirim katalog pricelist dinamis otomatis, dan kelola percakapan Live Inbox realtime.
        </div>

        {/* Feature Pills */}
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 36,
          }}
        >
          <div
            style={{
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: 100,
              padding: '10px 22px',
              color: '#e4e4e7',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ⚡ Official Meta Cloud API
          </div>
          <div
            style={{
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: 100,
              padding: '10px 22px',
              color: '#e4e4e7',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            🤖 Lead Collector Chatbot
          </div>
          <div
            style={{
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: 100,
              padding: '10px 22px',
              color: '#e4e4e7',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            💬 Realtime Live Inbox
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
