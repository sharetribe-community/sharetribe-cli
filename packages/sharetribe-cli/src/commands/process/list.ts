/**
 * Process list command - lists all transaction processes
 */

import {
  listProcesses as sdkListProcesses,
  listProcessVersions as sdkListProcessVersions,
} from 'sharetribe-flex-build-sdk';
import { printTable, columnsFromRows, printError } from '../../util/output.js';


/**
 * Formats timestamp to match flex-cli format for process list
 */
function formatProcessTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const timeString = date.toLocaleTimeString('en-US');

    return `${year}-${month}-${day} ${timeString}`;
  } catch {
    return timestamp;
  }
}

/**
 * Lists all processes for a marketplace
 */
export async function listProcesses(marketplace: string, processName?: string): Promise<void> {
  try {
    // If processName is specified, show version history for that process
    if (processName) {
      const versions = await sdkListProcessVersions(undefined, marketplace, processName);

      const versionRows = versions.map((v) => ({
        'Created': formatProcessTimestamp(v.createdAt),
        'Version': v.version.toString(),
        'Aliases': v.aliases?.join(', ') || '',
        'Transactions': v.transactionCount?.toString() || '0',
      }));

      // flex-cli calls print-table without a column list here, so an empty
      // version list prints a table of no columns rather than a header.
      printTable(columnsFromRows(versionRows), versionRows);
    } else {
      // List all processes
      const processes = await sdkListProcesses(undefined, marketplace);

      const processRows = processes.map((p) => ({
        'Name': p.name,
        'Latest version': p.version?.toString() || '',
      }));

      printTable(columnsFromRows(processRows), processRows);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to list processes');
    }
    process.exitCode = 1; return;
  }
}
