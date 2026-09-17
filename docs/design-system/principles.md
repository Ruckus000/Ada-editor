# Principles

Five rules. They are ordered: when they conflict, the earlier one wins.

---

## 1. Colour is never the only channel

Not "prefer not to use colour alone" — *never*. Every state that carries
meaning must be identifiable with colour removed entirely.

This is not a stylistic preference, it is arithmetic. Here is the evidence, from
this repository's own verifier running over its own palette. Each severity
colour clears 6.4:1 against its background. Under simulated dichromacy, the
pairwise contrast *between* them:

```
light/deuteranopia: blocker   vs violation = 1.17:1
light/deuteranopia: violation vs advisory  = 1.12:1
light/deuteranopia: advisory  vs manual    = 1.01:1
light/protanopia:   blocker   vs manual    = 1.00:1
```

All twenty-four severity pairs — four severities, two themes, two dichromacy
types — land between 1.00:1 and 1.32:1. **Identical, or near enough.**

The reason is structural, and worth internalising because it means no palette
can fix it: forcing every semantic colour to hit the same contrast ratio forces
them to the same *luminance*, and equal luminance is exactly what destroys
separation once hue information is gone. Meeting AA and encoding four states in
colour are mutually exclusive goals.

So colour in this system is decoration. Shape, glyph and text carry the meaning.
Run `node scripts/verify-tokens.mjs --verbose` to see all twenty-four pairs.

**Test:** screenshot the UI, desaturate it, and confirm every severity is still
identifiable. If it isn't, the design is wrong — not the screenshot.

---

## 2. The list is the product; the editor is a view of it

Every finding must be readable, understandable and actionable from the issue
list, using only the keyboard, without entering the editing surface.

`contenteditable` plus screen readers is an unreliable combination, and there is
no broadly supported ARIA mechanism for "this span carries an accessibility
annotation." An interface that depends on inline annotation to convey findings
will not reach every user. See
[the audit, §5](../audit/grammarly-ux-audit.md#5-inline-annotation-has-no-reliable-assistive-technology-mechanism--adapt-this-is-the-big-one).

**Test:** unplug the mouse and turn off the stylesheet's underline rules. Can
you still triage the whole document? If not, work has leaked into the
enhancement layer.

---

## 3. Never claim compliance the tool cannot verify

Automated checking covers roughly a third of WCAG. The remainder — whether alt
text is *accurate*, whether link text is *meaningful*, whether headings reflect
real structure — requires a human.

The `manual` severity exists so that "we cannot decide this" is a first-class
result rather than silence. There is no success badge in this component set,
and adding one is a design change requiring an explicit decision, not a ticket.

**Test:** search the codebase for a green "compliant" state. There should be
nothing to find.

---

## 4. Constraints are enforced by code, not by documentation

A design principle nobody can run is a suggestion. Grammarly's colour system did
not fail because their designers were careless; it failed because nothing in
their pipeline measured it and said no.

`scripts/verify-tokens.mjs` runs in CI and fails the build on: an unmet contrast
assertion, a severity with fewer than two non-colour channels, an
indistinguishable severity pair without a declared non-colour fallback, and a
dangling CSS custom property.

When a check fails, fix the token. **Do not lower the assertion.** If an
assertion is genuinely wrong, changing it is a reviewed commit with a stated
reason, not a quiet edit.

---

## 5. The document is the interface; chrome earns its place

The writing surface is 66ch, set in a serif face, on a plain background, with
no persistent toolbar. Findings live in one fixed region. Nothing floats over
prose, nothing moves in response to the caret, nothing animates unless it is
communicating a state change.

This is the part of Grammarly worth keeping: they are disciplined about keeping
the page calm. The discipline here is stricter, because a tool that makes
writing harder will not be used, and a tool that is not used produces no
accessible documents at all.
