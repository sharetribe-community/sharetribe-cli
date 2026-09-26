/**
 * Login command - interactive API key authentication
 *
 * Matches flex-cli's login (src/sharetribe/flex_cli/commands/login.cljs):
 * - Prompt for the API key on stderr, input hidden
 * - Verify it against /current_admin/show before storing anything
 * - Store in flex-cli's auth.edn (XDG_CONFIG_HOME, %LOCALAPPDATA% on Windows, else ~/.config)
 * - Greet the admin the key belongs to
 */

import inquirer from 'inquirer';
import { writeAuth, getCurrentAdmin, type ApiError } from 'sharetribe-flex-build-sdk';
import { printApiError, CURRENT_ADMIN_PATH } from '../util/api-error.js';
import { printError } from '../util/output.js';

/**
 * Tells an API error thrown by the SDK from any other failure
 */
function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'status' in error && 'code' in error;
}

/**
 * Executes the login command
 *
 * The key is verified before it is written, so a rejected key leaves any
 * previously stored key untouched. flex-cli prompts through an inquirer module
 * bound to stderr, so that a future command which prompts and then writes to
 * stdout can still be piped, and it sets no mask, so the key is not echoed at
 * all.
 */
export async function login(): Promise<void> {
  const prompt = inquirer.createPromptModule({ output: process.stderr });
  const answers = await prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'API key',
    },
  ]);

  const apiKey: string = answers.apiKey;

  let email: string;
  try {
    ({ email } = await getCurrentAdmin(apiKey));
  } catch (error) {
    if (isApiError(error)) {
      printApiError(
        { status: error.status, path: CURRENT_ADMIN_PATH, title: error.title, originalText: error.body },
        '',
        apiKey
      );
      process.exitCode = 1;
      return;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to log in');
    }
    process.exitCode = 1;
    return;
  }

  writeAuth({ apiKey });
  console.log(`Hello ${email}!`);
}
