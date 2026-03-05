/**
 * Combined process command - create-or-push-and-create-or-update-alias
 *
 * This is the enhanced "superset" feature that combines multiple operations
 * into one atomic command
 */

import { deployProcess as sdkDeployProcess, parseProcessFile } from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Creates or pushes a process and creates or updates an alias
 *
 * This is an atomic operation that:
 * 1. Tries to push a new version (create-version)
 * 2. If process doesn't exist, creates it
 * 3. Then creates or updates the alias
 */
export async function createOrPushAndCreateOrUpdateAlias(
  marketplace: string,
  processName: string,
  path: string,
  alias: string
): Promise<void> {
  try {
    const processFilePath = join(path, 'process.edn');
    const processContent = readFileSync(processFilePath, 'utf-8');
    const processDefinition = parseProcessFile(processContent);

    const result = await sdkDeployProcess(
      undefined, // Use auth from file
      marketplace,
      {
        process: processName,
        alias,
        path: processFilePath,
        processDefinition,
      }
    );

    if (result.processCreated) {
      printSuccess(`Process ${processName} successfully created.`);
    }

    printSuccess(`Version ${result.version} successfully saved for process ${processName}.`);

    if (result.aliasCreated) {
      printSuccess(`Alias ${result.alias} successfully created to point to version ${result.version}.`);
    } else {
      printSuccess(`Alias ${result.alias} successfully updated to point to version ${result.version}.`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to create/push process and alias');
    }
    process.exitCode = 1; return;
  }
}
