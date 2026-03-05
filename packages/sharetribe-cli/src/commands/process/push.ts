/**
 * Process push command
 */

import { pushProcess as sdkPushProcess } from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Reads email templates from the templates directory
 */
function readTemplates(path: string): Array<{ name: string; html: string; subject: string }> {
  const templatesDir = join(path, 'templates');
  const templates: Array<{ name: string; html: string; subject: string }> = [];

  try {
    const templateDirs = readdirSync(templatesDir);
    for (const templateName of templateDirs) {
      const templatePath = join(templatesDir, templateName);
      const htmlFile = join(templatePath, `${templateName}-html.html`);
      const subjectFile = join(templatePath, `${templateName}-subject.txt`);

      try {
        const html = readFileSync(htmlFile, 'utf-8');
        const subject = readFileSync(subjectFile, 'utf-8');
        templates.push({ name: templateName, html, subject });
      } catch {
        // Skip if files don't exist
      }
    }
  } catch {
    // No templates directory - return empty array
  }

  return templates;
}

/**
 * Pushes a new version of an existing process
 */
export async function pushProcess(
  marketplace: string,
  processName: string,
  path: string
): Promise<void> {
  try {
    const processFilePath = join(path, 'process.edn');
    const processContent = readFileSync(processFilePath, 'utf-8');
    const templates = readTemplates(path);

    const result = await sdkPushProcess(undefined, marketplace, processName, processContent, templates);

    if (result.noChanges) {
      console.log('No changes');
    } else {
      printSuccess(`Version ${result.version} successfully saved for process ${processName}.`);
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
