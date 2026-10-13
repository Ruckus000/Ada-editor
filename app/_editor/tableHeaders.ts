import type { Node as PMNode } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';
import { collapseSpaces } from '../_engine/textHelpers';

/**
 * What a table's header cells mean, shared by the HTML export, the PDF export
 * and the checker so all three agree. No DOM, no React.
 */

const isHeaderCell = (cell: PMNode) => cell.type.name === 'table_header';

/** Every cell in this row is a header cell. */
export function isHeaderRow(row: PMNode): boolean {
  if (!row.childCount) return false;
  let all = true;
  row.forEach((cell) => { if (!isHeaderCell(cell)) all = false; });
  return all;
}

export function firstRowIsHeader(table: PMNode): boolean {
  return table.childCount > 0 && isHeaderRow(table.child(0));
}

/** The header rows the table leads with: repeated on each PDF page, and the
 *  HTML <thead> when none of them spans into a body row. */
export function leadingHeaderRows(table: PMNode): number {
  let n = 0;
  while (n < table.childCount && isHeaderRow(table.child(n))) n++;
  return n;
}

export function hasHeaderCell(table: PMNode): boolean {
  let found = false;
  table.descendants((node) => {
    if (found) return false;
    if (isHeaderCell(node)) found = true;
    return !node.type.spec.tableRole || node.type.spec.tableRole === 'table' || node.type.spec.tableRole === 'row';
  });
  return found;
}

export function hasMergedCells(table: PMNode): boolean {
  let merged = false;
  table.forEach((row) => row.forEach((cell) => {
    if ((cell.attrs.colspan ?? 1) > 1 || (cell.attrs.rowspan ?? 1) > 1) merged = true;
  }));
  return merged;
}

/**
 * A table that seems to lay text out rather than hold data: at least two cells
 * have text, and every one of them is four words or more. Header labels and
 * data values are short ("Fee", "$40", "Monday"), so one short cell reads as
 * data. Sentences side by side, such as a contact block, read as layout.
 */
export function looksLikeLayout(table: PMNode): boolean {
  let filled = 0;
  let allLong = true;
  table.forEach((row) => row.forEach((cell) => {
    const words = cell.textContent.split(/\s+/).filter(Boolean).length;
    if (!words) return;
    filled++;
    if (words < 4) allLong = false;
  }));
  return filled >= 2 && allLong;
}

/**
 * A form laid out as a grid: labels beside empty cells to fill in, so at least
 * one column is empty in every row. The engine benchmark's D4 (#122) is one:
 * short labels in columns 1 and 3, columns 2 and 4 always empty, and its one
 * wrong claim was "no header cells" on it. Columns are grid columns, so a
 * merged cell counts against every column it covers.
 * ponytail: at least 3 rows with text, so a data table typed one column at a
 * time keeps its blocker until it has a few rows. Cells holding only "___"
 * aren't empty: no table seen has them.
 */
export function looksLikeFormGrid(table: PMNode): boolean {
  const map = TableMap.get(table);
  const empty = (offset: number) => !table.nodeAt(offset)?.textContent.trim();
  let rowsWithText = 0;
  for (let r = 0; r < map.height; r++) {
    let any = false;
    for (let c = 0; c < map.width; c++) if (!empty(map.map[r * map.width + c]!)) any = true;
    if (any) rowsWithText++;
  }
  if (rowsWithText < 3) return false;
  for (let c = 0; c < map.width; c++) {
    let all = true;
    for (let r = 0; r < map.height; r++) if (!empty(map.map[r * map.width + c]!)) { all = false; break; }
    if (all) return true;
  }
  return false;
}

/**
 * The scope a header cell gets: a header row labels the columns below it; a
 * header cell starting a data row labels its row; anything else is taken as a
 * column header. `col` is the cell's grid column (after spans), not its index.
 */
export function headerScope(table: PMNode, rowIndex: number, col: number): 'col' | 'row' {
  if (isHeaderRow(table.child(rowIndex))) return 'col';
  return col === 0 ? 'row' : 'col';
}

/** The table's text, cells separated by spaces: finding snippets and ids. */
export function tableText(table: PMNode): string {
  return collapseSpaces(table.textBetween(0, table.content.size, ' ', ' '));
}
