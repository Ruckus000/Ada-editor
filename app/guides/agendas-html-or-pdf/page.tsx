import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../../research/research.css';

export const metadata: Metadata = pageMetadata('/guides/agendas-html-or-pdf');

const HEADLINE = 'Should meeting agendas be a web page or a PDF?';

/* The owner's ruling (2026-10-12): both, HTML first. The one outside source is
 * GDS (2018); vendor quotes and the Title II rule are linked, not restated, so
 * they stay in one place (/research/agenda-platforms, the Title II guide). Say
 * "our reading" where it isn't a source's words. A change to what this page
 * says is a new `updated` date in app/_site/pages.ts and a line under
 * Corrections. No `current`: the footer doesn't list this page. */

export default function Page() {
  return (
    <Site>
      <JsonLd data={articleData('/guides/agendas-html-or-pdf', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Guide</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            Both, written once. Post the agenda as a web page where your website allows it, and link a tagged PDF from
            that page for printing and the record. Where your system only takes files, post the tagged PDF.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['why', 'Why the page comes first'], ['copies', 'The HTML copies agenda systems sell'], ['both', 'Doing both from one draft'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="why" aria-labelledby="why-title">
            <h2 id="why-title">Why the page comes first</h2>
            <p>
              In 2018 the head of GOV.UK set out the case on the Government Digital Service blog: “The default should
              be to create all content in HTML.” His reasons fit an agenda too:
            </p>
            <ul>
              <li>“Compared with HTML content, information published in a PDF is harder to find, use and maintain.”</li>
              <li>“PDFs are not designed to be flexible in their layout”, so they don’t adapt to a phone screen the way a page does.</li>
              <li>“…unless created with sufficient care PDFs can often be bad for accessibility”.</li>
            </ul>
            <p>
              It didn’t ban PDFs: “If you can’t avoid publishing a PDF, ideally it should be in addition to an HTML
              version and the PDF must meet accessibility standards and archiving standards.” For an agenda, the PDF is the printable copy with fixed pages, and often the file of record. A
              tagged one can be accessible too: our guide to{' '}
              <Link href="/guides/ada-compliant-pdf">what “ADA compliant PDF” can and can’t mean</Link> explains what
              that takes. The ADA’s Title II rule covers both formats once they’re posted, and names neither as better:
              our guide to <Link href="/guides/title-ii-meeting-documents">Title II for meeting documents</Link> has the dates.
            </p>
          </section>

          <section id="copies" aria-labelledby="copies-title">
            <h2 id="copies-title">The HTML copies agenda systems sell</h2>
            <p>
              Two large agenda vendors, CivicPlus and Diligent, now offer the same add-on: a web view generated beside
              the PDF, which stays unchanged. Our <Link href="/research/agenda-platforms#vendors">research on agenda
              platforms</Link> quotes what each says. Other systems build their own web views of the agenda, and in
              our spot checks some had no headings, or an empty title and no language. Our reading: a generated copy
              is only as good as the document it’s made from, and we found no independent audit of DocAccess’s web
              views. If your system offers one, open it and check that it has a title, real headings and the right
              language.
            </p>
          </section>

          <section id="both" aria-labelledby="both-title">
            <h2 id="both-title">Doing both from one draft</h2>
            <ol>
              <li><strong>Write it with real headings and lists,</strong> in Word, your website’s page editor or Ada Editor. Our <Link href="/guides/accessible-agenda-minutes-templates">agenda template</Link> starts you off.</li>
              <li><strong>Publish the page.</strong> If your website has a page editor, paste or rebuild the agenda there with its headings. Ada Editor can also export a standalone web page; our reading is that many website systems only accept content entered in their own editor, so ask whoever runs your site whether it can host one.</li>
              <li><strong>Make the tagged PDF</strong> from the same draft, following our guide to <Link href="/guides/word-to-tagged-pdf">turning a Word document into a tagged PDF</Link>.</li>
              <li><strong>Link the PDF from the page,</strong> with its format and size in the link, for example “Agenda (PDF, 120 KB)”.</li>
              <li><strong>If you also post through an agenda system,</strong> follow our <Link href="/help#posting">steps for posting a PDF to an agenda system</Link>.</li>
            </ol>
            <p>
              Ada Editor’s web page export works for every language; its PDF export covers Latin scripts only, as our{' '}
              <Link href="/accessibility">accessibility statement</Link> says.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              This guide is our recommendation, not legal advice: neither format is required by the ADA over the other.
            </p>
            <p>
              Found something wrong or out of date?{' '}
              <a href="https://github.com/Ruckus000/Ada-editor/issues/new?title=Guide%20correction%3A%20">Report a correction to this guide</a>{' '}
              (public, on GitHub).
            </p>
            <p>None yet.</p>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Sources</h2>
            <p>Read on October 12, 2026.</p>
            <ul className="research__sources">
              <li>Neil Williams, Government Digital Service, <a href="https://gds.blog.gov.uk/2018/07/16/why-gov-uk-content-should-be-published-in-html-and-not-pdf/">Why GOV.UK content should be published in HTML and not PDF</a> (July 16, 2018).</li>
              <li>Vendor statements on HTML views: the sources listed on our <Link href="/research/agenda-platforms#sources">agenda platform research</Link>.</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
