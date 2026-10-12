# .docx import fixtures

`library-hours.source.html` is written for this project. The three `.docx`
files are that one source converted by three different producers, so the
importer is tested against the XML real tools write, not only against XML
written by hand in the tests:

| File | Producer | Command |
|---|---|---|
| `library-hours.pandoc.docx` | pandoc 3 | `pandoc library-hours.source.html -o library-hours.pandoc.docx` |
| `library-hours.libreoffice.docx` | LibreOffice 26.2 | the pandoc file re-saved: `soffice --headless --convert-to 'docx:MS Word 2007 XML'` |
| `library-hours.textedit.docx` | macOS TextEdit (`textutil`) | `textutil -convert docx library-hours.source.html` |

The TextEdit file is deliberately the inaccessible one. It writes headings as
bold text and lists as typed bullets, and the importer must keep it that way.

The source references a `chart.png` (a 40×20 grey PNG) that isn't committed;
any small PNG works. LibreOffice links rather than embeds images from HTML,
which writes an absolute local path into the file, so its fixture is the pandoc
file re-saved instead. Before committing a regenerated fixture, check that
`docProps/` holds no author name or local path.

Hostile inputs (zip bombs, DTDs, forged sizes, Strict OOXML) are built inside
`scripts/verify-rules.mjs`, not stored here.

## `benchmark/`: the engine benchmark's planted files

The answer key for [the engine benchmark](../../docs/audit/engine-benchmark-2026-10.md):

| File | What it holds |
|---|---|
| `benchmark-bad.docx` | All 29 rows except 7 and 30, each planted once |
| `benchmark-good.docx` | The same text, every row fixed |
| `benchmark-row07-title.docx` | Row 7: no heading, Title property "Document1" |
| `benchmark-row30-language.docx` | Row 30: a Spanish document set to English (US) |

Word made every one of them: Word for Mac 16.113.4 (26100421) ran
`build-packs.bas` on October 12, 2026, with the pictures in `images/`.
To rebuild, import the macro into Word's Visual Basic Editor and run `BuildAll`.
Word strips the author on save, but check `docProps/` before committing anyway.

Don't run Ada Editor on these files until Word's checker has run on them and
its results are recorded. The brief registered that order.
