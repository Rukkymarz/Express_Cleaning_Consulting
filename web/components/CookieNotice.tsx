'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const preferenceName = 'ecc_cookie_notice';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!document.cookie.split('; ').some((entry) => entry.startsWith(`${preferenceName}=`)));
  }, []);

  function acknowledge() {
    document.cookie = `${preferenceName}=acknowledged; Max-Age=15552000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside role="dialog" aria-modal="false" aria-label="Cookie information" className="ecc-cookie-notice">
      <div>
        <strong>Cookies, kept simple.</strong>
        <p>We use essential cookies for sign-in and site functions. Optional analytics loads only if you choose it in Website Tools.</p>
        <Link href="/privacy">How we use cookies</Link>
      </div>
      <button type="button" onClick={acknowledge}>Got it</button>
    </aside>
  );
}
