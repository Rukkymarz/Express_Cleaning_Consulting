'use client';
import { useEffect, useState } from 'react';

type Config = { hubspot: string | null; salesiq: string | null };
type SalesWindow = Window & { $zoho?: { salesiq?: { ready: () => void; floatwindow?: { visible: (state: string) => void } } } };

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) { resolve(); return; }
    const script = document.createElement('script');
    script.id = id; script.src = src; script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new Error('Unable to load website tool')); };
    document.body.appendChild(script);
  });
}

export default function WebsiteTools() {
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/integrations/config', { cache: 'no-store', signal: controller.signal })
      .then(r => r.ok ? r.json() : null).then(setConfig).catch(() => {});
    return () => controller.abort();
  }, []);
  async function chat() {
    if (!config?.salesiq) return;
    setBusy(true); setError('');
    const win = window as SalesWindow;
    win.$zoho = win.$zoho || {};
    win.$zoho.salesiq = win.$zoho.salesiq || { ready: () => { win.$zoho?.salesiq?.floatwindow?.visible('show'); } };
    try { await loadScript('zsiqscript', config.salesiq); win.$zoho.salesiq.floatwindow?.visible('show'); }
    catch { setError('Chat is unavailable. Please email support@expresscleaningconsult.com or call (281) 972-7712.'); }
    finally { setBusy(false); }
  }
  async function enableAnalytics() { window.dispatchEvent(new Event('ecc-open-consent')); }
  if (!config?.hubspot && !config?.salesiq) return null;
  return <aside aria-label="Website tools" className="border-t border-platinum bg-white px-5 py-5"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4">
    {config.salesiq && <button type="button" onClick={chat} disabled={busy} className="rounded-xl bg-ocean px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Connecting…' : 'Chat with our team'}</button>}
    {config.hubspot && <div className="text-sm text-slate-600"><p>Choose whether optional analytics may load.</p><button type="button" onClick={enableAnalytics} disabled={busy} className="mt-1 font-bold text-ocean underline">Manage cookie preferences</button></div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div></aside>;
}
