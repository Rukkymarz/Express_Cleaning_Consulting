import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Express Cleaning Consult | Request a cleaning quote', template: '%s | Express Cleaning Consult' },
  description: 'Tell us what needs cleaning. We will review the scope, price, and local availability before confirming your service.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.expresscleaningconsult.com'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="min-h-screen antialiased">{children}</body></html>;
}
