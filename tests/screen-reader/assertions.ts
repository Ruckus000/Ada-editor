import { expect, type Page } from '@playwright/test';

/**
 * The slice of Guidepup's screen reader API these assertions need. Declaring it
 * structurally lets NVDA and VoiceOver share one set of expectations without
 * casting either through `any`.
 */
export interface ScreenReader {
  next(): Promise<void>;
  nextHeading(): Promise<void>;
  act(): Promise<void>;
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

const transcript = async (sr: ScreenReader) =>
  (await sr.spokenPhraseLog()).join(' | ').toLowerCase();

const open = async (page: Page) => {
  await page.goto(PREVIEW_PATH, { waitUntil: 'networkidle' });
  // Hydration must finish before the screen reader reads anything, or it sees
  // the server-rendered markup without the live region wired up.
  await page.waitForFunction(() => document.querySelectorAll('.ada-card').length === 4);
};

/**
 * Severity must be conveyed as words. This is the design's central claim: colour
 * cannot carry it (all four severities collapse under forced colours and under
 * dichromacy), so if the label is not spoken there is no channel left at all.
 */
export async function assertSeverityIsSpoken(page: Page, sr: ScreenReader) {
  await open(page);
  for (let i = 0; i < 16; i++) await sr.next();

  const said = await transcript(sr);
  const announced = SEVERITY_LABELS.filter((label) => said.includes(label));
  expect(
    announced.length,
    `No severity label was announced. Colour is unavailable to this user, so the ` +
      `label is the only channel. Heard: ${said.slice(0, 600)}`
  ).toBeGreaterThan(0);
}

/** The issue list is the canonical interface, and headings are how AT reaches it. */
export async function assertFindingsReachableByHeading(page: Page, sr: ScreenReader) {
  await open(page);
  for (let i = 0; i < 10; i++) await sr.nextHeading();

  const said = await transcript(sr);
  const missing = FINDING_TITLES.filter((title) => !said.includes(title));
  expect(
    missing,
    `Findings unreachable by heading navigation: ${missing.join(', ')}. ` +
      `Heard: ${said.slice(0, 600)}`
  ).toEqual([]);
}

/**
 * Guards the defect that motivated the whole harness: four buttons named only
 * "Dismiss" are each individually valid and collectively useless.
 */
export async function assertButtonsAreDistinct(page: Page, sr: ScreenReader) {
  await open(page);
  for (let i = 0; i < 20; i++) await sr.next();

  const said = await transcript(sr);
  expect(said).toContain('dismiss image has no alternative text');
  expect(said).toContain('apply fix for link text is not meaningful out of context');
}

/**
 * Applying a fix removes the focused card. Focus must land on whatever replaces
 * it — Orca previously announced the document instead, and the user lost their
 * place in the list while the live region said the right thing to nobody.
 */
export async function assertFocusSurvivesApplyingAFix(page: Page, sr: ScreenReader) {
  await open(page);

  let reached = false;
  for (let i = 0; i < 24; i++) {
    await sr.next();
    if ((await sr.lastSpokenPhrase()).toLowerCase().includes('apply fix')) {
      reached = true;
      break;
    }
  }
  expect(reached, 'never reached an "Apply fix" button while reading the list').toBe(true);

  await sr.act();
  await page.waitForFunction(() => document.querySelectorAll('.ada-card').length === 3);

  const focusedInsideAFinding = await page.evaluate(
    () => !!document.activeElement?.closest('.ada-card, .ada-issues')
  );
  expect(
    focusedInsideAFinding,
    `Focus left the findings region after applying a fix. Heard: ${(await transcript(sr)).slice(-500)}`
  ).toBe(true);
}
