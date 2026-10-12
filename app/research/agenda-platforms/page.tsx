import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, articleData } from '../../_site/JsonLd';
import { pageMetadata } from '../../_site/pages';
import { Site, Toc } from '../../_site/Site';
import '../research.css';

export const metadata: Metadata = pageMetadata('/research/agenda-platforms');

const HEADLINE = 'Do agenda systems keep accessible PDFs accessible?';

/* Every claim here traces to docs/audit/agenda-platforms-2026-10.md and its
 * evidence folder (report.md, notes/). Rules, from that record's decision 6
 * and the owner's ruling of 2026-10-12: name platforms, never towns, and link
 * no town's files. Say "we saw" only for what was inspected, and mark what a
 * vendor says or what we infer. A change to what this page says is a new
 * `updated` date in app/_site/pages.ts and a line under Corrections. */

const PLATFORMS: [platform: string, attachment: string, packet: string, word: string, evidence: string][] = [
  ['Legistar (Granicus)', 'Mostly kept, though re-saved and retitled with the file number. In 2 of 16 cities, 7 files reached the public with their tags removed, by Legistar or by whoever made them: we can’t tell which.', 'No platform-built packet seen', 'A tagged PDF (one file, one city)', 'Moderate: the public copies in 16 cities'],
  ['PrimeGov / OneMeeting (Granicus)', 'Structure came through in a Florida town; removed in a Colorado city', 'Removed in both', 'Converted untagged', 'Strong for packets; attachments vary by town'],
  ['CivicClerk', 'Kept: served as uploaded', 'Structure kept in 20 of 22, but the document’s language dropped in 22 of 22, and page stamps left unmarked', 'Thinly tagged: paragraphs and lists only', 'Strong: 25 towns'],
  ['Municode Meetings', 'None: only “Agenda” and “Agenda Packet” are posted', 'Removed in 2 of 2 towns', 'Not tested', 'Strong for packets'],
  ['Diligent Community / iCompass', 'None: each item link is a PDF Diligent builds', 'Re-tagged as plain paragraphs, yet labelled PDF/UA-1', 'Diligent says not to rely on it', 'One town'],
  ['CivicPlus Agenda Center', 'Kept: uploaded agendas served as uploaded', 'Untagged when the platform builds it; a clerk can upload their own', 'Not tested', 'Moderate'],
  ['OnBase Agenda Online (Hyland)', 'Kept: tags intact, original maker kept', 'None published', 'Converted untagged', 'One meeting'],
];

