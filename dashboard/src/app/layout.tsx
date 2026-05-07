import type { Metadata } from 'next'
import './generated.css'

export const metadata: Metadata = {
  title: 'Woosaas Analytics',
  description: 'Analytics dashboard for WooCommerce',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
