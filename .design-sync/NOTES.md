# design-sync notes: Ada-editor

## How this repo builds for the sync

- There's no dist/ and no package build. The primitives are type-checked in place. `node .design-sync/build-pkg.mjs` (cfg.buildCmd) stages a real package at `.design-sync/.cache/pkg/`: an esbuild ESM `dist/index.js`, tsc `types/*.d.ts`, `dist/primitives.css`, and `tokens/tokens.css`. **Re-run it before every sync.** It's gitignored, so a fresh clone has no staged package.
- The converter is pointed at the staged package: `--entry ./.design-sync/.cache/pkg/dist/index.js --node-modules ./node_modules`. The config's `srcDir`/`docsDir` are relative to the staged package dir, hence the `../../../`.
- `tokensPkg: "../.design-sync/.cache/pkg"` works by path traversal from `node_modules/`. It's a deliberate trick so `tokens/tokens.css` ships as its own file.
- Use Node 22 (`nvm use 22`), per `engines.node >= 22`. Default shell node is 20.
- Playwright for the render check: install `playwright@1.58.0` in `.ds-sync/`, because it matches the cached `chromium-1208` in ~/Library/Caches/ms-playwright. The repo's own @playwright/test 1.63 wants chromium 1243, which isn't cached.
- Previews import `FIXTURES` from `scripts/harness/fixtures.ts`, the repo's own finding data. Keep them pointed there, not at inlined copies.

## Decisions

- `runtimeFontPrefixes: ["Iowan Old Style"]`: it's a macOS system font inside the deliberate system stack `--ada-type-family-doc: Georgia, 'Iowan Old Style', serif`. The DS ships no webfonts by design.
- `tailwind-theme.css` is NOT shipped. It's Tailwind v4 `@theme` source, which only means something inside a Tailwind build. Designs use `var(--ada-*)` tokens directly.
- IssueList card: `cardMode: single`, viewport `520x1240`. The 4-finding panel is ~1150px tall and clipped in the default grid cell.
- Hooks, plugin, and constants (`useAnnounce`, `useRegionCycling`, `issueUnderlinePlugin`, `SEVERITIES`, …) ship on `window.AdaEditor` but have no cards.

## DS findings (for the design-system owners, not sync config)

- `Button` has no `:disabled` style in primitives.css, so a disabled button looks identical to an enabled one. The Disabled preview cell was dropped for this reason. The conventions header tells the design agent to hide unavailable actions instead.
- `IssueCard.d.ts` / `IssueList.d.ts` reference `Issue` without defining it (the converter emits the props body only). The shape is documented in conventions.md. If `types.ts` changes, update the "Data shape" section.
- `Button.d.ts` keeps only `variant`, `iconOnly`, `className`, `id`, `style`, `children`. The inherited `ButtonHTMLAttributes` (onClick, disabled, aria-*) are filtered by the converter. Add `cfg.dtsPropsFor.Button` if the agent misuses Button.

## Known render warns

- None at last sync.

## Re-sync risks

- conventions.md hand-lists the tokens, the `Issue` shape, and the Button API. Any rename in tokens.json, types.ts, or Button.tsx makes it stale. The re-sync validation pass greps tokens, so re-check the data shape by hand.
- The IssueList viewport (520x1240) is tuned to 4 fixtures. Adding fixtures to scripts/harness/fixtures.ts will clip the card again.
- build-pkg.mjs restates the tsc options on the CLI because tsconfig.json has noEmit. If the repo's TS settings change meaningfully (for example `jsx`), mirror them there.
- Claude Design projects that use this DS hold a **snapshot** under `_ds/<name>-<id>/`; a re-sync does not update them. "Editor platform design" (587dae6c…) still has the pre-fix forced-colors selector in `tokens.css`. Harmless while its Ada screens (`Dashboard.dc.html`, `Editor.dc.html`) pin `data-theme="light"`; re-attach the DS in that project if a screen drops the pin or goes dark.
