/**
 * Process create command
 */

import { createProcess as sdkCreateProcess } from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Creates a new transaction process
 */
export async function createProcess(
  marketplace: string,
  processName: string,
  path: string
): Promise<void> {
  try {
    const processFilePath = join(path, 'process.edn');
    const processContent = readFileSync(processFilePath, 'utf-8');

    const result = await sdkCreateProcess(undefined, marketplace, processName, processContent);

    printSuccess(
      `Process ${result.name} successfully created with version ${result.version}.`
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to create process');
    }
    process.exitCode = 1; return;
  }
}
