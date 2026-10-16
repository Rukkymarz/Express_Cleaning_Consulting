import type { Metadata } from 'next';
import './globals.css';
import './home.css';
import TrackingConsent from '@/components/TrackingConsent';
const site = 'https://www.expresscleaningconsult.com';
const title = 'Cleaning Services & Free Quotes | Express Cleaning Consult';
const description = 'Request a free quote for home cleaning, deep cleaning, office cleaning, junk removal or pressure washing. We confirm the scope, price and local availability before booking.';
export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: title, template: '%s | Express Cleaning Consult' },
  description,
  verification: { google: 'WR9Y9dsqLXeL2A4_A6sAe9vHV6-qHtWJet2KVezVBys' },
  applicationName: 'Express Cleaning Consult',
  openGraph: { type: 'website', locale: 'en_US', siteName: 'Express Cleaning Consult', title, description },
  twitter: { card: 'summary_large_image', title, description },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="min-h-screen antialiased">{children}<TrackingConsent /></body></html>;
}
