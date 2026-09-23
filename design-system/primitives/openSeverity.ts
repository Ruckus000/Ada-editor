import type { Severity } from './severity';

/**
 * The severities a person still has to act on. `checked` is a rule outcome,
 * not an open finding, so documents only count these four.
 *
 * Hand-written companion to the generated severity.ts — do not fold it in
 * there; that file is rebuilt from tokens.json by scripts/build-tokens.mjs.
 */
export type OpenSeverity = Exclude<Severity, 'checked'>;

export const OPEN_SEVERITIES: readonly OpenSeverity[] = ['blocker', 'violation', 'advisory', 'manual'];
