/**
 * Login command - interactive API key authentication
 *
 * Must match flex-cli behavior exactly:
 * - Prompt for API key
 * - Store in flex-cli's auth.edn (XDG_CONFIG_HOME, %LOCALAPPDATA% on Windows, else ~/.config)
 * - Display admin email on success
 */

import inquirer from 'inquirer';
import { writeAuth } from 'sharetribe-flex-build-sdk';

/**
 * Executes the login command
 *
 * Prompts for API key and stores it in auth.edn
 */
export async function login(): Promise<void> {
  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter API key:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key cannot be empty';
        }
        return true;
      },
    },
  ]);

  // Store the API key
  writeAuth({ apiKey: answers.apiKey });

  // TODO: Validate API key by making a test request to get admin email
  // For now, just confirm storage
  console.log('Successfully logged in.');

  // Note: flex-cli displays admin email after successful login
  // We'll need to implement API client to fetch this
}
