import type { Metadata } from 'next'

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
      <body className="bg-gray-100">{children}</body>
    </html>
  )
}