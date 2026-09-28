import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountControls } from '../_auth/AccountControls';
import './privacy.css';

export const metadata: Metadata = { title: 'Privacy · Ada Editor' };

/** Public (AuthGate lets it through), so people can read it before signing up. */
export default function Page() {
  return (
    <main className="privacy">
      <p><Link href="/">Back to Ada Editor</Link></p>
      <h1>How Ada Editor handles your data</h1>
      <p className="privacy__updated">Last updated 28 September 2026</p>

      <p>
        Ada Editor is a writing tool that checks documents for accessibility problems. This page says
        what it keeps about you, why, who helps run it, and how to remove it.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>Your email address, to send you sign-in codes.</li>
        <li>
          The documents you write or import, so they’re there when you come back. When you import a Word
          file, the file itself is read in your browser and never uploaded; only the document made from
          it is saved.
        </li>
        <li>A sign-in session, stored in your browser so you stay signed in.</li>
        <li>Messages you send us from this page, with your email address, so we can reply.</li>
      </ul>

      <h2>What we don’t do</h2>
      <p>No ads, no analytics and no tracking cookies. We never sell your data, and the only companies that handle it are the ones listed next, to run the service.</p>

      <h2>Who helps run Ada Editor</h2>
      <ul>
        <li><strong>Supabase</strong> stores your account and documents, on Amazon Web Services in Ohio, USA.</li>
        <li><strong>Vercel</strong> hosts the website.</li>
        <li><strong>Resend</strong> sends the sign-in emails.</li>
      </ul>
      <p>Like any web service, they keep short-lived technical logs, which include IP addresses.</p>

      <h2>How long we keep it</h2>
      <p>Until you delete your account. Deleting it removes your account, every document in it and any messages you sent us, straight away.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Download any document as a web page with <strong>Export HTML</strong> in the editor.</li>
        <li>Delete your account below, at any time.</li>
        <li>Ask us anything about your data with the form below.</li>
      </ul>

      <AccountControls />

      <h2>Changes</h2>
      <p>If this page changes, the date at the top changes with it.</p>
    </main>
  );
}
