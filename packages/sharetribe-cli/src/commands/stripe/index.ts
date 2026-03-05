/**
 * Stripe command - manage Stripe integration
 */

import { Command } from 'commander';
import { updateStripeVersion as sdkUpdateStripeVersion, SUPPORTED_STRIPE_VERSIONS } from 'sharetribe-flex-build-sdk';
import { printError } from '../../util/output.js';
import inquirer from 'inquirer';


/**
 * Prompts for version selection
 */
async function promptForVersion(): Promise<string> {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'version',
      message: 'Select Stripe API version:',
      choices: [...SUPPORTED_STRIPE_VERSIONS],
    },
  ]);

  return answers.version;
}

/**
 * Prompts for confirmation
 */
async function promptForConfirmation(): Promise<boolean> {
  console.log('');
  console.log('WARNING: Changing Stripe API version may affect your integration.');
  console.log('');
  console.log('After updating the Stripe API version, you may need to:');
  console.log('- Handle new Capabilities requirements');
  console.log('- Update identity verification settings');
  console.log('');
  console.log('See Stripe documentation for details:');
  console.log('https://stripe.com/docs/connect/capabilities-overview');
  console.log('https://stripe.com/docs/connect/identity-verification');
  console.log('');

  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Do you want to continue?',
      default: false,
    },
  ]);

  return answers.confirmed;
}

/**
 * Updates Stripe API version
 */
async function updateStripeVersion(
  marketplace: string,
  version?: string,
  force?: boolean
): Promise<void> {
  try {
    // Get version if not provided
    let selectedVersion = version;
    if (!selectedVersion) {
      selectedVersion = await promptForVersion();
    }

    // Get confirmation unless --force flag is used
    if (!force) {
      const confirmed = await promptForConfirmation();
      if (!confirmed) {
        console.log('Cancelled.');
        process.exitCode = 0; return;
      }
    }

    // Update via API (SDK validates version)
    await sdkUpdateStripeVersion(undefined, marketplace, selectedVersion);

    console.log(`Stripe API version successfully changed to ${selectedVersion}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to update Stripe API version');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Registers stripe commands
 */
export function registerStripeCommands(program: Command): void {
  const stripeCmd = program.command('stripe').description('manage Stripe integration');

  // stripe update-version
  stripeCmd
    .command('update-version')
    .description('update Stripe API version in use')
    .option('--version <VERSION>', 'Stripe API version to update to')
    .option('-f, --force', 'skip confirmation prompt and force update')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await updateStripeVersion(marketplace, opts.version, opts.force);
    });
}
