import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Profit OS - True Profit Engine',
  description: 'Know your true profit per order. Track COGS, shipping, RTO, transaction fees, and ad spend in real-time.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans antialiased bg-background text-foreground" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
