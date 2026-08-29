/**
 * Process directory helpers
 *
 * Mirrors what upstream flex-cli does before it uploads a process: locate the
 * process.edn file, read the templates directory, and check that every
 * notification the process declares has a template on disk. Upstream splits
 * this between io-util and process-util; there is little enough of it to keep
 * it in one place here.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseProcessFile, type ProcessTemplate } from 'sharetribe-flex-build-sdk';
import { printWarning } from './output.js';

/**
 * Returns the path of the process.edn file inside a process directory.
 */
export function processFilePath(path: string): string {
  return join(path, 'process.edn');
}

/**
 * Throws unless the given path is a process directory, i.e. one holding a
 * process.edn file. Matches upstream's ensure-process-dir!.
 */
export function ensureProcessDir(path: string): void {
  try {
    if (statSync(processFilePath(path)).isFile()) return;
  } catch {
    // Fall through to the same error a non-file gives.
  }
  throw new Error('--path should be a process directory');
}

/**
 * Reads the email templates that sit under <path>/templates, each in its own
 * directory holding <name>-html.html and <name>-subject.txt.
 */
export function readTemplates(path: string): ProcessTemplate[] {
  const templatesDir = join(path, 'templates');
  const templates: ProcessTemplate[] = [];

  let templateNames: string[];
  try {
    templateNames = readdirSync(templatesDir);
  } catch {
    return templates;
  }

  for (const name of templateNames) {
    const templateDir = join(templatesDir, name);
    try {
      templates.push({
        name,
        html: readFileSync(join(templateDir, `${name}-html.html`), 'utf-8'),
        subject: readFileSync(join(templateDir, `${name}-subject.txt`), 'utf-8'),
      });
    } catch {
      // A directory without both halves is not a template.
    }
  }

  return templates;
}

/**
 * Checks the templates on disk against the notifications the process declares:
 * a notification whose template is missing is an error, a template nothing
 * refers to is a warning. This is the only reason the process file is parsed;
 * what gets uploaded is always the file's own text. Matches upstream's
 * ensure-templates!.
 */
export function ensureTemplates(path: string, templates: ProcessTemplate[]): void {
  const { notifications } = parseProcessFile(processFilePath(path));
  const templateNames = new Set(templates.map((t) => t.name));
  const usedNames = new Set(notifications.map((n) => n.template));

  for (const name of templateNames) {
    if (!usedNames.has(name)) {
      printWarning(`template exists but is not used in the process: ${name}`);
    }
  }

  const missing = notifications.filter((n) => !templateNames.has(n.template));
  if (missing.length > 0) {
    throw new Error(
      missing
        .map((n) => `Template ${n.template} not found for notification ${unqualified(n.name)}`)
        .join('\n')
    );
  }
}

/**
 * Drops a keyword's namespace, so :notification/booking-accepted reads as
 * booking-accepted. parseProcessFile keeps the namespace; flex-cli's error
 * message does not.
 */
function unqualified(keyword: string): string {
  return keyword.slice(keyword.indexOf('/') + 1);
}
