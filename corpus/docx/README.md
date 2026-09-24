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
