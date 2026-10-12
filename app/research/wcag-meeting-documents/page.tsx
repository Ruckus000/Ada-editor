import type { Metadata } from 'next';
import Link from 'next/link';
import { RULES } from '../../_engine/rules';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../research.css';

export const metadata: Metadata = pageMetadata('/research/wcag-meeting-documents');

const HEADLINE = 'WCAG 2.1 AA in meeting documents: what software can decide, and what needs a person';

/* The sorting below is ours, read against W3C's Understanding WCAG 2.1 and
 * WCAG2ICT; each row carries its reason so a reader can disagree row by row.
 * The counts are computed from CRITERIA, and the Ada Editor column from RULES
 * (app/_engine/rules.ts), so neither can drift from the table. EXPORT matches
 * app/_editor/exportPdf.ts. The record is docs/audit/search-and-ai-2026-10.md,
 * item 7. A change to what this page says is a new `updated` date in
 * app/_site/pages.ts and a line under Corrections. */

type Decides = 'software' | 'partly' | 'person' | 'format';

const DECIDES: Record<Decides, string> = {
  software: 'Software',
  partly: 'Partly software',
  person: 'A person',
  format: 'The file format',
};

/** When a criterion comes up: in every meeting document, or only when it has one of these. */
const WHEN = {
  always: 'Every agenda, packet or set of minutes',
  media: 'A recording, video or audio',
  form: 'A fillable form',
  interactive: 'Moving, timed or interactive content',
  graphics: 'Charts, maps or diagrams',
  set: 'A set of documents',
} as const;

type When = keyof typeof WHEN;

