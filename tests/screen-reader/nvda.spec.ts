/**
 * NVDA coverage. Windows only, so it runs in CI (screen-reader.yml), where it
 * blocks. Written on Linux without NVDA; first passed all four in run 36448190005,
 * after the browser was made headed (playwright.config.ts).
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
