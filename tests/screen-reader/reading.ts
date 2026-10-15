import { expect, type Page, type TestInfo } from '@playwright/test';
import { parseHTML } from 'linkedom';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ScreenReader, Step } from './assertions';
import { AGENDA_EXPORT, normalize, readingPack, recordingText, type ReadingFixture } from './readingPack';

/**
 * A real screen reader reads one exported page from the top, and what it says
 * must match the committed recording, which the simulator in
 * app/_editor/screenReader.ts is held to (scripts/verify-rules.mjs).
 *
 * No recording yet, or a different one: the test fails and leaves what was
 * said in test-results/, which CI uploads. Read it, and commit it to
 * recordings/<reader>/<fixture>.txt only once it's right. Never automatically.
 */

const RECORDINGS = resolve('tests/screen-reader/recordings');
// Steps before giving up: the pack takes well under 100 lines in NVDA.
const LIMIT = 250;

const page = (fixture: ReadingFixture) => fixture === 'agenda'
  ? readFileSync(resolve(AGENDA_EXPORT), 'utf8')
  : readingPack(parseHTML('<!doctype html><html><head><title></title></head><body></body></html>').document);

/** The page's last words: a reading stops once they're spoken. */
const lastWords = (html: string) => {
  const { document } = parseHTML(html);
  const texts = [...document.body.querySelectorAll('*')].map((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('')).filter((t) => normalize(t));
  return normalize(texts.at(-1) ?? '').split(' ').slice(-4).join(' ');
};

export async function assertReadsAsRecorded(
  pw: Page, sr: ScreenReader, reader: 'nvda' | 'voiceover', fixture: ReadingFixture, step: Step, info: TestInfo,
) {
  const html = page(fixture);
  const end = lastWords(html);
  await pw.setContent(html, { waitUntil: 'load' });
  // VoiceOver lands on the page's first item, but whether its speech for it
  // was logged varied run to run ("main" in 38735916918, not in 38740866535),
  // so its reading starts at the second; the simulator's gate skips the first.
  const navigated = reader === 'voiceover';
  if (navigated) await sr.navigateToWebContent();
  const before = (await sr.spokenPhraseLog()).length;
  if (!navigated) await sr.navigateToWebContent();
  const out = info.outputPath(`${reader}-${fixture}.txt`);
  let heard: string[] = [];
  for (let i = 0; i < LIMIT; i++) {
    heard = (await sr.spokenPhraseLog()).slice(before);
    // Written every step: a reading that times out still leaves what was said.
    writeFileSync(out, `${heard.join('\n')}\n`);
    if (normalize(heard.join(' ')).includes(end)) break;
    await step(sr);
  }

  expect(normalize(heard.join(' ')), `${reader} never reached the end of ${fixture} ("${end}"). What it said is in ${out}.`).toContain(end);

  const file = resolve(RECORDINGS, reader, `${fixture}.txt`);
  expect(existsSync(file), `No recording of ${reader} reading ${fixture} yet. Review ${out} (uploaded with this run) and commit it as ${file}.`).toBe(true);
  expect(normalize(heard.join(' ')), `${reader} no longer reads ${fixture} as recorded. What it said now is in ${out}.`)
    .toBe(normalize(recordingText(readFileSync(file, 'utf8'))));
}
