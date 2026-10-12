import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountControls } from '../_auth/AccountControls';
import { pageMetadata } from '../_site/pages';
import { Site, Toc } from '../_site/Site';
import './privacy.css';

export const metadata: Metadata = pageMetadata('/privacy');

/** Public (AuthGate lets it through), so people can read it before signing up. */
export default function Page() {
  return (
    <Site current="privacy">
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Privacy</p>
          <h1 id="page-title">Your documents are yours. Here’s what we touch.</h1>
          <p className="site-lede">
            Ada Editor is a writing tool that checks documents for accessibility problems. This page says
            what it keeps about you, what it counts, why, who helps run it, and how to remove it.
          </p>
          <dl className="site-facts">
            <div><dt>Run by</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Last updated</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement">
        <Toc items={[['keep', 'What we keep'], ['count', 'What we count'], ['dont', 'What we don’t do'], ['who', 'Who helps run it'], ['how-long', 'How long we keep it'], ['choices', 'Your choices'], ['contact', 'Message us or delete your account']]} />
        <div className="site-col">
          <section id="keep" aria-labelledby="keep-title">
            <h2 id="keep-title">What we keep</h2>
            <div className="site-table" role="region" aria-labelledby="keep-title" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">Data</th><th scope="col">Why</th><th scope="col">Kept until</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Your email address</th><td>To send you sign-in codes</td><td>You delete your account</td></tr>
                  <tr><th scope="row">The documents you write or import</th><td>So they’re there when you come back</td><td>You delete them, or your account</td></tr>
                  <tr><th scope="row">The images you add to your documents</th><td>Stored privately in your account: only you can open them</td><td>No document of yours uses them (below)</td></tr>
                  <tr><th scope="row">A sign-in session</th><td>Stored in your browser, so you stay signed in</td><td>You sign out</td></tr>
                  <tr><th scope="row">Messages you send us from this page, with your email address</th><td>So we can reply</td><td>You delete your account</td></tr>
                </tbody>
              </table>
            </div>
            <p>
              When you import a Word file, the file itself is read in your browser and never uploaded; only the
              document made from it is saved.
            </p>
            <p>
              Deleting a document deletes the images no other document of yours uses, and deleting your account
              deletes all of them. An image you take out of a document is kept for a while, so that undo can bring
              it back, then deleted the next time you use Ada Editor once no document of yours uses it and it was
              added at least a week ago.
            </p>
          </section>

          <section id="count" aria-labelledby="count-title">
            <h2 id="count-title">What we count</h2>
            <p>
              To learn how people find Ada Editor and whether it works for them, we count visits, without
              cookies and without storing anything in your browser to do it.
            </p>
            <ul>
              <li>
                <strong>Each page you open:</strong> its address, the site that sent you, your country, region and
                city (from your connection), and your browser, operating system and kind of device. A document’s
                address is sent as <code>/editor/[docId]</code>, so it never says which document.
              </li>
              <li>
                <strong>How fast pages load and respond</strong> on your device: which page, the part of it that was
                slow (by its tag and class names, never its text), your connection type (such as 4g), and the same
                location, browser and device details.
              </li>
              <li>
                <strong>Five steps:</strong> creating an account, creating a document, importing a Word file,
                exporting a PDF and exporting HTML. Each is counted like a page view, with the same details, and
                never with anything the document says.
              </li>
            </ul>
            <p>
              Vercel does the counting. It tells one visit from another with a code made from your connection
              that it throws away after 24 hours, and the counts aren’t linked to your account or kept with your
              IP address. We see totals, not people.
            </p>
            <p>
              Your browser can ask sites not to share or sell your data with{' '}
              <a href="https://globalprivacycontrol.org/">Global Privacy Control</a>. When it does, nothing is
              counted at all.
            </p>
          </section>

          <section id="dont" aria-labelledby="dont-title">
            <h2 id="dont-title">What we don’t do</h2>
            <p>No ads, no cookies that track you, and no following you to other sites. What you write is never counted, and we never sell your data. The only companies that handle it are the ones listed next, to run the service.</p>
          </section>

          <section id="who" aria-labelledby="who-title">
            <h2 id="who-title">Who helps run Ada Editor</h2>
            <ul>
              <li><strong>Supabase</strong> stores your account, documents and images, on Amazon Web Services in Ohio, USA.</li>
              <li><strong>Vercel</strong> hosts the website and does the counting described above.</li>
              <li><strong>Resend</strong> sends the sign-in emails.</li>
            </ul>
            <p>Like any web service, they keep short-lived technical logs, which include IP addresses.</p>
          </section>

          <section id="how-long" aria-labelledby="how-long-title">
            <h2 id="how-long-title">How long we keep it</h2>
            <p>Until you delete your account. Deleting it removes your account, every document and image in it and any messages you sent us, straight away.</p>
            <p>The counts hold nothing that identifies you, so there’s nothing of yours in them to delete.</p>
          </section>

          <section id="choices" aria-labelledby="choices-title">
            <h2 id="choices-title">Your choices</h2>
            <ul>
              <li>Download any document as a web page with <strong>Export HTML</strong> in the editor.</li>
              <li>Turn on Global Privacy Control in your browser, and nothing is counted.</li>
              <li>Delete your account below, at any time.</li>
              <li>Ask us anything about your data with the form below.</li>
            </ul>
            <p>If this page changes, the date at the top changes with it.</p>
          </section>

          <section id="contact" aria-labelledby="contact-title" className="privacy__contact">
            <h2 id="contact-title">Questions about your data?</h2>
            <p>Ask us anything about your data, or delete your account.</p>
            <AccountControls />
          </section>
        </div>
      </div>
    </Site>
  );
}
