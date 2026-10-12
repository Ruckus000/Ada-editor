import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../../research/research.css';

export const metadata: Metadata = pageMetadata('/guides/ada-compliant-pdf');

const HEADLINE = 'What “ADA compliant PDF” can and can’t mean';

/* Every claim here traces to a source listed at the bottom: the Section 508
 * standards, 28 CFR 35.200, the PDF Association (ISO 14289, the Matterhorn
 * Protocol 1.1), the checkers' own pages, or our agenda-platform research
 * (docs/audit/agenda-platforms-2026-10/report.md). Say "our reading" where it
 * isn't a source's own words, and never call a file compliant. A change to
 * what this page says is a new `updated` date in app/_site/pages.ts and a
 * line under Corrections. No `current`: the footer doesn't list this page. */

export default function Page() {
  return (
    <Site>
      <JsonLd data={articleData('/guides/ada-compliant-pdf', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Guide</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            The ADA doesn’t define a compliant PDF. People who ask for one may mean WCAG 2.1 AA, WCAG 2.0 AA
            (Section 508) or PDF/UA, and no checker, and no label inside the file, can confirm any of them on its own.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Covers</dt><dd>WCAG 2.1 AA, Section 508, PDF/UA-1</dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['answer', 'The short answer'], ['standards', 'Which standard someone means'], ['checkers', 'What a checker can and can’t tell you'], ['has', 'What an accessible PDF has'], ['how', 'How to get one'], ['ours', 'What Ada Editor says about its own PDFs'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="answer" aria-labelledby="answer-title">
            <h2 id="answer-title">The short answer</h2>
            <p>
              The Americans with Disabilities Act sets duties, not file formats. Where a rule names a technical
              standard for documents, it is WCAG: Title II’s web rule uses WCAG 2.1 AA, and Section 508 uses WCAG 2.0
              AA. PDF/UA is an ISO standard for the PDF file itself. “ADA compliant” is a description, not one of
              these standards.
            </p>
            <p>
              A PDF can pass an automated checker, carry a PDF/UA label, and still be hard or impossible to read with a
              screen reader. Some of what these standards ask needs a person to judge.
            </p>
          </section>

          <section id="standards" aria-labelledby="standards-title">
            <h2 id="standards-title">Which standard someone means</h2>
            <ul>
              <li><strong>WCAG 2.1 AA, for state and local governments.</strong> The ADA’s Title II rule holds their web content, posted documents included, to WCAG 2.1 Level A and AA, currently from April 26, 2027 or April 26, 2028 depending on size (every special district: 2028). Our <Link href="/guides/title-ii-meeting-documents">guide to Title II for meeting documents</Link> has the dates and exceptions.</li>
              <li><strong>WCAG 2.0 AA, under Section 508.</strong> Section 508 covers federal agencies. Its standards say electronic content “shall conform to Level A and Level AA Success Criteria and Conformance Requirements in WCAG 2.0”, and excuse documents that aren’t web pages from four criteria (2.4.1, 2.4.5, 3.2.3 and 3.2.4).</li>
              <li><strong>PDF/UA-1 (ISO 14289-1), for the file.</strong> It sets technical requirements for an accessible PDF file, chiefly its tags: the structure that tells assistive technology what each part of the page is. PDF/UA-2 (ISO 14289-2:2024) is its revision for PDF 2.0.</li>
            </ul>
            <p>
              They overlap but aren’t the same. The PDF Association says PDF/UA “provides a means of making PDF files
              that conform to” WCAG, and that conforming to PDF/UA “does not necessarily ensure the accessibility of a
              document’s content”: inaccessible use of colour or contrast, for example, is outside it.
            </p>
          </section>

          <section id="checkers" aria-labelledby="checkers-title">
            <h2 id="checkers-title">What a checker can and can’t tell you</h2>
            <p>
              The PDF Association’s Matterhorn Protocol lists the ways a file can fail PDF/UA-1. Its introduction counts
              136 failure conditions: 87 “can be determined by software alone”, 47 “usually require human judgment”,
              and two have no specific test. Version 1.1 added one more, which needs a person.
            </p>
            <ul>
              <li><strong>Software can tell</strong> whether heading levels skip (an H3 straight after an H1), whether a figure has no alternative text, or whether the file has no title.</li>
              <li><strong>A person has to tell</strong> whether headings were tagged as headings at all, whether something that looks like a list is tagged as one, and whether the title identifies the document.</li>
            </ul>
            <p>
              WCAG adds judgements no file check makes, such as whether alt text serves the same purpose as the image.
              A label proves even less: the PDF/UA identifier is a line of metadata written by the software that made
              the file, and its presence doesn’t show the file meets the standard. In our <Link href="/research/agenda-platforms">research on agenda platforms</Link>,
              a 199-page meeting package one platform built, with no headings, tables, lists or image descriptions, and a converted Word
              file holding nothing but paragraphs, both declared PDF/UA-1.
            </p>
          </section>

          <section id="has" aria-labelledby="has-title">
            <h2 id="has-title">What an accessible PDF has</h2>
            <p>In practice, most of what these standards ask of a PDF comes down to a short list:</p>
            <ul>
              <li><strong>Real tags:</strong> headings, lists and tables tagged as what they are, with header cells marked.</li>
              <li><strong>A reading order</strong> that follows the meaning, with page numbers and decoration marked so screen readers skip them.</li>
              <li><strong>Alternative text</strong> that serves the same purpose as each meaningful image.</li>
              <li><strong>A language and a title,</strong> so a screen reader pronounces it correctly and announces what it is.</li>
              <li><strong>Links whose purpose is clear</strong> from their text or its context, and colour that isn’t the only way to tell things apart.</li>
              <li><strong>Enough contrast</strong> between text and background.</li>
            </ul>
            <p>
              Our <Link href="/help#checks">list of the checks Ada Editor runs</Link> names the WCAG success criterion
              behind each one.
            </p>
          </section>

          <section id="how" aria-labelledby="how-title">
            <h2 id="how-title">How to get one</h2>
            <ol>
              <li><strong>Make it accessible where you write it.</strong> Use real headings, lists and tables in Word or your editor, and write alt text there. A tagged export can only carry the structure the source document has. For meetings, our <Link href="/guides/accessible-agenda-minutes-templates">agenda and minutes templates</Link> have it built in.</li>
              <li><strong>Export a tagged PDF.</strong> Use the export option that keeps tags. Don’t print a Word document to PDF, through Print to PDF or the print dialog’s Save as PDF: in our sample of one agenda platform’s attachments, printed files carried no structure at all. Our guide to <Link href="/guides/word-to-tagged-pdf">turning a Word document into a tagged PDF</Link> has the steps for each program.</li>
              <li><strong>Run a checker.</strong> PAC (free, for Windows) checks PDF/UA and WCAG; veraPDF (free and open source) validates PDF/UA. Fix what they find.</li>
              <li><strong>Have a person read it,</strong> ideally with a screen reader, for the things software can’t judge.</li>
              <li><strong>Check the copy you posted.</strong> Some agenda and document systems strip tags when they publish. Our <Link href="/help#posting">steps for posting a PDF to an agenda system</Link> cover what to do.</li>
            </ol>
          </section>

          <section id="ours" aria-labelledby="ours-title">
            <h2 id="ours-title">What Ada Editor says about its own PDFs</h2>
            <p>
              Ada Editor, whose maker publishes this guide, exports tagged PDFs that declare PDF/UA-1. We test the
              exporter with veraPDF in our automated tests, as our{' '}
              <Link href="/accessibility">accessibility statement</Link> says, on sample documents. That tests our
              exporter, not your document: whatever the checker flags in your document is still in the PDF.
            </p>
            <p>
              It won’t call your PDF compliant. It marks what software found, and what needs your call.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              This guide explains the standards. It isn’t legal advice: whether a document meets your obligations is a
              question for your attorney.
            </p>
            <p>
              Found something wrong or out of date?{' '}
              <a href="https://github.com/Ruckus000/Ada-editor/issues/new?title=Guide%20correction%3A%20">Report a correction to this guide</a>{' '}
              (public, on GitHub).
            </p>
            <ul>
              <li><time dateTime="2026-10-12">12 October 2026</time>: the advice against printing to PDF now applies to printing a Word document, and says where our evidence comes from. It had read as true of every print-to-PDF route, and some browsers do make tagged PDFs when they print.</li>
            </ul>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Sources</h2>
            <p>Read on October 12, 2026.</p>
            <ul className="research__sources">
              <li>U.S. Access Board, <a href="https://www.access-board.gov/ict/">Revised Section 508 Standards</a>, 36 CFR part 1194, E205.4 and 702.10.1.</li>
              <li>28 CFR 35.200, <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H/section-35.200">requirements for web and mobile accessibility</a>, as amended April 20, 2026.</li>
              <li>W3C, <a href="https://www.w3.org/TR/WCAG21/">Web Content Accessibility Guidelines (WCAG) 2.1</a>.</li>
              <li>PDF Association, <a href="https://pdfa.org/resource/iso-14289-pdfua/">ISO 14289-1 (PDF/UA-1)</a>, including its context and limitations.</li>
              <li>PDF Association, <a href="https://pdfa.org/resource/the-matterhorn-protocol/">The Matterhorn Protocol 1.1</a> (April 2021).</li>
              <li><a href="https://pac.pdf-accessibility.org/en/download">PAC 2026</a>, download page and system requirements.</li>
              <li><a href="https://verapdf.org/">veraPDF</a>, the open-source PDF/A and PDF/UA validator.</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
