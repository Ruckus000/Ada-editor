# Decision 5: plot and grading plans

October 13, 2026. This is the second rule change put through
[decision 5](../engine-benchmark-2026-10.md#5-from-now-on-a-rule-has-to-earn-its-place).
The first was [layout tables](decision-5-table-layout.md).

## The verdict

**It doesn't ship.** It fails the first test: no pack row moves. It passes
the second, by construction. The rule is "a change that moves nothing
doesn't ship, however good the idea".

## The proposed change

On 2026-10-12 the owner asked that alt text naming a plot plan (a
residential site plan) or a grading plan (the civil sheet with contours and
drainage) be asked about, as site and floor plans already are. That way the
writer is asked whether the image needs a long description
(`img-long-description`). It was held on a branch until the packs had run.

It's kept here in full, so the branch can go. In `COMPLEX_IMAGE`
(`app/_engine/textHelpers.ts`), this:

```
site[\s-]*plan|floor[\s-]*plan
```

becomes this:

```
(site|floor|plot|grading)[\s-]*plan
```

The change also adds these cases to `verify-rules.mjs`, among the alt texts
the rule fires on: `'Plot plan for 22 Oak Lane'` and
`'Grading plan, sheet C-3'`.

## The run

- **The engine:** main at 6650a82, with the regex change applied, run with
  [`scripts/benchmark-ada.mjs`](../../../scripts/benchmark-ada.mjs) on the
  four pack files.
- **The output** is byte for byte the same as main's,
  [`ada-table-layout.json`](ada-table-layout.json). Main's engine hasn't
  changed since that file was made.
- **The regex does what it says.** It fires on "Plot plan for 22 Oak Lane",
  "Grading plan, sheet C-3" and "plot-plan". It stays quiet on "lesson
  plan", "open floor plan", "a plot of land" and "road grading begins".

**Test 1 fails.** No picture in either pack has alt text that names a plot
or grading plan, so there's nothing for the change to catch.

**Test 2 holds.** `img-long-description` only ever asks, so the change
can't add an assertion anywhere, the six clean documents included.

## Why no row could move, and why one isn't added

- **The answer key leaves out F67,** a long description that doesn't match
  the image, because Word has no field for a long description. No other W3C
  failure technique describes a complex picture with only short alt text in
  a way a row could plant.
- **Adding a row so our own change passes would undo decision 1:** the key
  comes from W3C's list, not from us.
- **The corpus** has neither word, so the parity gate's three firings of
  this rule wouldn't change either.

The rule's own comment on main already sets the bar for a new kind: add it
"when a packet's alt text names it and goes unasked". No alt text like that
has been seen.

## What would bring it back

- **A real packet** whose alt text names a plot or grading plan and goes
  unasked. That's the rule's own condition. It could come from the six
  documents once the owner confirms them, or from a correction someone
  files.
- **The owner adding F67 to the key** through the brief's "What would
  change this". That's a change to the benchmark, not to this rule.

## Found along the way: `img-long-description` itself

In [the pack results](results-packs.md), `img-long-description` caught no
row: row 5's "Chart" was caught by `img-alt-suspicious`. It fired once, on
the good twin, to ask whether a chart needs a long description when its
alt text already gives the data.

Decision 5's last paragraph lists a rule that catches no row and only asks
on clean documents as **a candidate for deletion**, not to be deleted
automatically. That makes `img-long-description` a candidate, provisionally:
the six clean documents (P5 and P6) haven't run, and they decide whether
the cost is real. Nothing changes until then.

The same gap explains both findings. The key can't measure long
descriptions, so neither this rule nor any change to it can earn its place
in the benchmark as it stands.
