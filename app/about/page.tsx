import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '../_site/pages';
import { Site, Toc } from '../_site/Site';

export const metadata: Metadata = pageMetadata('/about');

/* Who makes Ada Editor and why, for people deciding whether to trust it with
 * their documents, and for search engines and AI assistants telling it apart
 * from the other products named "Ada". Facts only: every date and promise
 * here is one the product or the record (docs/audit/) already stands behind. */

export default function Page() {
  return (
    <Site current="about">
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">About</p>
          <h1 id="page-title">Documents everyone can read, written that way from the start.</h1>
          <p className="site-lede">
            Ada Editor is a document editor that checks your writing against WCAG 2.1 AA as you type. It is made and
            run by YourLaunchPad LLC.
          </p>
          <dl className="site-facts">
            <div><dt>Made by</dt><dd><a href="https://yourlaunchpad.org">YourLaunchPad LLC</a></dd></div>
            <div><dt>Price</dt><dd>Free during early access</dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement">
        <Toc items={[['why', 'Why it exists'], ['promise', 'What we promise'], ['contact', 'Reach a person']]} />
        <div className="site-col">
          <section id="why" aria-labelledby="why-title">
            <h2 id="why-title">Why it exists</h2>
            <p>
              Agendas, minutes, notices and reports are how cities, towns, schools and nonprofits tell people what is
              happening. Posted as documents, they often can’t be read with a screen reader, navigated by keyboard or
              followed by someone who needs plain structure.
            </p>
            <p>
              The ADA’s <Link href="/guides/title-ii-meeting-documents">Title II rule</Link> now holds state and local governments’ web content, documents included, to
              WCAG 2.1 AA: from April 26, 2027 for those serving 50,000 people or more, and from April 26, 2028 for
              smaller ones and special districts. The Department of Justice set those dates in April 2026, and a
              lawsuit asks a court to set that extension aside.
            </p>
            <p>
              Most accessibility problems are made while a document is written, and most checkers find them only
              afterwards. Ada Editor checks as you write, cites the WCAG success criterion behind every finding, and
              exports tagged PDF (PDF/UA-1) and HTML built from the same structure.
            </p>
          </section>

          <section id="promise" aria-labelledby="promise-title">
            <h2 id="promise-title">What we promise</h2>
            <ul>
              <li>
                <strong>No compliance claims.</strong> Automated checks cover only part of WCAG, so Ada Editor never
                calls a document compliant. What needs a person is marked “Needs your call”. Our guide explains{' '}
                <Link href="/guides/ada-compliant-pdf">what “ADA compliant PDF” can and can’t mean</Link>.
              </li>
              <li>
                <strong>Your Word files stay with you.</strong> They are read in your browser; the file itself is never
                uploaded, only the document made from it.
              </li>
              <li>
                <strong>The editor is held to the standard it checks.</strong> Where it falls short, the{' '}
                <Link href="/accessibility">accessibility statement</Link> says so.
              </li>
              <li>
                <strong>Your documents are yours.</strong> No ads, nothing sold, and the{' '}
                <Link href="/privacy">privacy notice</Link> lists everything we keep and count.
              </li>
            </ul>
          </section>

          <section id="contact" aria-labelledby="contact-title">
            <h2 id="contact-title">Reach a person</h2>
            <p>
              Signed in, send us a message from the <Link href="/privacy#contact">privacy page’s form</Link>. It
              reaches the people who build Ada Editor.
            </p>
            <p>
              Without an account, open an issue on <a href="https://github.com/Ruckus000/Ada-editor/issues">Ada Editor’s
              GitHub repository</a>, where the code and research are public.
            </p>
          </section>
        </div>
      </div>
    </Site>
  );
}
