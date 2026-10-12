# Public templates

The agenda and minutes templates offered at
[adaedit.com/guides/accessible-agenda-minutes-templates](https://www.adaedit.com/guides/accessible-agenda-minutes-templates)
are written here as HTML and converted to Word with LibreOffice:

| Source | Served file |
|---|---|
| `agenda.source.html` | `public/templates/accessible-meeting-agenda-template.docx` |
| `minutes.source.html` | `public/templates/accessible-meeting-minutes-template.docx` |

```bash
soffice --headless --convert-to 'docx:MS Word 2007 XML' --outdir /tmp/templates templates/agenda.source.html templates/minutes.source.html
```

Then copy each output over its served file. LibreOffice, not pandoc: pandoc
writes the HTML `<title>` as a Title paragraph above the real Heading 1, so
the document would have two top-level headings. LibreOffice writes the title to
the document properties instead, marks table header rows, and puts a table's
`<caption>` in a paragraph just above it.

`scripts/verify-rules.mjs` imports both files with Ada Editor's own importer and
fails if either loses its title, its single h1, its real lists or its table
header rows, or raises any finding. Before committing a rebuilt file, check
that `docProps/` holds no author name or local path, as for `corpus/docx/`.

Placeholders are in square brackets. Never use typed underscores for blanks:
the checker flags them, and a screen reader reads them out as underscores.
