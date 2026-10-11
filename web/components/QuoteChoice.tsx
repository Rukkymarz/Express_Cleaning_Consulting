'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Building2, House, KeyRound } from 'lucide-react';

const choices = [
  { label: 'Home', code: 'RES-STD', Icon: House },
  { label: 'Business', code: 'COMM-OFF', Icon: Building2 },
  { label: 'Property', code: 'APT-TURN', Icon: KeyRound },
] as const;

export default function QuoteChoice() {
  const [selected, setSelected] = useState<(typeof choices)[number]['code']>('RES-STD');
  return <div className="ecc-quote">
    <div className="ecc-quote-intro"><h2>Request a free quote</h2><p>Tell us about your space and we’ll review the scope and local availability, then follow up with pricing and scheduling options.</p></div>
    <div className="ecc-quote-action">
      <div className="ecc-quote-choices" role="group" aria-label="Choose a space">
        {choices.map(({ label, code, Icon }) => <button type="button" key={code} aria-pressed={selected === code} onClick={() => setSelected(code)}><Icon size={22} strokeWidth={1.8} /><span>{label}</span><span aria-hidden="true" className="ecc-radio">{selected === code ? '●' : '○'}</span></button>)}
      </div>
      <Link href={`/book?service=${selected}`} className="ecc-button">Start my quote <span aria-hidden="true">→</span></Link>
      <small>No payment taken when you request a quote.</small>
    </div>
  </div>;
}
