/**
 * Combined process command - create-or-push-and-create-or-update-alias
 *
 * Composes the SDK's endpoint primitives rather than calling a high-level SDK
 * helper: the SDK is a one-function-per-endpoint surface, and this workflow is
 * the CLI's own.
 */

import {
  createAlias,
  createProcess,
  listProcessVersions,
  pushProcess,
  updateAlias,
  type ProcessVersion,
} from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import {
  ensureProcessDir,
  ensureTemplates,
  processFilePath,
  readTemplates,
} from '../../util/process-files.js';
import { readFileSync } from 'node:fs';

/**
 * Reads a process's versions, or returns null when the marketplace has no
 * process by that name.
 *
 * This one call decides everything the command branches on: whether the
 * process exists at all, and, because aliases sit on the versions they point
 * at, whether the alias already exists. Catching a create or a push failure
 * would not, since getProcess cannot tell "no such process" from "no such
 * alias".
 */
async function readVersions(
  marketplace: string,
  processName: string
): Promise<ProcessVersion[] | null> {
  try {
    return await listProcessVersions(undefined, marketplace, processName);
  } catch (error) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'tx-process-not-found') {
      return null;
    }
    throw error;
  }
}

/**
 * Creates or pushes a process and creates or updates an alias
 *
 * Prints exactly what the equivalent flex-cli commands print for each step it
 * performs, so scripts that grep the output of process create, process push
 * and the alias commands read this command's output the same way.
 */
export async function createOrPushAndCreateOrUpdateAlias(
  marketplace: string,
  processName: string,
  path: string,
  alias: string
): Promise<void> {
  try {
    ensureProcessDir(path);

    // The file's own text is what gets uploaded. The parse inside
    // ensureTemplates only checks that the notifications' templates are on disk.
    const definition = readFileSync(processFilePath(path), 'utf-8');
    const templates = readTemplates(path);
    ensureTemplates(path, templates);

    const versions = await readVersions(marketplace, processName);

    if (versions === null) {
      const created = await createProcess(
        undefined,
        marketplace,
        processName,
        definition,
        templates
      );
      printSuccess(`Process ${created.name} successfully created.`);

      const aliasResult = await createAlias(
        undefined,
        marketplace,
        processName,
        created.version,
        alias
      );
      printSuccess(
        `Alias ${aliasResult.alias} successfully created to point to version ${aliasResult.version}.`
      );
      return;
    }

    const aliasExists = versions.some((v) => v.aliases?.includes(alias));

    const pushed = await pushProcess(
      undefined,
      marketplace,
      processName,
      definition,
      templates
    );

    let version: number;
    if (pushed.noChanges) {
      // Nothing to push means the file already matches the newest version, so
      // that is the version the alias should point at.
      console.log('No changes');
      version = Math.max(...versions.map((v) => v.version));
    } else if (pushed.version === undefined) {
      throw new Error(`The API saved a version of ${processName} but did not say which`);
    } else {
      version = pushed.version;
      printSuccess(`Version ${version} successfully saved for process ${processName}`);
    }

    if (aliasExists) {
      const aliasResult = await updateAlias(undefined, marketplace, processName, version, alias);
      printSuccess(
        `Alias ${aliasResult.alias} successfully updated to point to version ${aliasResult.version}.`
      );
    } else {
      const aliasResult = await createAlias(undefined, marketplace, processName, version, alias);
      printSuccess(
        `Alias ${aliasResult.alias} successfully created to point to version ${aliasResult.version}.`
      );
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
