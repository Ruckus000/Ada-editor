import type { Issue } from '../../design-system/primitives/types';

/**
 * Fixture findings covering every severity, including two that deliberately
 * have no machine fix — the `manual` case the product exists to be honest about.
 */
export const FIXTURES: Issue[] = [
  {
    id: 'alt-missing',
    severity: 'blocker',
    title: 'Image has no alternative text',
    explanation: 'Screen readers will announce nothing for this chart, so its content is unavailable.',
    criterion: '1.1.1 Non-text Content',
    from: 34,
    to: 66,
  },
  {
    id: 'link-purpose',
    severity: 'violation',
    title: 'Link text is not meaningful out of context',
    explanation: '"Clicking here" tells a user navigating by links nothing about the destination.',
    criterion: '2.4.4 Link Purpose',
    from: 120,
    to: 178,
    suggestion: 'are detailed in the full findings report',
  },
  {
    id: 'reading-level',
    severity: 'advisory',
    title: 'Reading level is above the target',
    explanation: 'This sentence reads at roughly grade 16. Plain language aids every reader.',
    criterion: '3.1.5 Reading Level',
    from: 210,
    to: 246,
    suggestion: 'use a method based on',
  },
  {
    id: 'alt-quality',
    severity: 'manual',
    title: 'Alt text may not describe the image',
    explanation: '"chart" is present but may not convey what the figure shows. Only you can tell.',
    criterion: '1.1.1 Non-text Content',
    from: 280,
    to: 304,
  },
];
