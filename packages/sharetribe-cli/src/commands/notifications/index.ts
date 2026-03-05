/**
 * Notifications commands - manage email notifications
 */

import { Command } from 'commander';
import {
  sendNotification as sdkSendNotification,
  previewNotification as sdkPreviewNotification,
} from 'sharetribe-flex-build-sdk';
import { printError } from '../../util/output.js';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';


/**
 * Reads a notification template from a directory
 */
function readTemplate(templatePath: string): { html: string; subject: string } {
  if (!existsSync(templatePath) || !statSync(templatePath).isDirectory()) {
    throw new Error(`Template directory not found: ${templatePath}`);
  }

  const htmlPath = join(templatePath, 'template.html');
  const subjectPath = join(templatePath, 'template-subject.txt');

  if (!existsSync(htmlPath)) {
    throw new Error(`template.html not found in ${templatePath}`);
  }

  if (!existsSync(subjectPath)) {
    throw new Error(`template-subject.txt not found in ${templatePath}`);
  }

  const html = readFileSync(htmlPath, 'utf-8');
  const subject = readFileSync(subjectPath, 'utf-8').trim();

  return { html, subject };
}

/**
 * Reads template context JSON file
 */
function readContext(contextPath?: string): unknown {
  if (!contextPath) {
    return undefined;
  }

  if (!existsSync(contextPath)) {
    throw new Error(`Context file not found: ${contextPath}`);
  }

  const content = readFileSync(contextPath, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in context file: ${error}`);
  }
}

/**
 * Sends a preview email to the marketplace admin
 */
async function sendNotification(
  marketplace: string,
  templatePath: string,
  contextPath?: string
): Promise<void> {
  try {
    const template = readTemplate(templatePath);
    const context = readContext(contextPath);

    const result = await sdkSendNotification(undefined, marketplace, { template, context });

    console.log(`Preview successfully sent to ${result.adminEmail}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to send notification');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Previews a notification in the browser
 */
async function previewNotification(
  marketplace: string,
  templatePath: string,
  contextPath?: string
): Promise<void> {
  try {
    const template = readTemplate(templatePath);
    const context = readContext(contextPath);

    console.log(`Template: ${templatePath}`);
    console.log(`Subject: ${template.subject}`);
    console.log('');
    console.log('Starting preview server at http://localhost:3535');
    console.log('Press Ctrl+C to stop');
    console.log('');

    let previewHtml: string | null = null;

    // Fetch preview from API
    const fetchPreview = async () => {
      try {
        const result = await sdkPreviewNotification(undefined, marketplace, { template, context });

        // Inject title into HTML
        const html = result.html;
        const titleTag = `<title>${template.subject}</title>`;

        if (html.includes('<head>')) {
          previewHtml = html.replace('<head>', `<head>\n${titleTag}`);
        } else if (html.includes('<html>')) {
          previewHtml = html.replace('<html>', `<html>\n<head>${titleTag}</head>`);
        } else {
          previewHtml = `<html><head>${titleTag}</head><body>${html}</body></html>`;
        }
      } catch (error) {
        const errorMessage = error && typeof error === 'object' && 'message' in error
          ? (error.message as string)
          : 'Failed to preview notification';

        previewHtml = `
          <html>
            <head><title>Error</title></head>
            <body style="font-family: sans-serif; padding: 20px;">
              <h1 style="color: #d32f2f;">Error</h1>
              <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px;">${errorMessage}</pre>
            </body>
          </html>
        `;
      }
    };

    // Initial fetch
    await fetchPreview();

    // Create HTTP server
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === '/' || req.url === '') {
        // Refresh preview on each request
        await fetchPreview();

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(previewHtml);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    server.listen(3535, () => {
      console.log('Preview server started. Open http://localhost:3535 in your browser.');
    });

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('\nShutting down preview server...');
      server.close(() => {
        process.exitCode = 0; return;
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to preview notification');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Registers notifications commands
 */
export function registerNotificationsCommands(program: Command): void {
  const notificationsCmd = program
    .command('notifications')
    .description('manage email notifications');

  // notifications preview
  notificationsCmd
    .command('preview')
    .description('render a preview of an email template')
    .requiredOption('--template <TEMPLATE_DIR>', 'path to template directory')
    .option('--context <CONTEXT_FILE>', 'path to email rendering context JSON file')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await previewNotification(marketplace, opts.template, opts.context);
    });

  // notifications send
  notificationsCmd
    .command('send')
    .description('send a preview of an email template to the logged in admin')
    .requiredOption('--template <TEMPLATE_DIR>', 'path to template directory')
    .option('--context <CONTEXT_FILE>', 'path to email rendering context JSON file')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await sendNotification(marketplace, opts.template, opts.context);
    });
}
