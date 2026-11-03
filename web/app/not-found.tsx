import Link from 'next/link';
import PublicShell from '@/components/PublicShell';

export default function NotFound() {
  return <PublicShell><span className="ecc-eyebrow">PAGE NOT FOUND</span><h1>Let’s get you<br/><em>back on track.</em></h1><p className="ecc-page-lead">That page is not available. Explore our services or tell us what kind of cleaning help you need.</p><p><Link className="ecc-button" href="/services">Explore services →</Link> <Link className="ecc-text-link" href="/book">Request a free quote →</Link></p></PublicShell>;
}
