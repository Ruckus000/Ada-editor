/**
 * VoiceOver reading exported documents, top to bottom, for the "Hear it as a
 * screen reader" simulation. macOS only, so CI only (screen-reader.yml).
 */
import { voiceOverTest } from '@guidepup/playwright';
import { READING_FIXTURES } from './readingPack';
import { assertReadsAsRecorded } from './reading';

// As for NVDA: the default, "initial", keeps only the first speech after each
// move, and a move that VoiceOver answers in two parts would lose the second.
voiceOverTest.use({ voiceOverStartOptions: { capture: true } });

voiceOverTest.describe('VoiceOver reading an export', () => {
  // A VO cursor move at a time, each waited out: minutes, not the suite's 5.
  voiceOverTest.describe.configure({ timeout: 10 * 60 * 1000 });
  for (const fixture of READING_FIXTURES) {
    // The VO cursor (VO-Right), as voiceover.spec.ts moves: keystrokes never
    // moved focus under VoiceOver in CI.
    voiceOverTest(`reads ${fixture} as recorded`, async ({ page, voiceOver }, info) => {
      await assertReadsAsRecorded(page, voiceOver, 'voiceover', fixture, (sr) => sr.next(), info);
    });
  }
});
