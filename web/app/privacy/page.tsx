import Link from 'next/link';

export const metadata = { title: 'Privacy and cookies' };

export default function PrivacyPage() {
  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-[#172c32]">
    <Link href="/" className="font-semibold text-[#17666a]">← Back to home</Link>
    <h1 className="mt-12 text-4xl font-bold">Privacy and cookies</h1>
    <p className="mt-6 leading-8">Our site uses essential first-party cookies to support sign-in and security for account and admin features. The cookie notice stores that you have seen this explanation for 180 days. It does not identify you and does not turn on analytics or advertising.</p>
    <p className="mt-4 leading-8">If you submit a quote request, we use the contact and property details you provide to review and respond to your request. You can clear cookies in your browser settings. Removing sign-in cookies may sign you out.</p>
    <p className="mt-4 leading-8">For privacy questions, contact <a className="underline" href="mailto:support@expresscleaningconsult.com">support@expresscleaningconsult.com</a>.</p>
  </main>;
}