const CRITERIA: [sc: string, name: string, level: 'A' | 'AA', when: When, decides: Decides, why: string][] = [
  ['1.1.1', 'Non-text Content', 'A', 'always', 'partly', 'Software can tell an image has no alt text. Whether the alt text says what the image means takes a person.'],
  ['1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', 'media', 'person', 'A transcript or description exists or it doesn’t, but whether it matches the recording takes a person.'],
  ['1.2.2', 'Captions (Prerecorded)', 'A', 'media', 'person', 'Software can tell whether a video has a caption track, but not captions burned into the picture, or whether they’re accurate.'],
  ['1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', 'media', 'person', 'Whether the description covers what’s shown takes a person.'],
  ['1.2.4', 'Captions (Live)', 'AA', 'media', 'person', 'Live captions are judged as they happen.'],
  ['1.2.5', 'Audio Description (Prerecorded)', 'AA', 'media', 'person', 'Whether the description covers what’s shown takes a person.'],
  ['1.3.1', 'Info and Relationships', 'A', 'always', 'partly', 'Software can tell a document has no structure at all: a PDF with no tags fails whenever it has headings, lists or tables. Whether a bold line is really a heading, or a table really holds data, takes a person.'],
  ['1.3.2', 'Meaningful Sequence', 'A', 'always', 'person', 'Software can show the reading order. Whether it makes sense around columns, text boxes and footnotes takes a person.'],
  ['1.3.3', 'Sensory Characteristics', 'A', 'always', 'person', 'An instruction such as “see the map on the right” or “the shaded parcel” takes a person to notice.'],
  ['1.3.4', 'Orientation', 'AA', 'always', 'format', 'A Word file or PDF can’t lock the screen to portrait or landscape; the viewer turns it.'],
  ['1.3.5', 'Identify Input Purpose', 'AA', 'form', 'partly', 'Only for formats that can mark what a field asks for, such as a web form; W3C’s guidance puts document formats without that out of scope. There, software can check the fields that ask for a name, address or phone number say so in code.'],
  ['1.4.1', 'Use of Color', 'A', 'always', 'person', 'Software can flag words like “in red”. A chart or map that uses colour alone takes a person to spot.'],
  ['1.4.2', 'Audio Control', 'A', 'media', 'person', 'Software can find sound that plays on its own. Whether it can be paused or stopped is checked by trying.'],
  ['1.4.3', 'Contrast (Minimum)', 'AA', 'always', 'partly', 'Software measures text on a plain background. Text over a photo or a gradient takes a person.'],
  ['1.4.4', 'Resize Text', 'AA', 'always', 'format', 'Readers zoom in their viewer. W3C’s guidance for documents says a viewer that zooms to 200% meets it, unless the content doesn’t work with that zoom.'],
  ['1.4.5', 'Images of Text', 'AA', 'always', 'person', 'Software can point to pages with no text in them, such as scans. Whether a picture is a picture of text takes a person.'],
  ['1.4.10', 'Reflow', 'AA', 'always', 'person', 'Someone narrows a web page to 320 pixels and reads it. For a PDF, W3C’s guidance for documents warns that where a format’s viewers don’t reflow, meeting it “may not be possible”.'],
  ['1.4.11', 'Non-text Contrast', 'AA', 'graphics', 'person', 'Which lines and shapes are needed to understand a graphic takes a person. Their contrast can then be measured.'],
  ['1.4.12', 'Text Spacing', 'AA', 'always', 'person', 'It applies where readers can change the spacing, as on a web page; W3C’s guidance for documents leaves out formats where they can’t, as in most PDFs. A person widens the spacing and looks for text that’s cut off.'],
  ['1.4.13', 'Content on Hover or Focus', 'AA', 'interactive', 'person', 'Pop-ups that appear on hover are checked by using them.'],
  ['2.1.1', 'Keyboard', 'A', 'always', 'person', 'Every link, and every field in a form, has to work from the keyboard. Someone tabs through them with the keyboard alone.'],
  ['2.1.2', 'No Keyboard Trap', 'A', 'form', 'person', 'Someone tabs through the form and checks they can leave every field.'],
  ['2.1.4', 'Character Key Shortcuts', 'A', 'interactive', 'person', 'Only content that adds its own single-key shortcuts, checked by trying them.'],
  ['2.2.1', 'Timing Adjustable', 'A', 'interactive', 'person', 'Whether a time limit can be turned off or extended is checked by trying.'],
  ['2.2.2', 'Pause, Stop, Hide', 'A', 'interactive', 'person', 'Whether moving or updating content can be paused is checked by trying.'],
  ['2.3.1', 'Three Flashes or Below Threshold', 'A', 'media', 'software', 'Flash-analysis tools check video frame by frame.'],
  ['2.4.1', 'Bypass Blocks', 'A', 'set', 'person', 'Whether readers can skip what repeats from document to document takes a person.'],
  ['2.4.2', 'Page Titled', 'A', 'always', 'partly', 'Software can tell a file has no title. Whether the title identifies the document takes a person.'],
  ['2.4.3', 'Focus Order', 'A', 'always', 'person', 'Whether moving through the links with the Tab key follows a sensible order takes a person.'],
  ['2.4.4', 'Link Purpose (In Context)', 'A', 'always', 'partly', 'Software can find a link with no words at all, and point to “click here” and bare web addresses. Whether a link’s words, with their sentence, say where it goes takes a person.'],
  ['2.4.5', 'Multiple Ways', 'AA', 'set', 'person', 'Whether there’s more than one way to find a document in the set takes a person.'],
  ['2.4.6', 'Headings and Labels', 'AA', 'always', 'person', 'Whether each heading describes its section takes a person.'],
  ['2.4.7', 'Focus Visible', 'AA', 'always', 'format', 'The viewer or browser shows which link has focus, unless a web page’s styles hide it.'],
  ['2.5.1', 'Pointer Gestures', 'A', 'interactive', 'person', 'Swipes, pinches and drawn paths need a single tap or click as well, checked by trying.'],
  ['2.5.2', 'Pointer Cancellation', 'A', 'interactive', 'person', 'Checked by pressing and sliding off a control.'],
  ['2.5.3', 'Label in Name', 'A', 'always', 'partly', 'Software can compare the words a link or field shows with its name in code. Labels in pictures take a person.'],
  ['2.5.4', 'Motion Actuation', 'A', 'interactive', 'person', 'Only content worked by shaking or tilting, checked by trying.'],
  ['3.1.1', 'Language of Page', 'A', 'always', 'partly', 'Software can tell whether a language is set. Whether it’s the right one, it can only ask: a guess from the text isn’t certain, least of all in a bilingual agenda.'],
  ['3.1.2', 'Language of Parts', 'AA', 'always', 'person', 'Software can point to passages that look like another language. Whether they are, or are names and borrowed words, takes a person.'],
  ['3.2.1', 'On Focus', 'A', 'form', 'person', 'Checked by moving through the fields and watching what happens.'],
  ['3.2.2', 'On Input', 'A', 'form', 'person', 'Checked by filling in the fields and watching what happens.'],
  ['3.2.3', 'Consistent Navigation', 'AA', 'set', 'person', 'Whether navigation that repeats stays in the same order takes a person.'],
  ['3.2.4', 'Consistent Identification', 'AA', 'set', 'person', 'Whether things that do the same job are named the same way takes a person.'],
  ['3.3.1', 'Error Identification', 'A', 'form', 'person', 'Checked by making mistakes on purpose.'],
  ['3.3.2', 'Labels or Instructions', 'A', 'form', 'partly', 'Software can find fields with no label. Whether the instructions are enough takes a person.'],
  ['3.3.3', 'Error Suggestion', 'AA', 'form', 'person', 'Whether an error message says how to fix it takes a person.'],
  ['3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', 'form', 'person', 'Whether a submission can be checked, corrected or undone is checked by trying.'],
  ['4.1.1', 'Parsing', 'A', 'always', 'format', 'The current WCAG 2.1 says it “should be considered as always satisfied” for HTML and XML, which covers a web page and a Word file, and W3C’s guidance for documents says the same of a PDF. The Title II rule cites the 2018 printing, which predates that note.'],
  ['4.1.2', 'Name, Role, Value', 'A', 'always', 'partly', 'Software can tell a link or form field has no name or role. Whether its state and value are announced as they change takes a person.'],
  ['4.1.3', 'Status Messages', 'AA', 'interactive', 'person', 'Whether a screen reader hears a message that appears without moving focus is checked by listening.'],
];

