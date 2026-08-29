/**
 * Process push command
 */

import { pushProcess as sdkPushProcess } from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import {
  ensureProcessDir,
  ensureTemplates,
  processFilePath,
  readTemplates,
} from '../../util/process-files.js';
import { readFileSync } from 'node:fs';

/**
 * Pushes a new version of an existing process
 */
export async function pushProcess(
  marketplace: string,
  processName: string,
  path: string
): Promise<void> {
  try {
    ensureProcessDir(path);

    const definition = readFileSync(processFilePath(path), 'utf-8');
    const templates = readTemplates(path);
    ensureTemplates(path, templates);

    const result = await sdkPushProcess(undefined, marketplace, processName, definition, templates);

    if (result.noChanges) {
      console.log('No changes');
    } else {
      printSuccess(`Version ${result.version} successfully saved for process ${processName}`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to push process');
    }
    process.exitCode = 1; return;
  }
}
