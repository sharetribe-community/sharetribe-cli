/**
 * Process list command - lists all transaction processes
 */

import {
  listProcesses as sdkListProcesses,
  listProcessVersions as sdkListProcessVersions,
} from 'sharetribe-flex-build-sdk';
import { printTable, printError } from '../../util/output.js';


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

      if (versions.length === 0) {
        console.log(`No versions found for process: ${processName}`);
        return;
      }

      const versionRows = versions.map((v) => ({
        'Created': formatProcessTimestamp(v.createdAt),
        'Version': v.version.toString(),
        'Aliases': v.aliases?.join(', ') || '',
        'Transactions': v.transactionCount?.toString() || '0',
      }));

      printTable(['Created', 'Version', 'Aliases', 'Transactions'], versionRows);
    } else {
      // List all processes
      const processes = await sdkListProcesses(undefined, marketplace);

      if (processes.length === 0) {
        console.log('No processes found.');
        return;
      }

      const processRows = processes.map((p) => ({
        'Name': p.name,
        'Latest version': p.version?.toString() || '',
      }));

      printTable(['Name', 'Latest version'], processRows);
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
