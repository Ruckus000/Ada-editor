# Decorative images, October 2026

**The question:** the alt text dialog told people to "leave it empty only if the image is purely decorative". Should Ada Editor let an image be marked decorative, or should the dialog stop suggesting it?

**What I looked at:**
- The dialog (`app/_editor/dialogs.tsx`) and the empty desk's "how it works" list (`app/_home/Home.tsx`), which gave "is this image decorative?" as a question the checker leaves for you.
- The checker. An empty alt is always `img-alt-missing`, a blocker: for figures in `app/_engine/rules.ts`, and for header and footer images in `app/_editor/findings.ts`. The schema (`app/_editor/editorSchema.ts`) has no decorative marker, and no rule asks whether an image is decorative.
- The exports. HTML writes no `alt` attribute at all for an empty alt (`app/_editor/exportHtml.ts`), on purpose, so the page is exactly as unlabelled as the checker said. The PDF has no Artifact path for figures (`app/_editor/exportPdf.ts`). Help says "an image without alt text is exported without it".
- Word import (`app/_import/importDocx.ts`), which leaves out images Word marks decorative and says so in a note. The README already lists decorative images among what "the editor can't hold yet".
- W3C's [alt decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/): a decorative image takes an empty `alt` attribute, which is not the same as no `alt` attribute.

## The one-line verdict

**There is no decorative marking. The dialog now says that a decorative image should be deleted, because every image you keep needs a description, and that is what the checker and the exports already do.**

## Decisions

### Fix the copy, not the engine

Someone who followed the old advice got a blocking finding, and an export with no `alt` attribute, where a screen reader may read out the file name. Two fixes would make the product agree with itself:

1. Change the words to match the behaviour (this change: two strings).
2. Build decorative marking. That means an attribute on figures and header and footer images, a control in the dialog, the checker skipping alt rules, `alt=""` in HTML, an Artifact in the PDF, Word import keeping decorative images, migrating saved documents, and tests in four gates.

I chose the first. Word import, the README and the checker already made this call, and only the dialog disagreed. Deleting a decorative image loses nothing for anyone: a sighted reader loses an ornament, and a screen-reader user hears the same thing either way. Agendas, notices and minutes, the documents the editor is for, rarely carry ornaments.

The empty desk's example question is now "does this alt text describe the image?". The checker really does ask that (`img-alt-suspicious`), and the Help page already gives it as its example.

**What would change it:** a clerk who needs to keep an ornament, such as a town seal used as a page divider or a letterhead flourish that a template requires. That is the trigger for option 2. Build it in full, because a marker that only reaches some of the places above repeats today's contradiction somewhere else.
