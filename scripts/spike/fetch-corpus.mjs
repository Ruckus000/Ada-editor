#!/usr/bin/env node
/**
 * Fetches a corpus of real, human-written documents.
 *
 * These are not written for this test. Authoring the corpus would guarantee the
 * finding distribution I expect, which is the whole thing this spike exists to
 * avoid. Only raw.githubusercontent.com is reachable from this environment, so
 * the corpus is drawn from public repositories — weighted toward government and
 * policy handbooks, because public-sector documents are the product's actual
 * target and the ones legally obliged to be accessible.
 *
 *   node scripts/spike/fetch-corpus.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../corpus');
mkdirSync(OUT, { recursive: true });

const RAW = 'https://raw.githubusercontent.com';

/** [local name, url, kind] — kind describes the document, for reporting. */
const DOCUMENTS = [
  // Government and public-sector documents — the product's actual target, and
  // the ones under a legal obligation to be accessible.
  ['usds-playbook.md', `${RAW}/usds/playbook/master/README.md`, 'gov playbook'],
  ['cfpb-design-system.md', `${RAW}/cfpb/design-system/main/README.md`, 'gov doc'],
  ['uswds.md', `${RAW}/uswds/uswds/develop/README.md`, 'gov doc'],
  ['govuk-design-system.md', `${RAW}/alphagov/govuk-design-system/main/README.md`, 'gov doc'],
  ['w3c-wcag.md', `${RAW}/w3c/wcag/main/README.md`, 'standards doc'],

  // Guidance and procedural prose.
  ['carbon-accessibility-guide.md', `${RAW}/carbon-design-system/carbon/main/docs/guides/accessibility.md`, 'guidance'],
  ['publiclab-contributing.md', `${RAW}/publiclab/plots2/main/CONTRIBUTING.md`, 'procedural'],
  ['netflix-hollow-contributing.md', `${RAW}/Netflix/hollow/master/CONTRIBUTING.md`, 'procedural'],
  ['mdn-content.md', `${RAW}/mdn/content/main/README.md`, 'guidance'],
  ['wicg-proposals.md', `${RAW}/WICG/proposals/main/README.md`, 'procedural'],

  // Long-form guides — report-like prose.
  ['opensource-guide-contribute.md', `${RAW}/github/opensource.guide/main/_articles/how-to-contribute.md`, 'long-form guide'],
  ['opensource-guide-starting.md', `${RAW}/github/opensource.guide/main/_articles/starting-a-project.md`, 'long-form guide'],
  ['opensource-guide-coc.md', `${RAW}/github/opensource.guide/main/_articles/code-of-conduct.md`, 'long-form guide'],
  ['opensource-guide-leadership.md', `${RAW}/github/opensource.guide/main/_articles/leadership-and-governance.md`, 'long-form guide'],
  ['opensource-guide-metrics.md', `${RAW}/github/opensource.guide/main/_articles/metrics.md`, 'long-form guide'],

  // Policy documents.
  ['rust-code-of-conduct.md', `${RAW}/rust-lang/rust/master/CODE_OF_CONDUCT.md`, 'policy'],
  ['node-code-of-conduct.md', `${RAW}/nodejs/node/main/CODE_OF_CONDUCT.md`, 'policy'],
  ['contributor-covenant.md', `${RAW}/EthicalSource/contributor_covenant/release/content/version/2/1/code_of_conduct.md`, 'policy'],
  ['superset-code-of-conduct.md', `${RAW}/apache/superset/master/CODE_OF_CONDUCT.md`, 'policy'],

  // Technical documentation and READMEs.
  ['node-readme.md', `${RAW}/nodejs/node/main/README.md`, 'technical readme'],
  ['react-readme.md', `${RAW}/facebook/react/main/README.md`, 'technical readme'],
  ['rust-contributing.md', `${RAW}/rust-lang/rust/master/CONTRIBUTING.md`, 'technical doc'],
  ['kubernetes-readme.md', `${RAW}/kubernetes/kubernetes/master/README.md`, 'technical readme'],
  ['vscode-readme.md', `${RAW}/microsoft/vscode/main/README.md`, 'technical readme'],
  ['django-readme.rst', `${RAW}/django/django/main/README.rst`, 'technical readme'],
  ['tensorflow-readme.md', `${RAW}/tensorflow/tensorflow/master/README.md`, 'technical readme'],
  ['bootstrap-readme.md', `${RAW}/twbs/bootstrap/main/README.md`, 'technical readme'],
  ['eslint-readme.md', `${RAW}/eslint/eslint/main/README.md`, 'technical readme'],
  ['webpack-readme.md', `${RAW}/webpack/webpack/main/README.md`, 'technical readme'],
  ['axe-core-readme.md', `${RAW}/dequelabs/axe-core/develop/README.md`, 'technical readme'],
];

const manifest = [];
let ok = 0;

for (const [name, url, kind] of DOCUMENTS) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) { console.log(`  skip ${name} (HTTP ${response.status})`); continue; }
    const text = await response.text();
    if (text.trim().length < 400) { console.log(`  skip ${name} (too short)`); continue; }
    writeFileSync(resolve(OUT, name), text);
    manifest.push({ name, url, kind, bytes: text.length });
    ok++;
    console.log(`  ok   ${name.padEnd(34)} ${String(text.length).padStart(7)} bytes  [${kind}]`);
  } catch (error) {
    console.log(`  fail ${name}: ${error.message}`);
  }
}

writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n${ok}/${DOCUMENTS.length} documents fetched.`);