/** What Export PDF does for a criterion, whatever the checker finds (exportPdf.ts). */
const EXPORT: Record<string, string> = {
  '1.3.2': 'Export PDF tags the content in the document’s own order',
  '2.4.2': 'Export PDF writes the document’s title (or “Untitled document”) into the file and asks viewers to show it',
};

const scOf = (criterion: string) => criterion.split(' ')[0] ?? criterion;
const rulesFor = (sc: string) => RULES.filter((r) => scOf(r.criterion) === sc);
const always = CRITERIA.filter((c) => c[3] === 'always');
const count = (d: Decides) => always.filter((c) => c[4] === d).length;
const checked = always.filter(([sc]) => rulesFor(sc).length > 0).length;
const listed = new Set(CRITERIA.map(([sc]) => sc));
const beyond = RULES.filter((r) => !listed.has(scOf(r.criterion)));
const beyondCriteria = [...new Set(beyond.map((r) => r.criterion))];
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const say = (n: number) => WORDS[n] ?? String(n);

function InAda({ sc }: { sc: string }) {
  const rules = rulesFor(sc);
  const exported = EXPORT[sc];
  if (rules.length === 0 && !exported) return <>Not checked</>;
  return (
    <>
      {rules.map((r, i) => (
        <span key={r.id}>{i > 0 && '; '}<Link href={`/help#rule-${r.id}`}>{r.name}</Link></span>
      ))}
      {exported && <>{rules.length > 0 && '. '}{exported}</>}
    </>
  );
}

