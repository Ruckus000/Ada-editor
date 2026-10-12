import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../../research/research.css';

export const metadata: Metadata = pageMetadata('/guides/alt-text-maps-site-plans');

const HEADLINE = 'How to describe maps, site plans and charts in a meeting packet';

/* The method is W3C WAI's (Complex Images tutorial, alt decision tree). The
 * examples are ours, with bracketed placeholders and no real place. Claims
 * about Ada Editor match app/_engine/rules.ts and textHelpers.ts as they are:
 * it doesn't ask about site plans, and it can't mark an image decorative, so
 * this page says neither. Evidence about real packets comes from
 * docs/audit/agenda-platforms-2026-10/. A change to what this page says is a
 * new `updated` date in app/_site/pages.ts and a line under Corrections. */

export default function Page() {
  return (
    <Site>
      <JsonLd data={articleData('/guides/alt-text-maps-site-plans', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Guide</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            Give each one two parts: a short alt text that says what the image is, and the information it carries
            written out in the text nearby. In a packet, that text is often already in the staff report, so the alt
            text can say where to find it.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['answer', 'The short answer'], ['examples', 'What to write, image by image'], ['scans', 'Scanned pages'], ['decorative', 'Decorative images'], ['checkers', 'What a checker can catch'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="answer" aria-labelledby="answer-title">
            <h2 id="answer-title">The short answer</h2>
            <p>
              The W3C’s Web Accessibility Initiative calls maps, charts and diagrams “complex images”: they hold
              “substantial information”, more than a short phrase can carry. For those, it says “a two-part text
              alternative is required”:
            </p>
            <ul>
              <li><strong>A short description</strong> in the alt text that identifies the image, and says where the details are if they’re elsewhere.</li>
              <li><strong>A long description:</strong> “a textual representation of the essential information conveyed by the image”, in text on the same page or one link away.</li>
            </ul>
            <p>
              The test for the long description is the meeting, not the picture: what would someone need from this
              image to follow the item and take part?
            </p>
          </section>

          <section id="examples" aria-labelledby="examples-title">
            <h2 id="examples-title">What to write, image by image</h2>
            <p>These are our examples, with placeholders in square brackets.</p>

            <section aria-labelledby="ex-location">
              <h3 id="ex-location">Location map</h3>
              <p>
                Alt text: “Location map of [address], the site of item [6]. Described in the staff report.” Long
                description: where the site is (the street, the nearest cross street, what it borders) and anything
                the map marks, such as the notice area.
              </p>
            </section>

            <section aria-labelledby="ex-siteplan">
              <h3 id="ex-siteplan">Site plan</h3>
              <p>
                Alt text: “Site plan for [project] at [address]. Details below.” Long description: what is proposed,
                in the order a reader needs it: the buildings and their footprint, parking spaces, driveways and
                access, setbacks, and anything the board is being asked to approve. If the staff report already
                has a table of these, point to it rather than repeating it.
              </p>
            </section>

            <section aria-labelledby="ex-chart">
              <h3 id="ex-chart">Chart or graph</h3>
              <p>
                Alt text: what it shows and the main point, for example “Bar chart of [budget] by department, [year].
                Details below.” Long description: the data itself, as a table with a header row.
              </p>
            </section>

            <section aria-labelledby="ex-photo">
              <h3 id="ex-photo">Photo</h3>
              <p>
                Alt text: what in the photo matters to the item, for example “The [fence] along the [north] side of
                [address], leaning and missing two sections.” Most photos need no long description.
              </p>
            </section>

            <section aria-labelledby="ex-text">
              <h3 id="ex-text">A picture of text</h3>
              <p>
                A scanned letter, a table pasted as a picture, a flyer: W3C’s advice is to put the text of the image in
                the alt text, or, if the same text is also present as real text nearby, to leave the alt empty. For more than a
                few lines, give the text as real text instead.
              </p>
            </section>
          </section>

          <section id="scans" aria-labelledby="scans-title">
            <h2 id="scans-title">Scanned pages</h2>
            <p>
              A page that is only a picture has no text a screen reader can read. Packets carry them: in the packets
              we inspected for our <Link href="/research/agenda-platforms">research on agenda platforms</Link>, a
              scanned grant application was posted as full-page images with no text, and other attachments had pages
              that were images only (<a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/agenda-platforms-2026-10/report.md">our research record</a>).
              Fix it at the source: ask for the original document, or run text recognition (OCR) and have someone
              check the result against the page.
            </p>
          </section>

          <section id="decorative" aria-labelledby="decorative-title">
            <h2 id="decorative-title">Decorative images</h2>
            <p>
              A border, a background or a logo repeated on every page tells the reader nothing. W3C’s advice for an
              image that is “purely decorative” is an empty alt attribute, so screen readers skip it. In Word, mark the
              image as decorative: our <Link href="/guides/word-to-tagged-pdf">Word to tagged PDF guide</Link> links
              Microsoft’s steps.
            </p>
          </section>

          <section id="checkers" aria-labelledby="checkers-title">
            <h2 id="checkers-title">What a checker can catch</h2>
            <p>
              Software can tell that an image has no alt text. It can’t tell whether the alt text says what matters:
              our guide to <Link href="/guides/ada-compliant-pdf">what “ADA compliant PDF” can and can’t mean</Link>{' '}
              explains the split. In the packets we inspected, one platform had given an image the attachment’s name as
              its alt text: present, so a checker, Ada Editor included, passes it, but it describes nothing.
            </p>
            <p>
              Ada Editor flags images with no alt text and alt text that looks like a file name. In English documents
              it also flags alt text that is a single short word or starts “Image of” or similar, and, when the alt
              text calls the image a chart, graph, map or diagram, asks whether it needs a long description.
              Our <Link href="/help#checks">list of the checks Ada Editor runs</Link> gives the wording of each.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              The method is W3C’s; the examples are ours, and what a board needs from a site plan is a judgement the
              people preparing the packet are best placed to make. This guide isn’t legal advice.
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
              <li>W3C WAI, <a href="https://www.w3.org/WAI/tutorials/images/complex/">Complex Images</a> (updated April 8, 2026).</li>
              <li>W3C WAI, <a href="https://www.w3.org/WAI/tutorials/images/decision-tree/">An alt Decision Tree</a>.</li>
              <li>W3C, <a href="https://www.w3.org/TR/WCAG21/#non-text-content">WCAG 2.1, 1.1.1 Non-text Content</a>.</li>
              <li>Our <Link href="/research/agenda-platforms#sources">agenda platform research</Link>, and its <a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/agenda-platforms-2026-10/report.md">record of the packets inspected</a>.</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
