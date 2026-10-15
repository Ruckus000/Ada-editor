/**
 * VoiceOver reading exported documents, top to bottom, for the "Hear it as a
 * screen reader" simulation. macOS only, so CI only (screen-reader.yml).
 */
import { voiceOverTest } from '@guidepup/playwright';
import { READING_FIXTURES } from './readingPack';
import { assertReadsAsRecorded } from './reading';

// As for NVDA: the default, "initial", keeps only the first speech after each
// move, and a move that VoiceOver answers in two parts would lose the second.
//
// Instructions off ("You are currently on a heading level 2", "To click this
// link, press…"). VoiceOver says them after a pause, so whether a step caught
// one was timing: two readings of the same page differed (run 38735916918),
// and a hint arriving mid-capture once replaced the paragraph it followed.
// They say how to use VoiceOver, not what the page holds. The name is
// VoiceOver's own (getSettings() on the runner, run 38740866535).
voiceOverTest.use({ voiceOverStartOptions: { capture: true, settings: { SCRShouldOutputVOInstructions: false } } });

voiceOverTest.describe('VoiceOver reading an export', () => {
  // A VO cursor move at a time, each waited out (about 7s): the pack took
  // 8.4 minutes in run 38749420697.
  voiceOverTest.describe.configure({ timeout: 15 * 60 * 1000 });
  for (const fixture of READING_FIXTURES) {
    // The VO cursor (VO-Right), as voiceover.spec.ts moves: keystrokes never
    // moved focus under VoiceOver in CI.
    voiceOverTest(`reads ${fixture} as recorded`, async ({ page, voiceOver }, info) => {
      await assertReadsAsRecorded(page, voiceOver, 'voiceover', fixture, (sr) => sr.next(), info);
    });
  }
});
