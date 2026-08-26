import { ImageResponse } from 'next/og'

export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 110,
          background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#09090b',
          fontWeight: 900,
          borderRadius: 40,
        }}
      >
        C
      </div>
    ),
    {
      ...size,
    }
  )
}
