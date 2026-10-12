import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../../research/research.css';

export const metadata: Metadata = pageMetadata('/guides/title-ii-meeting-documents');

const HEADLINE = 'What the ADA’s Title II rule means for agendas, packets and minutes';

/* Every claim here traces to a source listed at the bottom: the regulation's
 * text (28 CFR 35.104, 35.201, 35.204, and 35.200 as amended April 20, 2026),
 * DOJ's 2024 rule and fact sheet, the Federal Register, or the court docket. Say "DOJ says", "the
 * docket shows" or "our reading" where it isn't the rule's own words. The
 * dates also appear on /about; when the rule or the case changes, change both
 * that week, with a new `updated` date in app/_site/pages.ts and a line under
 * Corrections. */

export default function Page() {
  return (
    <Site current="guides">
      <JsonLd data={articleData('/guides/title-ii-meeting-documents', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Guide</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            A city or town that posts its meeting documents online generally has to make them meet WCAG 2.1 AA: from April 26,
            2027 if it has 50,000 people or more, and from April 26, 2028 if it is smaller. Older documents can be
            excepted. Anything created or changed after that date generally can’t.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Rule</dt><dd>28 CFR part 35, subpart H, as amended April 20, 2026</dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['answer', 'The short answer'], ['dates', 'Who, and by when'], ['documents', 'Agendas, packets and minutes'], ['exceptions', 'The exceptions that matter here'], ['unsettled', 'What’s still unsettled'], ['now', 'What a clerk can do now'], ['corrections', 'Corrections and limits'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="answer" aria-labelledby="answer-title">
            <h2 id="answer-title">The short answer</h2>
            <p>
              Title II of the Americans with Disabilities Act covers state and local governments. Its web rule, issued
              by the Department of Justice (DOJ) in April 2024, says the web content a government “provides or makes
              available, directly or through contractual, licensing, or other arrangements” must meet WCAG 2.1 Level A
              and AA. PDFs, Word files, slides and spreadsheets are web content once they’re posted, so agendas,
              packets and minutes are included.
            </p>
            <p>
              The rule has exceptions for older documents and for archives, and DOJ’s own examples show where they
              stop: minutes written after the compliance date, or slides posted for an upcoming meeting, are not
              excepted. The dates moved once, in April 2026, and a lawsuit asks a court to set that change aside.
            </p>
          </section>

          <section id="dates" aria-labelledby="dates-title">
            <h2 id="dates-title">Who, and by when</h2>
            <ul>
              <li><strong>A government with a total population of 50,000 or more:</strong> from April 26, 2027. Until April 20, 2026, this was April 24, 2026.</li>
              <li><strong>A government with fewer than 50,000 people, and every special district:</strong> from April 26, 2028. This was April 26, 2027.</li>
            </ul>
            <p>
              For a city or town, “total population” is its population in the Census Bureau’s most recent decennial
              Census. A special district is a public entity, other than a county, municipality, township or independent
              school district, that State law authorizes to provide one or a limited number of functions, with enough
              autonomy to be a separate government, and whose population the Census Bureau doesn’t calculate.
            </p>
            <p>
              The rule lets a government show that meeting it would fundamentally alter a service, or impose “undue
              financial and administrative burdens”. The rule puts that on the government to demonstrate, and DOJ
              says what counts differs from one government to the next. Even then the government must comply as far
              as it can without that alteration or burden, and the decision needs a written statement of reasons from
              its head or their designee.
            </p>
          </section>

          <section id="documents" aria-labelledby="documents-title">
            <h2 id="documents-title">Agendas, packets and minutes</h2>
            <p>
              The rule calls PDFs and word processor, presentation and spreadsheet files “conventional electronic
              documents”. Neither the rule nor WCAG mentions tags, but in practice most of what WCAG 2.1 AA asks of a
              PDF depends on them: the headings, reading order, table headers and image descriptions a screen reader
              follows, and the document’s language. A tagged PDF can still fail on other things, such as contrast. Our{' '}
              <Link href="/help#checks">list of the checks Ada Editor runs</Link> names the WCAG success criterion
              behind each one.
            </p>
            <p>DOJ’s fact sheet gives examples that read directly onto meeting documents:</p>
            <ul>
              <li><strong>Minutes.</strong> City council minutes “created after the date the city must comply” are not archived content, “even if they are posted in the ‘archive’ section of the city’s website”.</li>
              <li><strong>Material for an upcoming meeting.</strong> A PowerPoint posted after the compliance date “that will be used in an upcoming town council meeting” is not excepted, and “would probably have to meet WCAG 2.1, Level AA”.</li>
              <li><strong>An old document, left alone.</strong> A Word sample ballot a school district posted in 2014 would probably be excepted as a preexisting document.</li>
              <li><strong>An old document, edited.</strong> A Word document first posted in 2020 and updated after the compliance date with new contact information “would not qualify for the exception anymore”.</li>
            </ul>
            <p>
              The fact sheet doesn’t mention agendas, but the 2024 rule does. Agendas, minutes and other documents for
              meetings held after the compliance date “would likely not” count as archived, and “would generally need
              to conform to WCAG 2.1 Level AA for their initial intended purpose related to the meetings”. Moving them
              into an archive later doesn’t change that.
            </p>
          </section>

          <section id="exceptions" aria-labelledby="exceptions-title">
            <h2 id="exceptions-title">The exceptions that matter here</h2>
            <section aria-labelledby="x-archived">
              <h3 id="x-archived">Archived content</h3>
              <p>Content counts as archived only if all four are true:</p>
              <ol>
                <li>It was created before the compliance date, or reproduces paper documents or other physical media created before it.</li>
                <li>It is kept “exclusively for reference, research, or recordkeeping”.</li>
                <li>It is not altered or updated after it was archived.</li>
                <li>It is stored in an area “clearly identified as being archived”.</li>
              </ol>
            </section>
            <section aria-labelledby="x-preexisting">
              <h3 id="x-preexisting">Preexisting documents</h3>
              <p>
                Documents posted before the compliance date are excepted, “unless such documents are currently used to
                apply for, gain access to, or participate in” the government’s services, programs or activities.
              </p>
            </section>
            <section aria-labelledby="x-third-party">
              <h3 id="x-third-party">Content posted by a third party</h3>
              <p>
                This exception doesn’t cover a third party posting “due to contractual, licensing, or other arrangements”
                with the government. DOJ’s fact sheet says content a company posts for a government it works for is not
                excepted. Our reading: that includes the agenda platform a town pays to publish its meetings, and the
                packets it builds. Our <Link href="/research/agenda-platforms">research on what agenda platforms do to tagged PDFs</Link>{' '}
                shows why that matters. Our reading again: a resident’s letter that the clerk puts in a packet is
                posted by the town, not by a third party, and DOJ says third-party content a government posts itself
                usually needs to meet WCAG 2.1 AA.
              </p>
            </section>
            <p>
              The other two exceptions, for documents about one person, their property or their account that are
              password-protected or otherwise secured, and for social media posts made before the compliance date,
              rarely touch meeting documents.
            </p>
          </section>

          <section id="unsettled" aria-labelledby="unsettled-title">
            <h2 id="unsettled-title">What’s still unsettled</h2>
            <ul>
              <li>
                <strong>The lawsuit (the docket shows).</strong> The National Federation of the Blind sued DOJ and the
                Department of Health and Human Services on May 21, 2026, in federal court in Maryland (No.
                1:26-cv-02007). It asks the court to declare the April 2026 extensions unlawful and set them aside,
                which would leave the 2024 dates in place. The Federation moved for summary judgment on September 28,
                2026. As of this page’s review date, there
                is no ruling. We can’t predict what a court would order for a date that has already passed.
              </li>
              <li>
                <strong>More rulemaking (DOJ says).</strong> In the April 2026 rule, DOJ said it plans future rulemaking
                “related to the substantive requirements of the 2024 final rule”. It hasn’t proposed any yet.
              </li>
              <li>
                <strong>Whether the exceptions’ cutoff moved (our reading).</strong> The archive and preexisting-document
                exceptions are tied to “the date the public entity is required to comply”, and that date is now 2027 or
                2028. Read plainly, the cutoff moved with it. DOJ hasn’t said so in words.
              </li>
              <li>
                <strong>Old documents still in use (open).</strong> A document posted before the compliance date that
                people still use to take part in a meeting is not excepted, and DOJ says instructions for using such
                documents aren’t either. Public comment instructions likely fall there, but DOJ calls “currently used”
                “a fact-specific analysis”.
              </li>
            </ul>
          </section>

          <section id="now" aria-labelledby="now-title">
            <h2 id="now-title">What a clerk can do now</h2>
            <ul>
              <li><strong>Make new documents accessible as they are written,</strong> since new documents are covered. Our <Link href="/guides/accessible-agenda-minutes-templates">free agenda and minutes templates</Link> start you off with the structure in place.</li>
              <li><strong>Find out what your agenda system does to a tagged file.</strong> Some keep the tags, some strip them in the packet. Then follow our steps for <Link href="/help#posting">posting a PDF to an agenda system</Link>.</li>
              <li><strong>Set up the archive the way the rule describes:</strong> a clearly labelled area, kept for reference only, with documents left unedited once they’re in it.</li>
              <li><strong>Say how to ask for an accessible copy</strong> of anything excepted. DOJ says that even then, a government “would likely still need to provide the content to a person with a disability” who needs it in an accessible format.</li>
            </ul>
            <p>
              Ada Editor, which publishes this guide, checks a document while it is written and exports tagged PDF. It
              won’t tell you a document is compliant: no tool can.
            </p>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections and limits</h2>
            <p>
              This guide explains the rule. It isn’t legal advice: ask your government’s attorney about your documents.
              When the rule or the lawsuit changes, we update this page that week and list the change here with its
              date.
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
              <li>28 CFR 35.104, definitions: <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-A/section-35.104">archived web content, conventional electronic documents, special district government, total population</a>.</li>
              <li>28 CFR 35.200, <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H/section-35.200">requirements for web and mobile accessibility</a>, as amended April 20, 2026.</li>
              <li>28 CFR 35.201, <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H/section-35.201">exceptions</a>.</li>
              <li>DOJ, <a href="https://www.federalregister.gov/documents/2026/04/20/2026-07663/extension-of-compliance-dates-for-nondiscrimination-on-the-basis-of-disability-accessibility-of-web">Extension of compliance dates</a>, interim final rule, 91 FR 20902 (April 20, 2026).</li>
              <li>DOJ, <a href="https://www.federalregister.gov/documents/2024/04/24/2024-07758/nondiscrimination-on-the-basis-of-disability-accessibility-of-web-information-and-services-of-state">Accessibility of web information and services of state and local government entities</a>, final rule, 89 FR 31320 (April 24, 2024).</li>
              <li>The same rule on agendas and minutes for later meetings: 89 FR 31339–40 and 31361–62; on preexisting documents still in use: 89 FR 31365. The decision on undue burdens: <a href="https://www.ecfr.gov/current/title-28/chapter-I/part-35/subpart-H/section-35.204">28 CFR 35.204</a>.</li>
              <li>DOJ, <a href="https://www.ada.gov/resources/2024-03-08-web-rule/">Fact sheet: new rule on the accessibility of web content and mobile apps</a>, ada.gov.</li>
              <li><em>National Federation of the Blind v. Department of Justice</em>, No. 1:26-cv-02007 (D. Md.), <a href="https://www.courtlistener.com/docket/73378158/national-federation-of-the-blind-v-department-of-justice/">docket on CourtListener</a>, and the <a href="https://www.pacermonitor.com/public/case/64778075/National_Federation_of_the_Blind_v_Department_of_Justice_et_al">docket on PacerMonitor</a>, which shows the summary judgment motion; <a href="https://browngold.com/wp-content/uploads/2026/05/NFB-v.-DOJ_5-21-2026.pdf">the complaint</a> (May 21, 2026).</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
