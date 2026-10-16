import type { Metadata } from 'next';
import './globals.css';
import './home.css';
import TrackingConsent from '@/components/TrackingConsent';
const site = 'https://www.expresscleaningconsult.com';
const title = 'Nationwide Cleaning Services | Express Cleaning Consult';
const description = 'Free quotes for home, deep, move-out and office cleaning nationwide. Enter your ZIP code; we confirm local partner availability and price before booking.';
export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: title, template: '%s | Express Cleaning Consult' },
  description,
  verification: { google: 'WR9Y9dsqLXeL2A4_A6sAe9vHV6-qHtWJet2KVezVBys' },
  applicationName: 'Express Cleaning Consult',
  openGraph: { type: 'website', locale: 'en_US', siteName: 'Express Cleaning Consult', title, description, images: [{ url: '/gallery/bedroom-after.webp', alt: 'Express Cleaning Consult real project result' }] },
  twitter: { card: 'summary_large_image', title, description, images: [{ url: '/gallery/bedroom-after.webp', alt: 'Express Cleaning Consult real project result' }] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="min-h-screen antialiased">{children}<TrackingConsent /></body></html>;
}
