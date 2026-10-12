import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../../research/research.css';

export const metadata: Metadata = pageMetadata('/guides/word-to-tagged-pdf');

const HEADLINE = 'How to turn a Word document into a tagged PDF';

/* Every claim here traces to a source listed at the bottom: Microsoft's and
 * Google's own documentation and announcements, LibreOffice's help, or Ada
 * Editor's own code (app/_import/importDocx.ts, app/_editor/exportPdf.ts,
 * /accessibility). Say "our reading" where it isn't a source's own words. A
 * change to what this page says is a new `updated` date in app/_site/pages.ts
 * and a line under Corrections. No `current`: the footer doesn't list this
 * page. */

export default function Page() {
  return (
    <Site>
      <JsonLd data={articleData('/guides/word-to-tagged-pdf', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Guide</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            Build the structure in Word first, then export with tags turned on, then check the PDF. The export can only
            carry the headings, lists, tables and alt text the document already has, and printing the document to PDF instead usually loses them.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Covers</dt><dd>Word for Windows, Mac and the web; Google Docs; LibreOffice; Ada Editor</dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['before', 'Before you export'], ['export', 'Export, program by program'], ['check', 'Check the PDF'], ['post', 'Then post it'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="before" aria-labelledby="before-title">
            <h2 id="before-title">Before you export</h2>
            <p>A tagged PDF is only as good as the document it came from. In Word:</p>
            <ul>
              <li><strong>Headings:</strong> use the built-in heading styles (Heading 1, Heading 2…), in order, not bold or large text.</li>
              <li><strong>Lists:</strong> use the bullet and numbering buttons, not typed dashes or numbers.</li>
              <li><strong>Tables:</strong> mark the first row as a header. Microsoft’s steps use the Design tab (Table Design in current Word), then Header Row. Also set Table Properties, Row, “Repeat as header row at the top of each page”: that is the setting Ada Editor reads when it imports a table.</li>
              <li><strong>Images:</strong> give each meaningful image alt text that conveys its content and purpose, as Microsoft puts it, and mark purely decorative ones as decorative. For maps, site plans and charts, see our <Link href="/guides/alt-text-maps-site-plans">guide to describing complex images</Link>.</li>
              <li><strong>Title and language:</strong> give the document a title in its properties, and make sure its language is set correctly. WCAG asks for both (2.4.2 Page Titled, 3.1.1 Language of Page).</li>
              <li><strong>Check:</strong> in Word for Windows, choose Review, then Check Accessibility, and fix what it finds. Microsoft says to do this before making the PDF.</li>
            </ul>
            <p>
              Our free <Link href="/guides/accessible-agenda-minutes-templates">agenda and minutes templates</Link> have
              these in place already.
            </p>
          </section>

          <section id="export" aria-labelledby="export-title">
            <h2 id="export-title">Export, program by program</h2>

            <section aria-labelledby="x-windows">
              <h3 id="x-windows">Word for Windows</h3>
              <ol>
                <li>Choose File, then Save As or Save a Copy.</li>
                <li>Choose PDF as the file type, then Options.</li>
                <li>Make sure “Document structure tags for accessibility” is selected, then OK, then Save.</li>
              </ol>
              <p>
                Microsoft improved what this export tags in Office 2024 and Microsoft 365 version 2408 and later:
                nested lists, alt text and text in more than one language read better, and decorative images are
                skipped. Our advice: on older versions, check the result more carefully.
              </p>
            </section>

            <section aria-labelledby="x-mac">
              <h3 id="x-mac">Word for Mac</h3>
              <p>
                Choose File, Save As, then PDF as the file format, and select “Best for electronic distribution and
                accessibility (uses Microsoft online service)”. Microsoft says this makes a tagged PDF, and that the
                document is sent to a Microsoft service over the internet for conversion.
              </p>
            </section>

            <section aria-labelledby="x-web">
              <h3 id="x-web">Word for the web</h3>
              <p>Choose File, Save As, then Download as PDF, which Microsoft lists among its ways to create an accessible PDF. Microsoft doesn’t say whether this PDF is tagged, so check it.</p>
            </section>

            <section aria-labelledby="x-google">
              <h3 id="x-google">Google Docs</h3>
              <p>
                Choose File, Download, then the PDF option. In December 2024 Google said it had improved the tagging
                of exported PDFs for paragraphs, headings, links, image alt text and lists, with the rollout expected
                to finish by mid-January 2025. Tables aren’t on Google’s list, so check them in the PDF.
              </p>
            </section>

            <section aria-labelledby="x-libreoffice">
              <h3 id="x-libreoffice">LibreOffice Writer</h3>
              <p>
                Choose File, Export As, then Export as PDF. On the General tab, select “Universal Accessibility
                (PDF/UA)”, which LibreOffice says follows the requirements of PDF/UA (ISO 14289), or at least
                “Tagged PDF (add document structure)”.
              </p>
            </section>

            <section aria-labelledby="x-ada">
              <h3 id="x-ada">Ada Editor</h3>
              <p>
                Import the .docx file, and Ada Editor reads it in your browser: the file isn’t uploaded. It brings
                across the structure Word marked, never what only looks like structure, and tells you about anything it
                couldn’t bring, such as footnotes, nested tables and charts. It checks the document against its rules as you edit, then exports a tagged PDF that
                declares PDF/UA-1, also in your browser. PDF export covers Latin scripts only; HTML export works for
                every language. It won’t tell you the result is compliant:{' '}
                <Link href="/guides/ada-compliant-pdf">no tool can</Link>.
              </p>
            </section>

            <p>
              Whatever you use, don’t print a Word document to PDF, whether through Print to PDF or a Mac’s print
              dialog. In our sample of one agenda platform’s attachments, the files made by printing to PDF carried no
              structure at all.
            </p>
          </section>

          <section id="check" aria-labelledby="check-title">
            <h2 id="check-title">Check the PDF</h2>
            <ul>
              <li><strong>Run a checker.</strong> PAC (free, for Windows) checks PDF/UA and WCAG; veraPDF (open source) validates PDF/UA.</li>
              <li><strong>Have a person read it,</strong> ideally with a screen reader, for what software can’t judge: whether the headings make sense, whether the alt text says what the image is for.</li>
            </ul>
          </section>

          <section id="post" aria-labelledby="post-title">
            <h2 id="post-title">Then post it</h2>
            <p>
              Some agenda and document systems strip tags when they publish a file. Our{' '}
              <Link href="/help#posting">steps for posting a PDF to an agenda system</Link> say how to keep the copy
              people open the one you made.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              Menus move between versions. These steps are from each maker’s documentation as read on the date below,
              not tested in every version. This guide isn’t legal advice.
            </p>
            <p>
              Found a step that’s wrong or out of date?{' '}
              <a href="https://github.com/Ruckus000/Ada-editor/issues/new?title=Guide%20correction%3A%20">Report a correction to this guide</a>{' '}
              (public, on GitHub).
            </p>
            <p>None yet.</p>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Sources</h2>
            <p>Read on October 12, 2026.</p>
            <ul className="research__sources">
              <li>Microsoft, <a href="https://support.microsoft.com/en-us/office/create-accessible-pdfs-064625e0-56ea-4e16-ad71-3aa33bb4b7ed">Create accessible PDFs</a>.</li>
              <li>Microsoft, <a href="https://support.microsoft.com/en-us/office/make-your-word-documents-accessible-to-people-with-disabilities-d9bf3683-87ac-47ea-b91a-78dcacb3c66d">Make your Word documents accessible to people with disabilities</a>.</li>
              <li>Microsoft, <a href="https://support.microsoft.com/en-us/article/2ff677e0-3150-464a-a283-fa52794b4b41">Repeat a table header row</a>, and <a href="https://support.microsoft.com/en-us/office/add-alternative-text-to-a-shape-picture-chart-smartart-graphic-or-other-object-44989b2a-903c-4d9a-b742-6a75b451c669">Add alternative text</a> (including marking an image as decorative).</li>
              <li>Microsoft 365 Platform team, <a href="https://devblogs.microsoft.com/microsoft365dev/accessibility-improvements-in-microsoft-365-pdf-export">Accessibility improvements in Microsoft 365 PDF export</a> (December 2, 2024).</li>
              <li>Google Workspace Updates, <a href="https://workspaceupdates.googleblog.com/2024/12/release-notes-12-06-2024.html">release notes, December 6, 2024</a>: improved accessibility tagging in PDFs exported from Google Docs.</li>
              <li>Google, <a href="https://support.google.com/docs/answer/49114">Download a file</a> (Docs Editors Help).</li>
              <li>LibreOffice Help, <a href="https://help.libreoffice.org/latest/en-US/text/shared/01/ref_pdf_export_general.html">PDF export, General tab</a>.</li>
              <li>W3C, <a href="https://www.w3.org/TR/WCAG21/">WCAG 2.1</a>: 2.4.2 and 3.1.1.</li>
              <li><a href="https://pac.pdf-accessibility.org/en/download">PAC</a> and <a href="https://verapdf.org/">veraPDF</a>.</li>
              <li>Ada Editor: our <Link href="/accessibility">accessibility statement</Link> (PDF export limits), <a href="https://github.com/Ruckus000/Ada-editor/blob/main/app/_import/importDocx.ts">Word import code</a>, and <a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/agenda-platforms-2026-10.md">agenda-platform research record</a> (printed-to-PDF attachments).</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
