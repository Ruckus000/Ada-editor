/**
 * NVDA reading exported documents, top to bottom, for the "Hear it as a
 * screen reader" simulation. Windows only, so CI only (screen-reader.yml).
 */
import { nvdaTest } from '@guidepup/playwright';
import { READING_FIXTURES } from './readingPack';
import { assertReadsAsRecorded } from './reading';

// The default, "initial", keeps only the first speech after each key press;
// a line that NVDA speaks in two parts would lose the second.
nvdaTest.use({ nvdaStartOptions: { capture: true } });

nvdaTest.describe('NVDA reading an export', () => {
  // A line at a time, each waited out: minutes, not the suite's 5.
  nvdaTest.describe.configure({ timeout: 10 * 60 * 1000 });
  for (const fixture of READING_FIXTURES) {
    nvdaTest(`reads ${fixture} as recorded`, async ({ page, nvda }, info) => {
      await assertReadsAsRecorded(page, nvda, 'nvda', fixture, (sr) => sr.next(), info);
    });
  }
});
