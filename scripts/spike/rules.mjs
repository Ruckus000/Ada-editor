/**
 * A first pass at real WCAG document rules.
 *
 * The point is not rule completeness. It is the SHAPE of the finding set: how
 * many findings a machine can decide, how many it can fix, and how many it can
 * only flag for a human. That distribution decides whether an inline assistant
 * is the right product form at all.
 *
 * Severity follows docs/design-system/patterns-suggestion.md:
 *   blocker   fails Level A
 *   violation fails Level AA
 *   advisory  AAA or best practice
 *   manual    not machine-decidable
 *
 * A rule sets `suggestion` only when a machine can produce the corrected text
 * without human judgement. Most cannot, and pretending otherwise is the failure
 * mode this spike is checking for.
 */

const GENERIC_LINK_TEXT = new Set([
  'click here', 'here', 'read more', 'more', 'learn more', 'link', 'this',
  'this link', 'click', 'details', 'see more', 'continue', 'go', 'download',
]);

/** Words that describe an appearance the reader may not be able to perceive. */
const COLOUR_WORDS = /\b(red|green|blue|yellow|orange|purple|pink|grey|gray|black|white)\b/i;
/** Only a problem when the colour is doing the pointing. */
const COLOUR_REFERENCE = /\b(the|in|marked|shown|highlighted|coloured|colored|see)\s+\w{0,12}\s*(red|green|blue|yellow|orange|purple|pink)\b/i;

const REDUNDANT_ALT_PREFIX = /^\s*(image|picture|photo|graphic|icon|screenshot)\s+(of|showing)\s+/i;

const text = (node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();

const syllables = (word) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
};

