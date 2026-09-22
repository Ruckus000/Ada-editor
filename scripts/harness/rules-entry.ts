/**
 * Bundle entry for scripts/verify-rules.mjs. esbuild compiles the engine's
 * TypeScript so plain Node can exercise it; this file only re-exports.
 */
export * as textHelpers from '../../app/_engine/textHelpers';
export * as rules from '../../app/_engine/rules';
export { schema } from '../../app/_editor/editorSchema';
