import type { Metadata } from 'next';
import './globals.css';
import './home.css';
import TrackingConsent from '@/components/TrackingConsent';
import { Inter } from 'next/font/google';
const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const site = 'https://www.expresscleaningconsult.com';
const title = 'Nationwide Cleaning Services | Express Cleaning Consult';
const description = 'Free quotes for home, deep, move-out and office cleaning nationwide. Enter your ZIP code; we confirm local partner availability and price before booking.';
export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: { default: title, template: '%s | Express Cleaning Consult' },
  description,
  applicationName: 'Express Cleaning Consult',
  authors: [{ name: 'Express Cleaning Consult', url: site }],
  creator: 'Express Cleaning Consult',
  publisher: 'Express Cleaning Consult',
  category: 'Cleaning services',
  keywords: ['cleaning services', 'house cleaning', 'office cleaning', 'move-out cleaning', 'deep cleaning', 'junk removal', 'pressure washing'],
  manifest: '/site.webmanifest',
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { email: false, address: false, telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  verification: { google: 'WR9Y9dsqLXeL2A4_A6sAe9vHV6-qHtWJet2KVezVBys' },
  openGraph: { type: 'website', locale: 'en_US', siteName: 'Express Cleaning Consult', title, description, images: [{ url: '/gallery/bedroom-after.webp', alt: 'Express Cleaning Consult real project result' }] },
  twitter: { card: 'summary_large_image', title, description, images: [{ url: '/gallery/bedroom-after.webp', alt: 'Express Cleaning Consult real project result' }] },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body className="min-h-screen antialiased">{children}<TrackingConsent /></body></html>;
}
