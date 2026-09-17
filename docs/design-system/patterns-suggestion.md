# Pattern: reporting a finding

The core pattern of the product. Three layers, in order of importance.

---

## Layer 1 — the issue list (canonical)

A fixed region, always present, containing every finding. This is the interface.
Everything below is enhancement.

Each finding renders as an `IssueCard` carrying, in DOM order:

1. `SeverityBadge` — glyph + **visible text label**
2. Title — what is wrong, imperative
3. Explanation — why it matters, plain language, never truncated behind a
   "learn more". This carries most of the card's value, because the fix itself
   is usually the author's to make
4. The WCAG success criterion
5. The suggested replacement when one exists; for `manual` findings, a line
   saying the call is the author's
6. Actions — `Go to text` (primary), `Apply fix` (only when a fix exists, and
   primary when it does), and `Dismiss`

### Why `Go to text` is the primary action

Measured over 28 real documents in
[the rule-set spike](../audit/rule-set-spike.md), **4.8% of findings carry an
automatic fix** — and almost all of those are "declare a language", a property
of the export rather than the prose. Fixing an accessibility finding means
knowing what the image shows or where the link goes, which is the author's
knowledge and not the document's.

So the card's default primary action takes the author to the passage.
`Apply fix` is promoted only in the rare case where a fix exists.

**This is the part of Grammarly's model that does not transfer.** Its central
interaction is accepting a computed correction; here there usually isn't one.
The audit did not catch this — only measuring the finding set did.

### Keyboard model

Adapted from Grammarly's, which is the part of their interface worth keeping —
but bound to a permanent region rather than a floating card.

| Key | Action |
|---|---|
| `ArrowDown` / `ArrowUp` | Move between findings (roving tabindex) |
| `Home` / `End` | First / last finding |
| `Enter` | Apply the fix, when one exists |
| `Escape` | Dismiss the focused finding |
| `Tab` | Through each card and its buttons in order |

### What the arrow keys are, and are not

**The arrow keys are a sighted-keyboard convenience, not the assistive-technology
mechanism.** This distinction was initially got wrong here and is worth stating
plainly, because it is the difference between the list actually being canonical
and merely claiming to be.

NVDA and JAWS intercept the arrow keys in browse mode to read the document.
`role="list"` is not a composite widget, so it does not trigger focus mode, and
a handler bound to arrow keys on the list will simply never fire for those
users. A design that *depended* on arrow keys would therefore be unreachable
for exactly the audience this product exists to serve.

So the list is deliberately **not** a focus-trapping composite widget:

- Every card carries an `<h3>`, so screen reader users navigate findings with
  their heading commands (`H` / `1`-`6`) — the idiomatic and robust path.
- Every action is a real `<button>` reachable by `Tab`, in DOM order. There are
  several tab stops per card, and that is correct: a roving tabindex that hid
  the buttons from `Tab` would trade a real capability for a tidier count.
- Arrow keys, `Home`/`End`, `Enter` and `Escape` layer on top for sighted
  keyboard users, who are not in browse mode and for whom they do fire.

`F6` region cycling is **specified but not yet implemented** — it belongs to the
application shell, which does not exist. Tracked in the
[known gaps](./accessibility-standard.md#known-gaps).

### Announcements

Every accept and dismiss goes through `LiveAnnouncer` and states the outcome
*and* what remains:

> "Applied fix for Image has no alternative text. 4 findings remaining."

When the automated queue empties, the announcement does **not** say done:

> "No automated findings left. 3 still need your review."

---

## Layer 2 — the inline underline (enhancement)

A ProseMirror inline decoration. Derived from plugin state, never written into
the document, so a finding can never corrupt the user's prose or pollute undo
history.

**Severity is carried by underline shape.** Colour is applied separately, in the
stylesheet, and removing it degrades the underline to shape rather than to
nothing.

| Severity | `text-decoration-style` | Glyph | Label | Meaning |
|---|---|---|---|---|
| `blocker` | `double` (2px) | octagon | "Blocks access" | Fails Level A |
| `violation` | `wavy` | triangle | "Fails AA" | Fails Level AA |
| `advisory` | `dotted` | circle-i | "Advisory" | AAA / best practice |
| `manual` | `dashed` | diamond-? | "Needs your call" | Not machine-decidable |

Four native decoration styles, distinguishable in greyscale, in forced-colors
mode, and under every form of colour-vision deficiency.

Rules for this layer:

- **No action lives only here.** If it is not also in the list, it does not exist.
- **Hovering never triggers anything.** Hover is not available to keyboard or
  touch users, and a hover-triggered card is a
  [SC 1.4.13](https://www.w3.org/TR/WCAG22/#content-on-hover-or-focus) problem.
- **Focusing a card reveals the range but does not move focus into the editor.**
  Focus follows the user's intent, never the tool's.
- `title` on the decoration is supplementary. A tooltip is not an accessible name.

---

## Layer 3 — the document summary

A count by severity. It is a summary, not a verdict.

```
2 blocking · 5 failing AA · 3 advisory · 4 need your review
```

**It never renders a compliance verdict.** No green badge, no "ADA compliant,"
no percentage score. The `manual` count is always shown, and shown *last* so it
is the number the eye rests on — because it is the number that determines
whether the document is actually finished.

---

## Why this inverts Grammarly

Grammarly puts the floating card first and the list second. Two reasons that is
the wrong way round here:

1. **Reachability.** There is no broadly supported ARIA mechanism for an
   arbitrary inline annotation. `aria-invalid` covers only `spelling` and
   `grammar`, support for those is partial, and neither generalises to an
   accessibility finding. An interface built on inline annotation is an
   interface some users cannot reach.
2. **Obscuring.** A card anchored near the caret can overlap the text it
   describes — the failure SC 2.4.11 exists to prevent. A fixed region cannot.

Detail in [the audit, §5](../audit/grammarly-ux-audit.md#5-inline-annotation-has-no-reliable-assistive-technology-mechanism--adapt-this-is-the-big-one).
