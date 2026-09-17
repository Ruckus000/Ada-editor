# Tokens

`design-system/tokens.json` is the only source of truth. `tokens.css`,
`tailwind-theme.css` and `primitives/severity.ts` are **generated** — never edit
them by hand.

```
node scripts/build-tokens.mjs    # regenerate
node scripts/verify-tokens.mjs   # verify (runs in CI)
```

## Three tiers

| Tier | Example | Rule |
|---|---|---|
| **Primitive** | `primitive.blue.600` → `#1F5EA8` | Raw ramp. Components must never reference these. |
| **Semantic** | `semantic.light.severity.blocker.fg` | What a colour *means*. This is what components use. |
| **Encoding** | `encoding.blocker.underline` → `double` | The non-colour channels that actually carry meaning. |

Semantic tokens are theme-scoped (`light` / `dark`) and emitted as CSS custom
properties without the theme segment, so `semantic.light.text.primary` and
`semantic.dark.text.primary` both become `--ada-text-primary` under different
selectors. Components never branch on theme.

## Contrast assertions

Every foreground token declares what it must clear:

```json
"primary": {
  "$type": "color",
  "$value": "{primitive.neutral.900}",
  "$extensions": { "ada": { "contrast": { "against": "semantic.light.surface.canvas", "min": 7 } } }
}
```

A token may declare **several** assertions, because one colour often renders
against more than one background. Each severity colour is asserted twice: as an
underline on the canvas, and as badge text on its own tint. Every rendering
context gets its own check — an unasserted pair is how a silent regression
starts.

The verifier resolves each reference, measures, and fails the build below `min`.
**Fix the token; do not lower the assertion.**

Tokens that are genuinely decorative (a subtle divider that conveys nothing)
declare `"decorative": true` and are skipped — an explicit, reviewable claim
rather than a silent omission.

## Measured values

Everything below is verifier output, pasted verbatim. No ratio here was typed
by hand.

```
  ok  semantic.light.text.primary                    #161C24 on #FFFFFF  17.13:1 (min 7)
  ok  semantic.light.text.secondary                  #4E5B6E on #FFFFFF  6.90:1 (min 4.5)
  ok  semantic.light.text.tertiary                   #64748B on #FFFFFF  4.76:1 (min 4.5)
  ok  semantic.light.text.inverse                    #FFFFFF on #1A4FBF  7.21:1 (min 4.5)
  ok  semantic.light.border.control                  #64748B on #FFFFFF  4.76:1 (min 3)
  ok  semantic.light.focus.ring                      #0B57D0 on #FFFFFF  6.39:1 (min 3)
  ok  semantic.light.action.primary.fg               #FFFFFF on #1A4FBF  7.21:1 (min 4.5)
  ok  semantic.light.action.secondary.fg             #161C24 on #EDF1F7  15.11:1 (min 4.5)
  ok  semantic.light.severity.blocker.fg [underline/stripe on canvas] #B3261E on #FFFFFF  6.54:1 (min 4.5)
  ok  semantic.light.severity.blocker.fg [badge text on own tint] #B3261E on #FCEEEE  5.79:1 (min 4.5)
  ok  semantic.light.severity.violation.fg [underline/stripe on canvas] #8A4B00 on #FFFFFF  6.80:1 (min 4.5)
  ok  semantic.light.severity.violation.fg [badge text on own tint] #8A4B00 on #FDF3E7  6.20:1 (min 4.5)
  ok  semantic.light.severity.advisory.fg [underline/stripe on canvas] #1F5EA8 on #FFFFFF  6.51:1 (min 4.5)
  ok  semantic.light.severity.advisory.fg [badge text on own tint] #1F5EA8 on #EAF2FC  5.77:1 (min 4.5)
  ok  semantic.light.severity.manual.fg [underline/stripe on canvas] #6B3FA0 on #FFFFFF  7.38:1 (min 4.5)
  ok  semantic.light.severity.manual.fg [badge text on own tint] #6B3FA0 on #F3EDFB  6.44:1 (min 4.5)
  ok  semantic.light.severity.checked.fg [underline/stripe on canvas] #1B6B4A on #FFFFFF  6.46:1 (min 4.5)
  ok  semantic.light.severity.checked.fg [badge text on own tint] #1B6B4A on #E8F6EF  5.81:1 (min 4.5)
  ok  semantic.dark.text.primary                     #EDF1F7 on #0B0F14  16.96:1 (min 7)
  ok  semantic.dark.text.secondary                   #C2CCDA on #0B0F14  11.85:1 (min 4.5)
  ok  semantic.dark.text.tertiary                    #97A4B8 on #0B0F14  7.61:1 (min 4.5)
  ok  semantic.dark.text.inverse                     #0B0F14 on #A8C7FA  11.18:1 (min 4.5)
  ok  semantic.dark.border.control                   #97A4B8 on #0B0F14  7.61:1 (min 3)
  ok  semantic.dark.focus.ring                       #9CC3FF on #0B0F14  10.67:1 (min 3)
  ok  semantic.dark.action.primary.fg                #0B0F14 on #A8C7FA  11.18:1 (min 4.5)
  ok  semantic.dark.action.secondary.fg              #EDF1F7 on #252D38  12.26:1 (min 4.5)
  ok  semantic.dark.severity.blocker.fg [underline/stripe on canvas] #FFB4AB on #0B0F14  11.32:1 (min 4.5)
  ok  semantic.dark.severity.blocker.fg [badge text on own tint] #FFB4AB on #2A1614  10.11:1 (min 4.5)
  ok  semantic.dark.severity.violation.fg [underline/stripe on canvas] #FFB77C on #0B0F14  11.27:1 (min 4.5)
  ok  semantic.dark.severity.violation.fg [badge text on own tint] #FFB77C on #2A1D0D  9.62:1 (min 4.5)
  ok  semantic.dark.severity.advisory.fg [underline/stripe on canvas] #A8C7FA on #0B0F14  11.18:1 (min 4.5)
  ok  semantic.dark.severity.advisory.fg [badge text on own tint] #A8C7FA on #12203A  9.44:1 (min 4.5)
  ok  semantic.dark.severity.manual.fg [underline/stripe on canvas] #D0BCFF on #0B0F14  11.27:1 (min 4.5)
  ok  semantic.dark.severity.manual.fg [badge text on own tint] #D0BCFF on #221A35  9.72:1 (min 4.5)
  ok  semantic.dark.severity.checked.fg [underline/stripe on canvas] #7BD9AE on #0B0F14  11.33:1 (min 4.5)
  ok  semantic.dark.severity.checked.fg [badge text on own tint] #7BD9AE on #0F2620  9.39:1 (min 4.5)
```

