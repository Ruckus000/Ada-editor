/**
 * VoiceOver coverage. macOS only.
 *
 * NOT RUN BY THE AUTHOR — written on Linux, where VoiceOver does not exist. The first
 * CI run is the real test of this file; expect timing and phrasing assumptions
 * to need correction then.
 */
import { voiceOverTest } from '@guidepup/playwright';
import {
  assertButtonsAreDistinct,
  assertFindingsReachableByHeading,
  assertFocusSurvivesApplyingAFix,
  assertSeverityIsSpoken,
} from './assertions';

voiceOverTest.describe('VoiceOver', () => {
  voiceOverTest('announces severity as words, not colour', async ({ page, voiceOver }) => {
    await assertSeverityIsSpoken(page, voiceOver);
  });

  voiceOverTest('reaches every finding by heading', async ({ page, voiceOver }) => {
    await assertFindingsReachableByHeading(page, voiceOver);
  });

  voiceOverTest('distinguishes the action buttons', async ({ page, voiceOver }) => {
    await assertButtonsAreDistinct(page, voiceOver);
  });

  voiceOverTest("keeps the user's place after applying a fix", async ({ page, voiceOver }) => {
    await assertFocusSurvivesApplyingAFix(page, voiceOver);
  });
});
