import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kalai Analytics',
  description: 'Gestión de tu organización en Kalai Analytics.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