## Dichromat separation

Here is the finding that shapes the whole system. Every severity colour clears
6.4:1 individually — and every pair is indistinguishable from every other pair
once hue information is gone:

```
  ok  light/deuteranopia: blocker vs violation = 1.17:1
  ok  light/deuteranopia: blocker vs advisory = 1.31:1
  ok  light/deuteranopia: blocker vs manual = 1.32:1
  ok  light/deuteranopia: violation vs advisory = 1.12:1
  ok  light/deuteranopia: violation vs manual = 1.13:1
  ok  light/deuteranopia: advisory vs manual = 1.01:1
  ok  light/protanopia: blocker vs violation = 1.06:1
  ok  light/protanopia: blocker vs advisory = 1.22:1
  ok  light/protanopia: blocker vs manual = 1.00:1
  ok  light/protanopia: violation vs advisory = 1.15:1
  ok  light/protanopia: violation vs manual = 1.06:1
  ok  light/protanopia: advisory vs manual = 1.22:1
  ok  dark/deuteranopia: blocker vs violation = 1.01:1
  ok  dark/deuteranopia: blocker vs advisory = 1.13:1
  ok  dark/deuteranopia: blocker vs manual = 1.07:1
  ok  dark/deuteranopia: violation vs advisory = 1.12:1
  ok  dark/deuteranopia: violation vs manual = 1.05:1
  ok  dark/deuteranopia: advisory vs manual = 1.06:1
  ok  dark/protanopia: blocker vs violation = 1.01:1
  ok  dark/protanopia: blocker vs advisory = 1.05:1
  ok  dark/protanopia: blocker vs manual = 1.03:1
  ok  dark/protanopia: violation vs advisory = 1.05:1
  ok  dark/protanopia: violation vs manual = 1.04:1
  ok  dark/protanopia: advisory vs manual = 1.01:1
```

Twenty-four pairs, all between 1.00:1 and 1.32:1. `blocker` vs `manual` under
protanopia is **1.00:1** — the same colour.

This is not a palette that needs improving. It is proof that the approach
cannot work: forcing every semantic colour to the same contrast ratio forces
them to the same luminance, and equal luminance is what destroys separation
under colour-vision deficiency. Meeting AA and encoding four states in colour
are mutually exclusive.

The verifier therefore does not demand colour separation. It demands that each
severity declare **at least two non-colour channels**, and it fails the build if
one does not. Colour is permitted to be useless here, because nothing depends
on it.

## Encoding table

The channels that actually do the work:

| Severity | Underline | Glyph | Label |
|---|---|---|---|
| `blocker` | `double` | octagon | Blocks access |
| `violation` | `wavy` | triangle | Fails AA |
| `advisory` | `dotted` | circle-i | Advisory |
| `manual` | `dashed` | diamond-? | Needs your call |

Generated into `primitives/severity.ts`, so TypeScript and CSS cannot disagree
about what a severity is.

## Ad-hoc checking

```
$ node scripts/verify-tokens.mjs --pair '#15C39A' '#FFFFFF'
#15C39A on #FFFFFF = 2.26:1
  text AA  (4.5:1) FAIL
  text AAA (7.0:1) FAIL
  non-text (3.0:1) FAIL
```

That is Grammarly's brand green. It is here as a regression test for our own
judgement: the moment a proposed brand colour behaves like this, it is a fill
colour and nothing more.

## Preview

`design-system/preview.html` renders the whole system from the real generated
stylesheets, so it cannot drift from the tokens. Open it directly — no build
step, no server.

It exists to make principle 1 falsifiable. Apply `filter: grayscale(1)` to the
page (the harness has a `.grayscale` class) and every severity must still be
identifiable. It is, via underline shape and glyph silhouette. The same holds
with the `forced-colors` block active, where all five severity colours collapse
to `CanvasText` and the interface keeps working.
