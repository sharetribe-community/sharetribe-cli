/**
 * Process create command
 */

import { createProcess as sdkCreateProcess } from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import {
  ensureProcessDir,
  ensureTemplates,
  processFilePath,
  readTemplates,
} from '../../util/process-files.js';
import { readFileSync } from 'node:fs';

/**
 * Creates a new transaction process
 */
export async function createProcess(
  marketplace: string,
  processName: string,
  path: string
): Promise<void> {
  try {
    ensureProcessDir(path);

    const definition = readFileSync(processFilePath(path), 'utf-8');
    const templates = readTemplates(path);
    ensureTemplates(path, templates);

    const result = await sdkCreateProcess(
      undefined,
      marketplace,
      processName,
      definition,
      templates
    );

    printSuccess(`Process ${result.name} successfully created.`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to create process');
    }
    process.exitCode = 1; return;
  }
}