export default function Page() {
  return (
    <Site>
      <JsonLd data={articleData('/research/wcag-meeting-documents', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Research</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            Of the {always.length} WCAG 2.1 Level A and AA criteria that come up in every agenda, packet or set of
            minutes, software can decide {count('software') === 0 ? 'none' : say(count('software'))} on its own. It can
            catch some failures of {say(count('partly'))}, {say(count('person'))} need a person, and the file format
            usually takes care of the other {say(count('format'))}. That’s our own sorting, criterion by criterion, below.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['answer', 'The short answer'], ['every', 'The criteria in every meeting document'], ['sometimes', 'The ones that depend on what’s in it'], ['documents', 'Where documents differ'], ['misses', 'What a checker misses'], ['fixes', 'What a checker can fix'], ...(beyond.length > 0 ? [['beyond', 'Beyond AA'] as [string, string]] : []), ['method', 'How we sorted them'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="answer" aria-labelledby="answer-title">
            <h2 id="answer-title">The short answer</h2>
            <p>
              Title II’s rule will hold most documents that state and local governments post online to WCAG 2.1 Level
              A and AA, from April 2027 or April 2028: 50 success criteria. In a meeting document most of them depend on what’s in it, such as video or a fillable
              form. The {always.length} that come up every time are about text, headings, lists, tables, links, images
              and colour.
            </p>
            <p>
              W3C puts it plainly: “Tools cannot check all accessibility aspects automatically. Human judgement is
              required.” For these {always.length}, software is most useful as a list of where to look. Ada Editor checks{' '}
              {say(checked)} of them; the table names each check.
            </p>
          </section>

          <section id="every" aria-labelledby="every-title">
            <h2 id="every-title">The criteria in every meeting document</h2>
            <div className="site-table research__table" role="region" aria-labelledby="every-title" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Criterion</th>
                    <th scope="col">Who can decide it</th>
                    <th scope="col">In Ada Editor</th>
                  </tr>
                </thead>
                <tbody>
                  {always.map(([sc, name, level, , decides, why]) => (
                    <tr key={sc}>
                      <th scope="row">{sc} {name} ({level})</th>
                      <td><strong>{DECIDES[decides]}.</strong> {why}</td>
                      <td><InAda sc={sc} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <Link href="/help#checks">Every Ada Editor check</Link> is explained in Help, with how to fix it. What
              its exports keep is in <Link href="/help#export">Help’s section on exporting</Link>.
            </p>
          </section>

          <section id="sometimes" aria-labelledby="sometimes-title">
            <h2 id="sometimes-title">The ones that depend on what’s in it</h2>
            <p>The other {CRITERIA.length - always.length} apply when a document has one of these. Ada Editor checks none of them.</p>
            {(Object.keys(WHEN) as When[]).filter((w) => w !== 'always').map((w) => (
              <section key={w} aria-labelledby={`when-${w}`}>
                <h3 id={`when-${w}`}>{WHEN[w]}</h3>
                {w === 'set' && (
                  <p>
                    W3C’s guidance for documents reads these four as applying to a set of documents, not to one on its
                    own: see <a href="#documents">where documents differ</a>.
                  </p>
                )}
                <ul>
                  {CRITERIA.filter((c) => c[3] === w).map(([sc, name, level, , decides, why]) => (
                    <li key={sc}><strong>{sc} {name} ({level}):</strong> {DECIDES[decides].toLowerCase()}. {why}</li>
                  ))}
                </ul>
              </section>
            ))}
          </section>

          <section id="documents" aria-labelledby="documents-title">
            <h2 id="documents-title">Where documents differ</h2>
            <p>
              WCAG was written for web pages. W3C’s WCAG2ICT note explains how each criterion reads for documents and
              software outside a web page. It is guidance, not a requirement: in its own words it “does not set
              requirements”. For four criteria, Bypass Blocks (2.4.1), Multiple Ways (2.4.5), Consistent Navigation
              (3.2.3) and Consistent Identification (3.2.4), it reads “web pages” as documents in a “set of non-web
              documents”, so they concern a set rather than one document on its own.
            </p>
            <p>
              The laws differ too. Section 508, for federal agencies, uses WCAG 2.0 and says non-web documents “shall
              not be required to conform” to those same four. Title II’s rule, 28 CFR 35.200, names “Level A and Level
              AA success criteria and conformance requirements specified in WCAG 2.1” and lists no criteria as
              excepted. Who it covers, and from when, is in our <Link href="/guides/title-ii-meeting-documents">guide
              to Title II for meeting documents</Link>.
            </p>
          </section>

          <section id="misses" aria-labelledby="misses-title">
            <h2 id="misses-title">What a checker misses</h2>
            <p>
              When we walked a clerk’s path through Ada Editor, with an invented agenda shaped like the ones in our{' '}
              <Link href="/research/agenda-platforms">agenda platform research</Link>, its nine section titles were
              bold capitals, not headings, and Ada Editor flagged none of them. Headings are 1.3.1, and they’re
              how screen reader users skim to their item (<a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/clerk-walkthrough-2026-10.md">our
              record of the walkthrough</a>).
            </p>
            <p>
              We added a check that asks about short lines in bold or heading-sized type:{' '}
              <Link href="/help#rule-heading-unmarked">lines that look like headings but aren’t</Link>. It asks
              rather than fails, because a bold line can also be a name. A line set only in capitals, or only
              underlined, still isn’t counted. A checker that finds nothing has only shown it found nothing.
            </p>
          </section>

          <section id="fixes" aria-labelledby="fixes-title">
            <h2 id="fixes-title">What a checker can fix</h2>
            <p>
              Very little, in our own test. When we first tested our rules, in September 2026, we ran 13 of them over 28 public
              documents from GitHub: READMEs, codes of conduct and guides, not meeting documents. Of 670 findings, 32
              (4.8%) came with a fix software could apply, and 28 of those were the same one, setting the document’s
              language. The other 638 needed what only the author knows: what the image shows, where the link goes, how to
              say it more plainly (<a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/rule-set-spike.md">our
              record of that test</a>).
            </p>
            <p>
              So most findings in Ada Editor lead with Go to text. Apply fix appears only where software can make the
              change, and for some, such as a line that looks like a heading, you still decide whether to use it.
            </p>
          </section>

          {beyond.length > 0 && (
            <section id="beyond" aria-labelledby="beyond-title">
              <h2 id="beyond-title">Beyond AA</h2>
              <p>
                Ada Editor also checks {say(beyondCriteria.length)} criteria that Title II doesn’t require, as advice
                rather than failures: {beyond.map((r, i) => (
                  <span key={r.id}>{i > 0 && (i === beyond.length - 1 ? ' and ' : ', ')}<Link href={`/help#rule-${r.id}`}>{r.name.toLowerCase()}</Link> ({r.criterion}, {r.level})</span>
                ))}.
              </p>
            </section>
          )}

          <section id="method" aria-labelledby="method-title">
            <h2 id="method-title">How we sorted them</h2>
            <p>Each criterion went into one of four groups, by what software can decide without a person:</p>
            <ul>
              <li><strong>Software:</strong> it can pass or fail the criterion on its own.</li>
              <li><strong>Partly software:</strong> it can catch some failures for certain; a person decides the rest.</li>
              <li><strong>A person:</strong> software can at most point to where to look.</li>
              <li><strong>The file format:</strong> a Word file, a tagged PDF or a web page, opened in an ordinary viewer, usually meets it.</li>
            </ul>
            <p>
              The sorting is ours, read against W3C’s Understanding WCAG 2.1 and WCAG2ICT, and each row says why. “Every
              meeting document” is our generalisation from the packets in our research. We used WCAG 2.1 because it’s
              what Title II names; WCAG 2.2 adds criteria not covered here. For tagged PDFs, our{' '}
              <Link href="/guides/ada-compliant-pdf">guide to what “ADA compliant PDF” can mean</Link> gives the PDF
              Association’s own count of which PDF/UA failures software can find.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              Another reviewer could sort some rows differently, especially the partly ones. This page isn’t legal
              advice, and no checker, ours included, can confirm a document meets WCAG.
            </p>
            <p>
              Think a row is wrong?{' '}
              <a href="https://github.com/Ruckus000/Ada-editor/issues/new?title=Research%20correction%3A%20">Report a correction to this page</a>{' '}
              (public, on GitHub).
            </p>
            <p>None yet.</p>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Sources</h2>
            <p>Read on October 12, 2026.</p>
            <ul className="research__sources">
              <li>W3C, <a href="https://www.w3.org/TR/WCAG21/">Web Content Accessibility Guidelines (WCAG) 2.1</a>, and <a href="https://www.w3.org/WAI/WCAG21/Understanding/">Understanding WCAG 2.1</a>.</li>
              <li>W3C, <a href="https://www.w3.org/TR/wcag2ict-22/">Guidance on Applying WCAG 2 to Non-Web Information and Communications Technologies (WCAG2ICT)</a>, Group Note, 11 December 2025.</li>
              <li>W3C WAI, <a href="https://www.w3.org/WAI/test-evaluate/tools/selecting/">Selecting Web Accessibility Evaluation Tools</a>.</li>
              <li>28 CFR 35.200, <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H/section-35.200">requirements for web and mobile accessibility</a>, as amended April 20, 2026.</li>
              <li>U.S. Access Board, <a href="https://www.access-board.gov/ict/">Section 508 standards</a>, E205.4.</li>
              <li>Our records: <a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/clerk-walkthrough-2026-10.md">the clerk walkthrough</a> and <a href="https://github.com/Ruckus000/Ada-editor/blob/main/docs/audit/rule-set-spike.md">the rule-set test</a>.</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
