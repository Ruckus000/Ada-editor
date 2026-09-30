import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountControls } from '../../_auth/AccountControls';
import { PageSection, SitePage } from '../../_site/SitePage';
import './privacy.css';

export const metadata: Metadata = { title: 'Privacy · Ada Editor' };

const TOC = [
  { id: 'keep', label: 'What we keep' },
  { id: 'dont', label: 'What we don’t do' },
  { id: 'who', label: 'Who helps run it' },
  { id: 'how-long', label: 'How long we keep it' },
  { id: 'choices', label: 'Your choices' },
  { id: 'changes', label: 'Changes' },
];

/**
 * Public (AuthGate lets it through), so people can read it before signing up.
 * The words are the notice's; the layout is the site's. Change a fact here
 * only when the product changes, and move the date with it.
 */
export default function Page() {
  return (
    <SitePage
      eyebrow="Privacy"
      title="How Ada Editor handles your data"
      tint="green"
      toc={TOC}
      lead="Ada Editor is a writing tool that checks documents for accessibility problems. This page says what it keeps about you, why, who helps run it, and how to remove it."
      heroExtra={
        <>
          <p data-rv="" data-rv-delay="200" className="page-date site-mono">Last updated <time dateTime="2026-09-30">30 September 2026</time></p>
          <h2 className="ada-visually-hidden">In short</h2>
          <ul data-stagger="" className="page-highlights">
            <li>
              <div className="page-highlights__art" aria-hidden="true">0 bytes uploaded</div>
              <div className="page-highlights__body">
                <h3>Word files are read in your browser</h3>
                <p>Importing a .docx never uploads the file; only the document made from it is saved.</p>
              </div>
            </li>
            <li>
              <div className="page-highlights__art" aria-hidden="true">owner = you</div>
              <div className="page-highlights__body">
                <h3>Only you can open your work</h3>
                <p>Your documents and images are stored privately in your account.</p>
              </div>
            </li>
            <li>
              <div className="page-highlights__art" aria-hidden="true">no ads · no cookies</div>
              <div className="page-highlights__body">
                <h3>No tracking cookies</h3>
                <p>No ads and no tracking cookies. We count visits to our public pages ourselves, without identifying you. We never sell your data.</p>
              </div>
            </li>
          </ul>
        </>
      }
    >
      <PageSection id="keep" title="What we keep">
        <ul>
          <li>Your email address, to send you sign-in codes.</li>
          <li>
            The documents you write or import, so they’re there when you come back. When you import a Word file, the file
            itself is read in your browser and never uploaded; only the document made from it is saved.
          </li>
          <li>
            The images you add to your documents, stored privately in your account: only you can open them. Deleting a
            document deletes the images no other document of yours uses, and deleting your account deletes all of them. An
            image you take out of a document is kept for a while, so that undo can bring it back, then deleted the next time
            you use Ada Editor once no document of yours uses it and it was added at least a week ago.
          </li>
          <li>A sign-in session, stored in your browser so you stay signed in.</li>
          <li>
            Messages you send us from the contact page, with the email address to reply to. If
            you’re signed in, that’s your account’s address and the message is linked to your account.
          </li>
          <li>Emails you send to an adaedit.com address: the sender, recipients, subject and text, kept with the messages above.</li>
          <li>
            Visits to our public pages (the home page, this page, the accessibility statement and the contact page), never
            inside the editor: which page, the site that linked you here, the type of device and the country. No cookies and
            nothing stored in your browser. To count a person once a day, we keep a scrambled code made from your IP address
            and browser with a key that changes every day and is then deleted, so no one, us included, can link your visits
            from one day to the next. We don’t count you at all if your browser sends Do Not Track or Global Privacy Control.
          </li>
          <li>
            To stop the contact form being flooded, scrambled (one-way hashed) forms of the sending device’s IP address and of
            its network, for one day. We never store the addresses themselves. Messages that look like spam are kept aside
            for review rather than refused.
          </li>
        </ul>
      </PageSection>

      <PageSection id="dont" title="What we don’t do">
        <p>No ads, no third-party analytics and no tracking cookies. We never sell your data, and the only companies that handle it are the ones listed next, to run the service.</p>
      </PageSection>

      <PageSection id="who" title="Who helps run Ada Editor">
        <ul className="page-grid">
          <li><h3>Supabase</h3><p>Stores your account, documents and images, on Amazon Web Services in Ohio, USA.</p></li>
          <li><h3>Vercel</h3><p>Hosts the website.</p></li>
          <li><h3>Resend</h3><p>Sends the sign-in emails, and receives email sent to adaedit.com addresses (it keeps its own copy).</p></li>
        </ul>
        <p>Like any web service, they keep short-lived technical logs, which include IP addresses.</p>
      </PageSection>

      <PageSection id="how-long" title="How long we keep it">
        <p>Until you delete your account. Deleting it removes your account, every document and image in it and any messages you sent us while signed in, straight away.</p>
        <p>
          Messages sent without an account, and emails to adaedit.com addresses, are kept until we delete them.{' '}
          <Link href="/contact">Ask us to delete yours</Link> at any time.
        </p>
        <p>Visit counts are kept for 13 months.</p>
      </PageSection>

      <PageSection id="choices" title="Your choices">
        <ul>
          <li>Download any document as a web page with <strong>Export HTML</strong> in the editor.</li>
          <li>Delete your account below, at any time.</li>
          <li>Ask us anything about your data, or to delete a message you sent, from the <Link href="/contact">contact page</Link>.</li>
        </ul>
        <div className="page-account"><AccountControls /></div>
      </PageSection>

      <PageSection id="changes" title="Changes">
        <p>If this page changes, the date at the top changes with it.</p>
      </PageSection>
    </SitePage>
  );
}
