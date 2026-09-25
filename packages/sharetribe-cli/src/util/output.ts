/**
 * Output formatting utilities
 *
 * Must match flex-cli output format exactly
 */

import chalk from 'chalk';

/** Column width per header, as flex-cli's print-table returns for a continuation */
export type ColumnWidths = Record<string, number>;

/**
 * Derives the columns from the first row, as flex-cli's print-table does when
 * called without an explicit column list
 *
 * flex-cli has two arities and they differ on an empty result: given columns it
 * prints the header, and without them it derives them from `(first rows)`, which
 * is nil, so it prints a table of no columns and therefore no header. Callers
 * that match the ks-less arity go through here so the difference stays visible
 * where it matters.
 *
 * @param rows - Rows keyed by header; an empty set yields no columns
 */
export function columnsFromRows(rows: Array<Record<string, string>>): string[] {
  return Object.keys(rows[0] ?? {});
}

/**
 * Prints a table with headers and rows
 *
 * Matches flex-cli table formatting exactly. An empty row set still prints the
 * header, as flex-cli's print-table does: it takes the column width from the
 * header alone when no row is wider.
 *
 * @param headers - Column headers, in order
 * @param rows - Rows keyed by header
 * @returns The column widths, to pass to printTableContinuation
 */
export function printTable(headers: string[], rows: Array<Record<string, string>>): ColumnWidths {
  // Calculate column widths
  // flex-cli uses keywords (e.g., :version) which when stringified include the ':' prefix
  // To match flex-cli widths, we add 1 to header length to simulate the ':' prefix
  const widths: Record<string, number> = {};
  for (const header of headers) {
    widths[header] = header.length + 1;  // +1 to match flex-cli keyword string behavior
  }

  for (const row of rows) {
    for (const header of headers) {
      const value = row[header] || '';
      widths[header] = Math.max(widths[header] || 0, value.length);
    }
  }

  // Print empty line before table (like flex-cli)
  console.log('');

  // Print header with bold formatting
  // flex-cli format: each column padded to (max_width + 1), with single space separator between columns
  // Last column: padding but no separator (interpose doesn't add separator after last element)
  // flex-cli styles each title on its own and pads outside the escapes, so the
  // padding between columns carries no colour. Styling the whole row instead
  // would print the same characters but different bytes.
  const headerParts = headers.map((h, i) => {
    const width = widths[h] || 0;
    const padded = chalk.bold.black(h) + ' '.repeat(Math.max(0, width + 1 - h.length));
    return i === headers.length - 1 ? padded : padded + ' ';
  });
  console.log(headerParts.join(''));

  // Print rows with same formatting
  for (const row of rows) {
    const rowParts = headers.map((h, i) => {
      const value = row[h] || '';
      const width = widths[h] || 0;
      const padded = value.padEnd(width + 1);
      return i === headers.length - 1 ? padded : padded + ' ';
    });
    const rowStr = rowParts.join('');
    console.log(rowStr);
  }

  // Print empty line after table (like flex-cli)
  console.log('');

  return widths;
}

/**
 * Prints more rows under a table printed earlier
 *
 * Reproduces flex-cli's print-table-continuation: no header, no surrounding
 * blank lines, and the column widths of the first batch, so a live tail keeps
 * its columns aligned without repeating the header. An empty row set prints
 * nothing.
 *
 * @param headers - Column headers, in order, to order the columns
 * @param widths - Column widths returned by the printTable call that printed the header
 * @param rows - Rows keyed by header
 */
export function printTableContinuation(
  headers: string[],
  widths: ColumnWidths,
  rows: Array<Record<string, string>>
): void {
  for (const row of rows) {
    const rowParts = headers.map((h, i) => {
      const value = row[h] || '';
      const width = widths[h] || 0;
      const padded = value.padEnd(width + 1);
      return i === headers.length - 1 ? padded : padded + ' ';
    });
    console.log(rowParts.join(''));
  }
}

/**
 * Prints an error message
 */
export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
}

/** Single right-pointing angle quotation mark, flex-cli's error-page bullet */
const ERROR_ARROW = '›';

/**
 * Builds one error-page line: a space, the bold red arrow, then the text
 *
 * The text carries its own leading spacing, as flex-cli's own error-page
 * fragments do, so a nested line can indent further than the section it hangs
 * under.
 *
 * @param text - Everything that follows the arrow, including its leading space
 */
export function errorPageLine(text: string): string {
  return ` ${chalk.bold.red(ERROR_ARROW)}${text}`;
}

/**
 * Prints flex-cli's error page to stderr
 *
 * Every line is prefixed with a bold red arrow, sections are separated by an
 * arrow-only line, and the page ends with two blank lines. Reproduced from
 * flex-cli's error-page (api/client.cljs) so a failed API call writes the same
 * bytes we do.
 *
 * A section may carry embedded newlines, which are written through untouched:
 * flex-cli re-prefixes only the first line of a section, so any further line
 * has to supply its own arrow through errorPageLine.
 *
 * @param sections - Sections of the page, each without its trailing newline
 */
export function printErrorPage(sections: string[]): void {
  const page = sections.map(section => `${errorPageLine(` ${section}`)}\n`).join(`${errorPageLine(' ')}\n`);
  process.stderr.write(`${page}\n\n`);
}

/**
 * Prints flex-cli's argument parse error, naming every missing option at once
 *
 * Commander stops at the first missing required option, while flex-cli lists
 * them all in declaration order, so callers collect the missing options by hand
 * and pass them here.
 *
 * @param missing - Option names in declaration order, e.g. ['--path', '--marketplace']
 */
export function printMissingOptions(missing: string[]): void {
  console.error('Could not parse arguments:');
  for (const option of missing) {
    console.error(`${option} is required`);
  }
}

/**
 * Prints a success message
 */
export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

/**
 * Prints a warning message
 *
 * Goes to stderr, as flex-cli's ppd-err does, so that a warning never lands in
 * output a script is capturing: deploy-test.sh compares a push's whole stdout
 * against "No changes".
 */
export function printWarning(message: string): void {
  console.error(chalk.yellow(`Warning: ${message}`));
}
