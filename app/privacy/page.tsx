import type { Metadata } from 'next';
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
            what it keeps about you, why, who helps run it, and how to remove it.
          </p>
          <dl className="site-facts">
            <div><dt>Last updated</dt><dd><time dateTime="2026-10-06">6 October 2026</time></dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement">
        <Toc items={[['keep', 'What we keep'], ['dont', 'What we don’t do'], ['who', 'Who helps run it'], ['how-long', 'How long we keep it'], ['choices', 'Your choices'], ['contact', 'Message us or delete your account']]} />
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

          <section id="dont" aria-labelledby="dont-title">
            <h2 id="dont-title">What we don’t do</h2>
            <p>No ads, no analytics and no tracking cookies. We never sell your data, and the only companies that handle it are the ones listed next, to run the service.</p>
          </section>

          <section id="who" aria-labelledby="who-title">
            <h2 id="who-title">Who helps run Ada Editor</h2>
            <ul>
              <li><strong>Supabase</strong> stores your account, documents and images, on Amazon Web Services in Ohio, USA.</li>
              <li><strong>Vercel</strong> hosts the website.</li>
              <li><strong>Resend</strong> sends the sign-in emails.</li>
            </ul>
            <p>Like any web service, they keep short-lived technical logs, which include IP addresses.</p>
          </section>

          <section id="how-long" aria-labelledby="how-long-title">
            <h2 id="how-long-title">How long we keep it</h2>
            <p>Until you delete your account. Deleting it removes your account, every document and image in it and any messages you sent us, straight away.</p>
          </section>

          <section id="choices" aria-labelledby="choices-title">
            <h2 id="choices-title">Your choices</h2>
            <ul>
              <li>Download any document as a web page with <strong>Export HTML</strong> in the editor.</li>
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
