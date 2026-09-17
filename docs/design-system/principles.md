# Principles

Five rules. They are ordered: when they conflict, the earlier one wins.

---

## 1. Colour is never the only channel

Not "prefer not to use colour alone" — *never*. Every state that carries
meaning must be identifiable with colour removed entirely.

WCAG 1.4.1 requires this outright, so it is the floor regardless of what any
measurement says. What follows is why it also happens to be good engineering
here — and a correction, because the first version of this argument was wrong
in an instructive way.

### The mistake, kept on the record

An earlier draft measured the distance between severity colours using **WCAG
contrast ratio**, found every pair scoring 1.00–1.32:1 under simulated
dichromacy, and concluded that no four-colour palette could ever work.

That was wrong. Contrast is a *luminance* ratio — it cannot see hue at all.
Pure red against pure green scores 2.91:1. Our own severity colours scored
~1.0:1 against each other in **perfectly normal vision**, purely because they
are tuned to equal contrast against white. The "collapse" had nothing to do
with colour-vision deficiency; it was an artefact of the instrument.

The check now uses **CIEDE2000**, which is perceptually uniform: dE 2.3 is the
just-noticeable difference, and below ~10 two colours read as shades of one
another.

### What is actually true

Measured with CIEDE2000 over the Machado (2009) model — which, unlike Viénot,
covers partial severities, and most colour-vision deficiency is partial — most
pairs come through intact:

```
light/deuteranopia@0.6: blocker vs violation dE 10.9
light/protanopia@0.6: blocker vs violation dE 15.8
light/deuteranopia@1: blocker vs advisory dE 52.2
light/protanopia@1: blocker vs advisory dE 44.7
```

Two pairs collapse at full dichromacy:

```
light/deuteranopia@1: blocker vs violation dE 3.1
light/protanopia@1: blocker vs violation dE 6.1
light/deuteranopia@1: advisory vs manual dE 1.5
```

`blocker` vs `violation` is red against amber — the exact axis red-green
deficiency removes, and the single most consequential distinction in the
product (does this block a user, or merely fail AA?).

The redeeming detail is that the palette degrades gracefully. At moderate
severity, the common case, those same pairs are usable again:

```
light/deuteranopia@0.6: blocker vs violation dE 10.9
light/protanopia@0.6: blocker vs violation dE 15.8
light/deuteranopia@0.6: advisory vs manual dE 9.6
```

### And a CVD-safe palette does exist

`scripts/palette-ceiling.mjs` searches AA-passing colours and finds four-colour
sets reaching **dE ~30** under both dichromacies — comfortably distinguishable.
So the honest statement is not "impossible." It is a trade-off:

> Reaching CVD-safe colour separation means giving up red = blocker and
> amber = violation. That convention is worth a great deal to the ~92% of
> users with typical colour vision, and the severity ramp is the first thing
> anyone learns about the product.

We keep the convention, accept that two pairs collapse, and carry the meaning
in underline shape, glyph silhouette and visible text — which 1.4.1 requires
anyway. Colour is a fifth wheel by design, which is precisely why it is allowed
to be imperfect.

Re-test either claim yourself:

```
node scripts/verify-tokens.mjs --verbose   # all 24 pair measurements
node scripts/palette-ceiling.mjs           # the achievable ceiling
```

**Test:** screenshot the UI, desaturate it, and confirm every severity is still
identifiable. If it isn't, the design is wrong — not the screenshot.

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
