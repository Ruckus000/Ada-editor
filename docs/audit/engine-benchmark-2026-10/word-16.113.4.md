# Word's checker on the benchmark packs (recorded before Ada ran)

- **When:** 2026-10-12, about 20:40 UTC.
- **Word:** Word for Mac 16.113.4 (build 16.113.26100421), via Tools > Check Accessibility. In this build that opens the "Accessibility Assistant" pane.
- **Files:** copies of `corpus/docx/benchmark/*.docx` from main at 0177203, opened as they are. SHA-1 checks after closing show none were changed.
- **Not as the brief specified:**
  - Word's automatic updates weren't touched; the build didn't change during the run.
  - Word displayed pages in dark mode, and switching the page to light couldn't be done in the background. Whether a light page changes the contrast result wasn't tested.
  - The pane has no error, warning or tip levels. Every listed issue is counted as an assertion ("fails").

## benchmark-bad.docx

The pane's categories:
- **Color and Contrast:** Hard-to-read text contrast, ticked.
- **Media and Illustrations:** Missing alt text, **5**.
- **Tables:** Missing table header, ticked; Use of merged or split cells, ticked.
- **Document Structure:** No headings in document, ticked.
- **Document Access:** Restricted access, ticked.

The 5 "Missing alt text" items, in Word's order:
1. The "DRAFT" watermark picture.
2. The photo whose alt text is "IMG_0412.jpg". It's shown pre-filled, with an "Approve" button.
3. The second photo, with no alt text.
4. The divider picture with no alt text.
5. The green logo picture.

## benchmark-good.docx

"Looks good! No issues found." Every category is ticked.

## benchmark-row07-title.docx

"Looks good! No issues found."

## benchmark-row30-language.docx

"Looks good! No issues found."
