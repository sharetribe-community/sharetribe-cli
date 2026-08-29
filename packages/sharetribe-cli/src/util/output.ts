/**
 * Output formatting utilities
 *
 * Must match flex-cli output format exactly
 */

import chalk from 'chalk';

/**
 * Prints a table with headers and rows
 *
 * Matches flex-cli table formatting exactly
 */
export function printTable(headers: string[], rows: Array<Record<string, string>>): void {
  if (rows.length === 0) {
    return;
  }

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
  const headerParts = headers.map((h, i) => {
    const width = widths[h] || 0;
    const padded = h.padEnd(width + 1);
    return i === headers.length - 1 ? padded : padded + ' ';
  });
  const headerRow = headerParts.join('');
  console.log(chalk.bold.black(headerRow));

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
}

/**
 * Prints an error message
 */
export function printError(message: string): void {
  console.error(chalk.red(`Error: ${message}`));
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
