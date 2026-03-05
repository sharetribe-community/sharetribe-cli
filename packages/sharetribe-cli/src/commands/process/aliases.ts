/**
 * Process alias commands
 */

import {
  createAlias as sdkCreateAlias,
  updateAlias as sdkUpdateAlias,
  deleteAlias as sdkDeleteAlias
} from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';

/**
 * Creates a process alias
 */
export async function createAlias(
  marketplace: string,
  processName: string,
  version: number,
  alias: string
): Promise<void> {
  try {
    const result = await sdkCreateAlias(undefined, marketplace, processName, version, alias);

    printSuccess(
      `Alias ${result.alias} successfully created to point to version ${result.version}.`
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to create alias');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Updates a process alias
 */
export async function updateAlias(
  marketplace: string,
  processName: string,
  version: number,
  alias: string
): Promise<void> {
  try {
    const result = await sdkUpdateAlias(undefined, marketplace, processName, version, alias);

    printSuccess(
      `Alias ${result.alias} successfully updated to point to version ${result.version}.`
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to update alias');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Deletes a process alias
 */
export async function deleteAlias(
  marketplace: string,
  processName: string,
  alias: string
): Promise<void> {
  try {
    const result = await sdkDeleteAlias(undefined, marketplace, processName, alias);

    printSuccess(`Alias ${result.alias} successfully deleted.`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to delete alias');
    }
    process.exitCode = 1; return;
  }
}