/** Flesch-Kincaid grade level. */
const gradeLevel = (prose) => {
  const sentences = prose.split(/[.!?]+\s/).filter((s) => s.trim().length > 12);
  const words = prose.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (sentences.length === 0 || words.length < 25) return null;
  const sylls = words.reduce((sum, w) => sum + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (sylls / words.length) - 15.59;
};

/* ---------- rules ---------- */

export const RULES = [
  {
    id: 'img-alt-missing',
    criterion: '1.1.1 Non-text Content',
    run(doc) {
      const out = [];
      for (const img of doc.querySelectorAll('img')) {
        const alt = img.getAttribute('alt');
        if (alt !== null && alt.trim() !== '') continue;
        // alt="" is a valid decorative marker, but only a human knows if the
        // image is decorative — so an explicit empty alt is a manual check,
        // while a missing attribute is an outright failure.
        const missing = alt === null;
        out.push({
          severity: missing ? 'blocker' : 'manual',
          anchor: 'range',
          title: missing ? 'Image has no alternative text' : 'Image marked decorative — is it?',
          explanation: missing
            ? 'Screen readers will announce nothing for this image, so its content is unavailable.'
            : 'An empty alt hides this image from screen readers. Correct only if it is purely decorative.',
          snippet: img.getAttribute('src') ?? '<img>',
        });
      }
      return out;
    },
  },

  {
    id: 'img-alt-suspicious',
    criterion: '1.1.1 Non-text Content',
    run(doc) {
      const out = [];
      for (const img of doc.querySelectorAll('img')) {
        const alt = (img.getAttribute('alt') ?? '').trim();
        if (!alt) continue;

        if (REDUNDANT_ALT_PREFIX.test(alt)) {
          out.push({
            severity: 'advisory',
            anchor: 'range',
            title: 'Alternative text repeats that it is an image',
            explanation: 'Screen readers already announce the element as an image, so the prefix is read twice.',
            // Mechanical and safe: strip the prefix.
            suggestion: alt.replace(REDUNDANT_ALT_PREFIX, ''),
            snippet: alt,
          });
          continue;
        }
        const looksLikeFilename = /\.(png|jpe?g|gif|svg|webp)$/i.test(alt) || /^[\w-]+_[\w-]+$/.test(alt);
        const tooTerse = alt.split(/\s+/).length < 2 && alt.length < 12;
        if (looksLikeFilename || tooTerse) {
          out.push({
            severity: 'manual',
            anchor: 'range',
            title: 'Alternative text may not describe the image',
            explanation: `"${alt}" may not convey what the image shows. Only you can tell.`,
            snippet: alt,
          });
        }
      }
      return out;
    },
  },

  {
    id: 'link-text-generic',
    criterion: '2.4.4 Link Purpose (In Context)',
    run(doc) {
      const out = [];
      for (const a of doc.querySelectorAll('a')) {
        const label = text(a).toLowerCase().replace(/[.!?:]+$/, '');
        if (!label) continue;
        if (GENERIC_LINK_TEXT.has(label)) {
          out.push({
            severity: 'violation',
            anchor: 'range',
            title: 'Link text is not meaningful out of context',
            explanation: `"${text(a)}" tells a user navigating by links nothing about the destination.`,
            // No suggestion: naming the destination needs a human who knows it.
            snippet: text(a),
          });
        }
      }
      return out;
    },
  },

  {
    id: 'link-text-raw-url',
    criterion: '2.4.4 Link Purpose (In Context)',
    run(doc) {
      const out = [];
      for (const a of doc.querySelectorAll('a')) {
        const label = text(a);
        if (!/^https?:\/\//i.test(label) || label.length < 25) continue;
        out.push({
          severity: 'violation',
          anchor: 'range',
          title: 'Link text is a raw URL',
          explanation: 'A screen reader reads the URL character by character. Give the link a human label.',
          snippet: label.slice(0, 60),
        });
      }
      return out;
    },
  },

  {
    id: 'link-text-ambiguous',
    criterion: '2.4.4 Link Purpose (In Context)',
    run(doc) {
      const byLabel = new Map();
      for (const a of doc.querySelectorAll('a')) {
        const label = text(a).toLowerCase();
        const href = a.getAttribute('href') ?? '';
        if (!label || label.length < 3) continue;
        if (!byLabel.has(label)) byLabel.set(label, new Set());
        byLabel.get(label).add(href);
      }
      const out = [];
      for (const [label, hrefs] of byLabel) {
        if (hrefs.size < 2) continue;
        out.push({
          severity: 'manual',
          anchor: 'range',
          title: 'Same link text points to different places',
          explanation: `"${label}" is used for ${hrefs.size} different destinations. Whether that is confusing depends on the surrounding text.`,
          snippet: label.slice(0, 50),
        });
      }
      return out;
    },
  },

  {
    id: 'heading-skip',
    criterion: '1.3.1 Info and Relationships',
    run(doc) {
      const headings = [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')];
      const out = [];
      let previous = 0;
      for (const h of headings) {
        const level = Number(h.tagName[1]);
        if (previous && level > previous + 1) {
          out.push({
            severity: 'violation',
            anchor: 'range',
            title: `Heading level jumps from h${previous} to h${level}`,
            explanation: 'Users navigating by heading rely on the levels describing the real structure.',
            // Mechanical: the only correct level is one below its parent.
            suggestion: `h${previous + 1}`,
            snippet: text(h).slice(0, 60),
          });
        }
        previous = level;
      }
      return out;
    },
  },

  {
    id: 'heading-empty',
    criterion: '1.3.1 Info and Relationships',
    run(doc) {
      return [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .filter((h) => text(h) === '')
        .map(() => ({
          severity: 'blocker',
          anchor: 'range',
          title: 'Heading is empty',
          explanation: 'An empty heading is announced as a heading with nothing in it.',
          snippet: '',
        }));
    },
  },

  {
    id: 'document-no-h1',
    criterion: '2.4.10 Section Headings',
    run(doc) {
      if (doc.querySelectorAll('h1').length > 0) return [];
      if (doc.querySelectorAll('h2,h3,h4,h5,h6').length === 0) return [];
      return [{
        severity: 'violation',
        anchor: 'document',
        title: 'Document has no top-level heading',
        explanation: 'There is no h1, so the document has no stated title in its structure.',
      }];
    },
  },

  {
    id: 'table-no-header',
    criterion: '1.3.1 Info and Relationships',
    run(doc) {
      const out = [];
      for (const table of doc.querySelectorAll('table')) {
        if (table.querySelectorAll('th').length > 0) continue;
        out.push({
          severity: 'blocker',
          anchor: 'range',
          title: 'Table has no header cells',
          explanation: 'Without header cells a screen reader cannot say which column or row a value belongs to.',
          snippet: text(table).slice(0, 50),
        });
      }
      return out;
    },
  },

  {
    id: 'colour-only-reference',
    criterion: '1.4.1 Use of Color',
    run(doc) {
      const out = [];
      for (const p of doc.querySelectorAll('p,li,td')) {
        const prose = text(p);
        if (!COLOUR_WORDS.test(prose) || !COLOUR_REFERENCE.test(prose)) continue;
        out.push({
          severity: 'manual',
          anchor: 'range',
          title: 'Instruction may rely on colour alone',
          explanation: 'If colour is the only way to identify what this refers to, readers who cannot perceive it are excluded.',
          snippet: prose.slice(0, 80),
        });
      }
      return out;
    },
  },

  {
    id: 'reading-level',
    criterion: '3.1.5 Reading Level',
    run(doc) {
      const out = [];
      for (const p of doc.querySelectorAll('p')) {
        const prose = text(p);
        const grade = gradeLevel(prose);
        if (grade === null || grade <= 12) continue;
        out.push({
          severity: 'advisory',
          anchor: 'range',
          title: `Passage reads at about grade ${Math.round(grade)}`,
          explanation: 'Plain language helps every reader, and is required of much public-sector writing.',
          snippet: prose.slice(0, 80),
        });
      }
      return out;
    },
  },

  {
    id: 'long-sentence',
    criterion: '3.1.5 Reading Level',
    run(doc) {
      const out = [];
      for (const p of doc.querySelectorAll('p,li')) {
        for (const sentence of text(p).split(/(?<=[.!?])\s+/)) {
          const words = sentence.split(/\s+/).filter(Boolean);
          if (words.length <= 35) continue;
          out.push({
            severity: 'advisory',
            anchor: 'range',
            title: `Sentence runs to ${words.length} words`,
            explanation: 'Long sentences are harder to follow, especially when heard rather than read.',
            snippet: sentence.slice(0, 80),
          });
        }
      }
      return out;
    },
  },

  {
    id: 'document-language',
    criterion: '3.1.1 Language of Page',
    run(doc, meta) {
      if (meta.hasLanguage) return [];
      return [{
        severity: 'blocker',
        anchor: 'document',
        title: 'Document does not declare a language',
        explanation: 'Without a language, a screen reader may read the text with the wrong pronunciation rules.',
        // Detectable and mechanical, so this one genuinely is auto-fixable.
        suggestion: 'lang="en"',
      }];
    },
  },
];
