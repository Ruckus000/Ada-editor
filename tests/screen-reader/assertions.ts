import { expect, type Page } from '@playwright/test';

/**
 * The slice of Guidepup's screen reader API these assertions need. Declaring it
 * structurally lets NVDA and VoiceOver share one set of expectations without
 * casting either through `any`.
 */
export interface ScreenReader {
  /** Move the reading cursor to the next item. Equivalent to Down Arrow. */
  next(): Promise<void>;
  /** Move the reading cursor to the next heading. */
  nextHeading(): Promise<void>;
  /** Perform the default action on the item in the cursor. Equivalent to Enter. */
  act(): Promise<void>;
  /** Press a key on the FOCUSED item, e.g. "Tab" or "Control+Home". */
  press(key: string): Promise<void>;
  lastSpokenPhrase(): Promise<string>;
  spokenPhraseLog(): Promise<string[]>;
}

export const PREVIEW_PATH = '/preview.html';

const FINDING_TITLES = [
  'image has no alternative text',
  'link text is not meaningful out of context',
  'reading level is above the target',
  'alt text may not describe the image',
];

const SEVERITY_LABELS = ['blocks access', 'fails aa', 'advisory', 'needs your call'];

/**
 * Every failure carries the full transcript.
 *
 * These tests can only be run in CI, where a round trip is several minutes, so a
 * failure that does not explain itself costs an entire iteration. The first run
 * failed with nothing but a timeout and told us almost nothing.
 */
const withTranscript = async (sr: ScreenReader, message: string) => {
  const log = await sr.spokenPhraseLog();
  const tail = log.slice(-40).map((p, i) => `  ${i}: ${p}`).join('\n');
  return `${message}\n\n--- what the screen reader said (last ${Math.min(log.length, 40)} of ${log.length}) ---\n${tail}`;
};

const open = async (page: Page, sr: ScreenReader) => {
  await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
  // Hydration must finish first, or the screen reader reads server-rendered
  // markup with no live region wired up.
  await page.waitForFunction(() => document.querySelectorAll('.ada-card').length === 4);

  // Make the browser the frontmost application and put focus inside the
  // document. Without this the screen reader cursor stays wherever the OS left
  // it: the first run of these tests spent every Tab press announcing
  // "Finder desktop guidepup-voiceover-preferences Volume" — it was reading the
  // desktop, not the page, and every assertion below was measuring nothing.
  await page.bringToFront();
  await page.locator('h1').first().click();
  await page.evaluate(() => document.querySelector('main')?.focus());
  await sr.press('Control+Home');

  // Fail here, loudly, rather than let a downstream assertion report something
  // misleading. If the screen reader is not reading this page, nothing after
  // this point means anything.
  const heard = (await sr.spokenPhraseLog()).join(' | ').toLowerCase();
  expect(
    heard,
    await withTranscript(
      sr,
      'The screen reader never reached the page. It is reading another application, ' +
        'so no assertion below would be measuring the components.'
    )
  ).toMatch(/design system preview|accessibility findings|quarterly report/);
};

/**
 * Step a key until the screen reader says something matching, collecting what it
 * said on the way. Returns the matching phrase, or null.
 *
 * `press('Tab')` rather than `next()` when the target is a control: `next()` is
 * Down Arrow, which moves the READING cursor in browse mode and never focuses a
 * button. The first version of these tests stepped with `next()` and then called
 * `act()` (Enter), which had nothing focused to act on — the same mistake the
 * Orca gate had to be corrected for.
 */
const seek = async (
  sr: ScreenReader,
  key: string,
  matches: (phrase: string) => boolean,
  limit: number
): Promise<string | null> => {
  for (let i = 0; i < limit; i++) {
    await sr.press(key);
    const phrase = (await sr.lastSpokenPhrase()) ?? '';
    if (matches(phrase.toLowerCase())) return phrase;
  }
  return null;
};

const transcriptText = async (sr: ScreenReader) =>
  (await sr.spokenPhraseLog()).join(' | ').toLowerCase();

/**
 * Severity must be conveyed as words. This is the design's central claim: colour
 * cannot carry it — all four severities collapse under forced colours, and two
 * pairs collapse under dichromacy — so if the label is not spoken there is no
 * channel left.
 */
export async function assertSeverityIsSpoken(page: Page, sr: ScreenReader) {
  await open(page, sr);
  for (let i = 0; i < 25; i++) await sr.next();

  const said = await transcriptText(sr);
  const announced = SEVERITY_LABELS.filter((label) => said.includes(label));
  expect(
    announced.length,
    await withTranscript(sr, 'No severity label was announced while reading the findings.')
  ).toBeGreaterThan(0);
}

/** The issue list is the canonical interface, and headings are how AT reaches it. */
export async function assertFindingsReachableByHeading(page: Page, sr: ScreenReader) {
  await open(page, sr);
  for (let i = 0; i < 12; i++) await sr.nextHeading();

  const said = await transcriptText(sr);
  const missing = FINDING_TITLES.filter((title) => !said.includes(title));
  expect(
    missing,
    await withTranscript(sr, `Findings unreachable by heading navigation: ${missing.join(', ')}`)
  ).toEqual([]);
}

/**
 * Guards the defect that motivated the whole harness: four buttons named only
 * "Dismiss" are each individually valid and collectively useless.
 */
export async function assertButtonsAreDistinct(page: Page, sr: ScreenReader) {
  await open(page, sr);
  // Tab moves focus between controls; each stop announces the control's name.
  for (let i = 0; i < 14; i++) await sr.press('Tab');

  const said = await transcriptText(sr);
  expect(
    said,
    await withTranscript(sr, 'Expected a Dismiss button to name its finding rather than say only "Dismiss".')
  ).toContain('dismiss image has no alternative text');
  expect(
    said,
    await withTranscript(sr, 'Expected an Apply fix button to name its finding.')
  ).toContain('apply fix for link text is not meaningful out of context');
}

/**
 * Applying a fix removes the focused card. Focus must land on whatever replaces
 * it — Orca announced the document instead, and the user lost their place in the
 * list while the live region said the right thing to nobody.
 */
export async function assertFocusSurvivesApplyingAFix(page: Page, sr: ScreenReader) {
  await open(page, sr);

  // Seek a button that actually REMOVES a finding. Since the rule-set spike the
  // first button in a card is "Go to text", which deliberately leaves the card
  // in place, so stopping at the first button would test nothing.
  const button = await seek(
    sr,
    'Tab',
    (phrase) => phrase.includes('apply fix') || phrase.includes('dismiss'),
    16
  );
  expect(
    button,
    await withTranscript(sr, 'Never reached an Apply fix or Dismiss button while tabbing.')
  ).not.toBeNull();

  const before = await page.evaluate(() => document.querySelectorAll('.ada-card').length);
  await sr.act();

  await expect
    .poll(
      async () => page.evaluate(() => document.querySelectorAll('.ada-card').length),
      { message: `Activating ${JSON.stringify(button)} did not remove the finding.`, timeout: 15_000 }
    )
    .toBe(before - 1);

  const landedInsideFindings = await page.evaluate(
    () => !!document.activeElement?.closest('.ada-card, .ada-issues')
  );
  expect(
    landedInsideFindings,
    await withTranscript(sr, 'Focus left the findings region after applying a fix.')
  ).toBe(true);
}
