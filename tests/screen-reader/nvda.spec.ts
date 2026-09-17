/**
 * NVDA coverage. Windows only.
 *
 * NOT RUN BY THE AUTHOR — written on Linux, where NVDA does not exist. The first
 * CI run is the real test of this file; expect timing and phrasing assumptions
 * to need correction then.
 */
import { nvdaTest } from '@guidepup/playwright';
import {
  assertButtonsAreDistinct,
  assertFindingsReachableByHeading,
  assertFocusSurvivesApplyingAFix,
  assertSeverityIsSpoken,
} from './assertions';

nvdaTest.describe('NVDA', () => {
  nvdaTest('announces severity as words, not colour', async ({ page, nvda }) => {
    await assertSeverityIsSpoken(page, nvda);
  });

  nvdaTest('reaches every finding by heading', async ({ page, nvda }) => {
    await assertFindingsReachableByHeading(page, nvda);
  });

  nvdaTest('distinguishes the action buttons', async ({ page, nvda }) => {
    await assertButtonsAreDistinct(page, nvda);
  });

  nvdaTest("keeps the user's place after applying a fix", async ({ page, nvda }) => {
    await assertFocusSurvivesApplyingAFix(page, nvda);
  });
});
