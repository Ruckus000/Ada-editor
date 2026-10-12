import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../../research/research.css';

export const metadata: Metadata = pageMetadata('/guides/accessible-agenda-minutes-templates');

const HEADLINE = 'Free accessible agenda and minutes templates';

/* The templates are built from templates/*.source.html (templates/README.md),
 * and scripts/verify-rules.mjs checks the served files with our own importer
 * and checker. Every other claim traces to a source listed at the bottom: the
 * WCAG 2.1 criteria, Microsoft's export steps, or our Title II guide. A change
 * to what this page or a template says is a new `updated` date in
 * app/_site/pages.ts and a line under Corrections. No `current`: the footer
 * doesn't list this page. */

export default function Page() {
  return (
    <Site>
      <JsonLd data={articleData('/guides/accessible-agenda-minutes-templates', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Guide</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            Two Word templates, one for a meeting agenda and one for its minutes, free and with no account. They use
            real headings, lists and table header rows, so the structure a screen reader follows can carry through
            to a tagged PDF.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Format</dt><dd>Word (.docx): opens in Word, Google Docs and LibreOffice</dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['download', 'Download'], ['inside', 'What’s inside, and why'], ['use', 'Using them'], ['minutes', 'Minutes and the Title II rule'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="download" aria-labelledby="download-title">
            <h2 id="download-title">Download</h2>
            <ul>
              <li><a href="/templates/accessible-meeting-agenda-template.docx" download>Meeting agenda template (Word, 8 KB)</a></li>
              <li><a href="/templates/accessible-meeting-minutes-template.docx" download>Meeting minutes template (Word, 8 KB)</a></li>
            </ul>
            <p>
              They’re free to download, fill in and change for your own meetings. Replace the text in square brackets, and keep the heading styles, lists and table
              header rows: each one is there for a reason, below.
            </p>
          </section>

          <section id="inside" aria-labelledby="inside-title">
            <h2 id="inside-title">What’s inside, and why</h2>
            <ul>
              <li><strong>One heading per agenda item,</strong> with its number in the heading text. A screen reader user can list the headings and jump straight to item 6; in Word they appear in the navigation pane. Each heading names its item. (WCAG 1.3.1 Info and Relationships; 2.4.6 Headings and Labels.)</li>
              <li><strong>Real lists</strong> for ways to take part, the consent agenda, reports and attendance, made with Word’s list formatting rather than typed numbers or dashes, so a screen reader can announce how many items there are. (1.3.1.)</li>
              <li><strong>A table for each recorded vote,</strong> with a header row (Member, Vote) marked as a header, so a screen reader can tell you the column name as you move through the votes. (1.3.1.)</li>
              <li><strong>A document title and language</strong> set in the file’s properties, so the title can be shown and announced, and the text is read in English. The title is a placeholder too: change it to your meeting’s. (2.4.2 Page Titled, 3.1.1 Language of Page.)</li>
              <li><strong>Placeholders in square brackets,</strong> not underscores, which a screen reader either skips, so the blank isn’t heard, or reads as a run of symbols, depending on its settings.</li>
              <li><strong>In the agenda, an accommodation line</strong> saying who to contact for another format, and by when.</li>
            </ul>
            <p>
              Both templates pass every check in Ada Editor. Our automated tests import them the way Ada Editor
              imports any Word file, each time our code changes. A template filled in with real content still needs
              checking: alt text, link text and tables you add are yours.
            </p>
          </section>

          <section id="use" aria-labelledby="use-title">
            <h2 id="use-title">Using them</h2>
            <ol>
              <li><strong>Fill it in, keeping the styles.</strong> Change the document’s title in its properties (in Word, under File, then Info or Properties) to the meeting’s name and date. Add a new item by copying an item heading, not by typing bold text. Give any image alt text, and write links that say what they open.</li>
              <li>
                <strong>Export a tagged PDF.</strong> In Word for Windows, use File, Save As, choose PDF, open Options
                and keep “Document structure tags for accessibility” checked. In Word for Mac, choose PDF and “Best for
                electronic distribution and accessibility”, which Microsoft says sends the document to its online
                service. Don’t print to PDF: it <Link href="/guides/ada-compliant-pdf#how">drops the structure</Link>.
              </li>
              <li><strong>Or import it into Ada Editor,</strong> which checks it as you write and exports a tagged PDF in your browser.</li>
              <li><strong>Post the PDF itself.</strong> Our <Link href="/help#posting">steps for posting a PDF to an agenda system</Link> explain why the copy people open should be the one you made.</li>
            </ol>
          </section>

          <section id="minutes" aria-labelledby="minutes-title">
            <h2 id="minutes-title">Minutes and the Title II rule</h2>
            <p>
              For cities, towns and other public entities, the ADA’s Title II rule covers posted documents. The
              Department of Justice says city council minutes created after the compliance date wouldn’t fall under
              the archive exception, “even if they are posted in the ‘archive’ section” of the city’s website. Our{' '}
              <Link href="/guides/title-ii-meeting-documents">guide to Title II for meeting documents</Link> has the
              dates and exceptions.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              These are templates, not legal advice, and using them doesn’t make a document meet any standard on its
              own: what you put in them decides that.
            </p>
            <p>
              Found something wrong, or something a clerk needs that they lack?{' '}
              <a href="https://github.com/Ruckus000/Ada-editor/issues/new?title=Template%20correction%3A%20">Report it on GitHub</a>{' '}
              (public).
            </p>
            <p>None yet.</p>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Sources</h2>
            <p>Read on October 12, 2026.</p>
            <ul className="research__sources">
              <li>W3C, <a href="https://www.w3.org/TR/WCAG21/">Web Content Accessibility Guidelines (WCAG) 2.1</a>: 1.3.1, 2.4.2, 2.4.6 and 3.1.1.</li>
              <li>Microsoft, <a href="https://support.microsoft.com/en-us/office/create-accessible-pdfs-064625e0-56ea-4e16-ad71-3aa33bb4b7ed">Create accessible PDFs</a>.</li>
              <li>DOJ, <a href="https://www.ada.gov/resources/2024-03-08-web-rule/">fact sheet on the web rule for state and local governments</a>, ada.gov.</li>
              <li>The templates’ sources: <a href="https://github.com/Ruckus000/Ada-editor/tree/main/templates">templates folder in Ada Editor’s public code</a>.</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
