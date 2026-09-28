import type { Node as PMNode } from 'prosemirror-model';
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
