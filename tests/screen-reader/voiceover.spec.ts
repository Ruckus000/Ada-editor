/**
 * VoiceOver coverage. macOS only.
 *
 * NOT RUN BY THE AUTHOR — written on Linux, where VoiceOver does not exist. The first
 * CI run is the real test of this file; expect timing and phrasing assumptions
 * to need correction then.
 */
import { voiceOverTest } from '@guidepup/playwright';
import {
  type Step,
  assertButtonsAreDistinct,
  assertFindingsReachableByHeading,
  assertFocusSurvivesApplyingAFix,
  assertSeverityIsSpoken,
} from './assertions';

// Keystrokes (Tab, Option+Tab) never moved focus under VoiceOver in CI; each
// press re-announced the h1. VoiceOver users move with the VO cursor, which reads
// every item, so allow enough steps to cross all four cards.
const STEP: Step = (sr) => sr.next();
const LIMIT = 80;

voiceOverTest.describe('VoiceOver', () => {
  voiceOverTest('announces severity as words, not colour', async ({ page, voiceOver }) => {
    await assertSeverityIsSpoken(page, voiceOver);
  });

  voiceOverTest('reaches every finding by heading', async ({ page, voiceOver }) => {
    await assertFindingsReachableByHeading(page, voiceOver);
  });

  voiceOverTest('distinguishes the action buttons', async ({ page, voiceOver }) => {
    await assertButtonsAreDistinct(page, voiceOver, STEP, LIMIT);
  });

  voiceOverTest("keeps the user's place after applying a fix", async ({ page, voiceOver }) => {
    await assertFocusSurvivesApplyingAFix(page, voiceOver, STEP, LIMIT);
  });
});
