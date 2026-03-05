/**
 * Process pull command
 */

import { getProcess } from 'sharetribe-flex-build-sdk';
import { printError, printSuccess } from '../../util/output.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pulls a process from the server
 */
export async function pullProcess(
  marketplace: string,
  processName: string,
  path: string,
  version?: string,
  alias?: string
): Promise<void> {
  try {
    const process = await getProcess(undefined, marketplace, processName, { version, alias });

    if (!process.definition) {
      throw new Error('No process definition in response');
    }

    // Ensure directory exists (print message if creating new directory)
    const { existsSync } = await import('node:fs');
    const dirExists = existsSync(path);
    mkdirSync(path, { recursive: true });

    if (!dirExists) {
      console.error(`Creating a new directory: ${path}`);
    }

    // Write process.edn file
    const processFilePath = join(path, 'process.edn');
    writeFileSync(processFilePath, process.definition, 'utf-8');

    // Write email templates if they exist
    const templates = process.emailTemplates || [];

    if (templates && Array.isArray(templates) && templates.length > 0) {
      const templatesDir = join(path, 'templates');
      mkdirSync(templatesDir, { recursive: true });

      for (const template of templates) {
        const templateName = template.name;
        const htmlContent = template.html;
        const subjectContent = template.subject;

        if (templateName) {
          // Create subdirectory for this template
          const templateSubdir = join(templatesDir, templateName);
          mkdirSync(templateSubdir, { recursive: true });

          // Write HTML file
          if (htmlContent) {
            const htmlPath = join(templateSubdir, `${templateName}-html.html`);
            writeFileSync(htmlPath, htmlContent, 'utf-8');
          }

          // Write subject file
          if (subjectContent) {
            const subjectPath = join(templateSubdir, `${templateName}-subject.txt`);
            writeFileSync(subjectPath, subjectContent, 'utf-8');
          }
        }
      }
    }

    console.error(`Saved process to ${path}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to pull process');
    }
    process.exitCode = 1; return;
  }
}