export default function Page() {
  return (
    <Site current="research">
      <JsonLd data={articleData('/research/agenda-platforms', HEADLINE)} />
      <section className="site-page-hero" aria-labelledby="page-title">
        <div className="site-wrap">
          <p className="site-eyebrow">Research</p>
          <h1 id="page-title">{HEADLINE}</h1>
          <p className="site-lede">
            Mostly on a document’s own attachment link, rarely inside the agenda packet, and seldom when the clerk
            uploads the Word file instead. We inspected what seven agenda platforms publish in Florida towns,
            and checked a few elsewhere.
          </p>
          <dl className="site-facts">
            <div><dt>By</dt><dd><Link href="/about">YourLaunchPad LLC</Link></dd></div>
            <div><dt>Published</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Last reviewed</dt><dd><time dateTime="2026-10-12">12 October 2026</time></dd></div>
            <div><dt>Scope</dt><dd>7 platforms: 41 Florida towns on two of them, about 15 places on all seven</dd></div>
          </dl>
        </div>
      </section>

      <div className="site-wrap site-statement research">
        <Toc items={[['answer', 'The short answer'], ['platforms', 'Platform by platform'], ['detail', 'What we saw'], ['vendors', 'What vendors say'], ['clerks', 'What clerks can do'], ['method', 'How we tested'], ['limits', 'What this can’t tell you'], ['corrections', 'Corrections'], ['sources', 'Sources']]} />
        <div className="site-col">
          <section id="answer" aria-labelledby="answer-title">
            <h2 id="answer-title">The short answer</h2>
            <p>
              A tagged PDF carries the structure a screen reader follows: its headings, reading order, tables and
              the text describing each image. Without tags, and the document’s language, a PDF can’t be accessible.
              A clerk posts one through an agenda system in one of three ways, and each has a different outcome.
            </p>
            <ul>
              <li><strong>As the item’s own attachment link: mostly kept.</strong> Five of the seven platforms passed a tagged PDF through in at least one town, though PrimeGov / OneMeeting stripped every one we sampled in a second town. Municode Meetings has no attachment link, and Diligent’s item links serve a PDF Diligent builds, not the upload.</li>
              <li><strong>Inside the compiled agenda packet: lost or flattened on most platforms.</strong> On CivicClerk the structure survives, but the packet drops the document’s language. No vendor claims its packets keep tags.</li>
              <li><strong>Uploaded as a Word file for the platform to convert: untagged or thinly tagged</strong> everywhere we tested except Legistar.</li>
            </ul>
            <p>
              The merge is where accessibility is lost, not the file. Two vendors using the same PDF library
              (Aspose.PDF, in different versions) got opposite results, which suggests these are settings each vendor
              chose, and can change.
            </p>
          </section>

          <section id="platforms" aria-labelledby="platforms-title">
            <h2 id="platforms-title">Platform by platform</h2>
            <p>What happened to a tagged PDF on each path. “Removed” means the tags were stripped; “kept” means the structure arrived intact.</p>
            <div className="site-table research__table" role="region" aria-labelledby="platforms-title" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Platform</th>
                    <th scope="col">Its own attachment link</th>
                    <th scope="col">Inside the packet</th>
                    <th scope="col">A Word file uploaded instead</th>
                    <th scope="col">How sure we are</th>
                  </tr>
                </thead>
                <tbody>
                  {PLATFORMS.map(([platform, ...cells]) => (
                    <tr key={platform}><th scope="row">{platform}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              <strong>Not tested:</strong> eSCRIBE and BoardDocs, which blocked our downloads; AgendaQuick and
              Laserfiche; and Granicus’s NovusAGENDA, retired September 30, 2025, and iQM2, retiring September 30,
              2027. Granicus Peak has no Florida town we could find; in one California city two tagged attachments
              came through with their tags and original makers, too little to rate.
            </p>
          </section>

          <section id="detail" aria-labelledby="detail-title">
            <h2 id="detail-title">What we saw on each platform</h2>
            <p>The counts behind the table. Towns aren’t named: the findings are about the software, not the people who use it.</p>

            <section aria-labelledby="d-legistar">
              <h3 id="d-legistar">Legistar</h3>
              <p>
                In a large Florida city, the copy residents download is re-saved by a PDF tool (PDFlib PLOP) and isn’t
                identical to the file stored, and its title is replaced with “file number – attachment name”. Even so,
                all 515 structure elements, its 5 image descriptions and its bookmarks were kept. A Word file was
                served as a tagged PDF.
              </p>
              <p>
                On October 12 we sampled one meeting in each of 16 Legistar cities: 158 attachments, 88 of them tagged.
                Seven files in 2 cities carried leftovers of tags without the tags themselves. The stored originals sit
                behind a robots.txt that disallows crawlers, for most cities, so we can’t tell whether Legistar or the
                author removed them. None of the originals we compared by hand in one city carried a PDF/UA identifier,
                so whether Legistar’s re-save keeps one is unknown.
              </p>
            </section>

            <section aria-labelledby="d-primegov">
              <h3 id="d-primegov">PrimeGov / OneMeeting</h3>
              <p>
                In a Florida town, an attachment came back with its 750-element structure, though the file wasn’t
                marked as tagged and we had no original to compare. In a Colorado city, every uploaded PDF we sampled
                had been rewritten by Aspose.PDF and had no structure left, while dozens to hundreds of leftover marks
                per file (306, 646 and 96) showed each had been tagged.
              </p>
              <p>
                Both towns’ packets dropped the attachments’ tags. The Florida packet has no structure at all, and 24
                of its 68 pages still point into one. The Colorado city’s 199-page packet says it is tagged, but its
                structure covers only the three agenda pages. Another 45 pages carry leftover pointers: some land on
                the agenda’s own entries, so a screen reader that trusts them could read agenda text on an ordinance
                page, and the rest point at nothing. Word uploads were converted untagged in both. An undated 2026
                Granicus release note, seen only as a search snippet, says an issue where attachments “could lose their
                accessibility features during publishing” was resolved. The Colorado city’s files published on
                September 24, 2026 were still stripped; the fix may have reached that city later, or cover a different
                case.
              </p>
            </section>

            <section aria-labelledby="d-civicclerk">
              <h3 id="d-civicclerk">CivicClerk</h3>
              <p>
                CivicClerk serves an uploaded PDF as it was uploaded. On October 12 we sampled one meeting in each of
                25 towns: 367 attachments, 276 of them tagged, and 22 packets with a tagged attachment to compare
                against. In 20 of the 22, the packet held every kind of structure its tagged attachments carried; the
                other two were short only of some figures.
              </p>
              <p>
                But all 22 dropped the document’s language, which a screen reader needs to pronounce the text, and 2
                were tagged but not marked as tagged. Earlier, by hand, we found the “Page X of N” stamps drawn outside
                any structure, neither tagged nor marked as decoration, and in one of two packets checked closely, two
                pages pointing to the wrong part of the structure. Content that is neither tagged nor marked as
                decoration fails PDF/UA, and so, usually, does a missing document language, so every packet we checked
                by hand would fail it whatever the clerk uploaded. We judged that from their structure, not with a
                validator. A Word file CivicClerk converted held 139 paragraphs and nothing else, yet declared PDF/UA-1;
                another reached paragraphs and lists.
              </p>
            </section>

            <section aria-labelledby="d-municode">
              <h3 id="d-municode">Municode Meetings</h3>
              <p>
                Each meeting posts two files: “Agenda” and “Agenda Packet”. In one Florida town the agenda, posted on its
                own, was a tagged Word PDF with 58 structure elements. Inside the packet it is page 1, and the packet has
                no structure: 26 of its 38 pages still point into one, and 691 marked passages point at nothing. A
                second town’s packet was the same on all six pages. A staff report or ordinance reaches the public only
                inside that packet.
              </p>
            </section>

            <section aria-labelledby="d-diligent">
              <h3 id="d-diligent">Diligent Community / iCompass</h3>
              <p>
                In one Florida city (one meeting), each item link returned a PDF Diligent builds: a cover report followed
                by the attachments. The 199-page meeting package has 19,276 structure elements: 19,230 paragraphs, 45
                links and one document. No headings, tables, lists, figures or image descriptions, its “ITEM” and page
                stamps tagged as content, and a PDF/UA-1 label in its metadata. No richly tagged file could be picked
                out inside it, so that a tagged PDF’s headings would be flattened is our inference. Diligent’s 2023 fact
                sheet says attachments stay “as accessible as they were when uploaded”; this town exposed no raw uploads.
              </p>
            </section>

            <section aria-labelledby="d-agendacenter">
              <h3 id="d-agendacenter">CivicPlus Agenda Center</h3>
              <p>
                Uploads were served with their original makers in a Florida town and a Connecticut town, where an agenda
                made in Canva kept its tags and language. Packets the platform built in Michigan and Connecticut were
                untagged, though neither held attachments. The Florida town builds its own packet in Acrobat: 1,223
                structure elements, but not marked as tagged, which most likely comes from the clerk’s workflow, not
                the platform.
              </p>
            </section>

            <section aria-labelledby="d-onbase">
              <h3 id="d-onbase">OnBase Agenda Online</h3>
              <p>
                In a large Florida city, a tagged memo (44 elements) came through with its tags and its original maker,
                and a Word file was converted to an untagged PDF. No packets were published for any meeting from August to October 2026.
              </p>
            </section>
          </section>

          <section id="vendors" aria-labelledby="vendors-title">
            <h2 id="vendors-title">What the vendors say</h2>
            <ul>
              <li><strong>No vendor claims its packets keep tags.</strong> Granicus “cannot guarantee” that attachments will be ADA compliant, and Diligent makes uploaded content “the responsibility of the customer”. A Laserfiche reseller says agencies “remain responsible” for the documents they display.</li>
              <li><strong>Their answer is an HTML copy beside the PDF.</strong> CivicPlus sells DocAccess, which builds HTML views of packets while “original PDFs remain unchanged as the official record”; Diligent announced an integration with it on September 22, 2026. Granicus lists a tool to evaluate and remediate PDFs as a preview.</li>
              <li><strong>A PDF/UA label proves little.</strong> A Diligent package and a CivicClerk Word conversion we inspected both claim PDF/UA-1 with no headings or tables inside.</li>
            </ul>
          </section>

          <section id="clerks" aria-labelledby="clerks-title">
            <h2 id="clerks-title">What clerks can do</h2>
            <ul>
              <li><strong>Upload the PDF, not the Word file.</strong> The platform’s converter, not you, decides the tags otherwise, and on most platforms it decided badly.</li>
              <li><strong>Link residents to each document’s own attachment,</strong> and say in the agenda that accessible versions are there.</li>
              <li><strong>Where only a packet is posted,</strong> as on Municode Meetings, or the attachment link can’t be trusted, as on some OneMeeting and Diligent sites, post the PDF on your website too and link to it from the agenda.</li>
            </ul>
            <p>
              To see whether a posted copy kept its structure, compare it with the original: our checker is open
              source (<code>npm run check-posted</code> in{' '}
              <a href="https://github.com/Ruckus000/Ada-editor">Ada Editor’s public code</a>), or, signed in to Ada
              Editor, <Link href="/privacy#contact">send us both links</Link>.
            </p>
          </section>

          <section id="method" aria-labelledby="method-title">
            <h2 id="method-title">How we tested</h2>
            <p>
              We read each file’s internals: its structure tree, whether it is marked as tagged, its language, how its
              pages point into the structure, counts of each kind of element, and the program that made it. Our
              findings don’t rest on veraPDF or PAC; we ran veraPDF only on two pairs of files, while testing our
              checker.
            </p>
            <p>
              The strongest test pairs the same document taken from its own link and from inside the packet. Pages
              that still point into a structure that no longer exists show the tags were removed in the merge, which
              rules out a clerk having uploaded an untagged file.
            </p>
            <ul>
              <li><strong>One file at a time, October 8, 2026:</strong> 23 public files from 10 Florida towns and cities on 7 platforms, from meetings between July and October 2026, chosen and inspected one by one, plus spot checks in Colorado, California, Iowa, Connecticut and Michigan, and the vendors’ documentation.</li>
              <li><strong>By our sampler, October 12, 2026:</strong> one recent meeting in each of 41 Florida towns on CivicClerk and Legistar, the two of the five platforms we checked that allow automated research (on Legistar, only the copies the public link serves). The sampler checks robots.txt first, waits at least two seconds between requests to a site, and stops visiting a site at its first block. It identifies itself as “Ada Editor platform research” with a link to this section.</li>
            </ul>
            <p>
              PrimeGov, Diligent and Municode Meetings turn automated research away, so the sampler doesn’t visit them.
              Our October 8 downloads didn’t check robots.txt first: on those three, and on the host where Legistar
              stores original files, it would have said no. Those findings stand as observations of public files, but
              we won’t repeat that method. Files were inspected and discarded, not kept.
            </p>
          </section>

          <section id="limits" aria-labelledby="limits-title">
            <h2 id="limits-title">What this can’t tell you</h2>
            <ul>
              <li><strong>Small samples.</strong> Outside CivicClerk and Legistar, each platform rests on one to three towns, and a town’s own settings may change the result: PrimeGov / OneMeeting gave opposite results in two.</li>
              <li><strong>Not a validation.</strong> Findings are about structure, read from the files, not a PDF/UA or WCAG conformance test.</li>
              <li><strong>Not our own files.</strong> The files were tagged Word and Acrobat PDFs that towns had posted. We haven’t posted an Ada Editor export to any platform.</li>
              <li><strong>A snapshot.</strong> Vendors change their software. The dates above are when we looked.</li>
            </ul>
          </section>

          <section id="corrections" aria-labelledby="corrections-title">
            <h2 id="corrections-title">Corrections</h2>
            <p>
              If you build one of these platforms, or post through one, and your files show something different, tell
              us: <a href="https://github.com/Ruckus000/Ada-editor/issues/new?template=research-correction.yml">report a correction</a>.
              We’ll check it, update the table, and list the change here with its date.
            </p>
            <p>None yet.</p>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <h2 id="sources-title">Sources</h2>
            <p>Vendors’ own words, as published. Some Granicus help articles need a customer login and were read only as search snippets.</p>
            <ul className="research__sources">
              <li>Diligent, <a href="https://connect.diligent.com/file-asset/Diligent_Community_ADA_Accessibility_Fa?v=1">Diligent Community ADA accessibility fact sheet</a> (2023).</li>
              <li>Granicus, <a href="https://support.granicus.com/s/article/Identify-and-Fix-Accessibility-Issues-with-Adobe-Acrobat-Pro?language=en_US">Identify and fix accessibility issues with Adobe Acrobat Pro</a> (customer login).</li>
              <li>Granicus, <a href="https://support.granicus.com/s/article/Whats-New-in-OneMeeting?language=en_US">What’s new in Agenda OE (OneMeeting) 2026</a> (customer login).</li>
              <li>Granicus, <a href="https://support.granicus.com/s/article/Peak-Agenda-Accessibility?language=en_US">Peak agenda accessibility</a> (customer login).</li>
              <li>Granicus, <a href="https://granicus.com/innovation/">Mid-year innovation update</a> (2026).</li>
              <li>Granicus, <a href="https://granicus.com/wp-content/uploads/application/pdf/FAQ_EOL_IQM2_NOVUS.pdf">End-of-life FAQ for iQM2 and NovusAGENDA</a>.</li>
              <li>CivicPlus, <a href="https://www.civicplus.com/blog/am/meet-accessibility-and-language-access-mandates-without-changing-official-records/">Meet accessibility and language access mandates without changing official records</a>.</li>
              <li>Diligent and CivicPlus, <a href="https://www.financialcontent.com/article/bizwire-2026-9-22-diligent-announces-integration-with-civicplus-docaccess-helping-public-sector-organizations-expand-access-to-supporting-documents-at-scale">Diligent announces integration with CivicPlus DocAccess</a> (September 22, 2026).</li>
              <li>Hyland, <a href="https://docs.hyland.com/r/OnBase/Agenda/English/Foundation-22.1/Agenda/Configuration/Configuring-Packets">OnBase Agenda: configuring packets</a>.</li>
              <li>Municode, <a href="https://www.municode.com/node/2081">Municode Meetings</a>.</li>
              <li>CPS, <a href="https://www.cps247.com/post/wcag-compliance-and-laserfiche-what-agencies-need-to-know-about-accessibility">WCAG compliance and Laserfiche</a>.</li>
            </ul>
          </section>
        </div>
      </div>
    </Site>
  );
}
