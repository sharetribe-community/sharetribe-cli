/**
 * Listing approval command - DEPRECATED
 *
 * This command is deprecated and should not be used.
 * Use the Sharetribe Console instead.
 */

import { Command } from 'commander';
import {
  getListingApprovalStatus as sdkGetStatus,
  enableListingApproval as sdkEnable,
  disableListingApproval as sdkDisable,
} from 'sharetribe-flex-build-sdk';
import { printError } from '../util/output.js';

/**
 * Gets current listing approval status
 */
async function getStatus(marketplace: string): Promise<void> {
  try {
    const result = await sdkGetStatus(undefined, marketplace);

    if (result.enabled) {
      console.log(`Listing approvals are enabled in ${marketplace}`);
    } else {
      console.log(`Listing approvals are disabled in ${marketplace}`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to get listing approval status');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Enables listing approvals
 */
async function enableApprovals(marketplace: string): Promise<void> {
  try {
    await sdkEnable(undefined, marketplace);
    console.log(`Successfully enabled listing approvals in ${marketplace}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to enable listing approvals');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Disables listing approvals
 */
async function disableApprovals(marketplace: string): Promise<void> {
  try {
    await sdkDisable(undefined, marketplace);
    console.log(`Successfully disabled listing approvals in ${marketplace}`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to disable listing approvals');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Registers listing-approval command
 */
export function registerListingApprovalCommand(program: Command): void {
  const cmd = program
    .command('listing-approval')
    .description('manage listing approvals (DEPRECATED - use Console instead)')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier');

  // Default action - show status
  cmd.action(async (opts) => {
    console.warn('Warning: CLI command `listing-approval` is deprecated. Use Console instead.');
    const marketplace = opts.marketplace || program.opts().marketplace;
    if (!marketplace) {
      console.error('Error: --marketplace is required');
      process.exitCode = 1; return;
    }
    await getStatus(marketplace);
  });

  // Enable subcommand
  cmd
    .command('enable')
    .description('enable listing approvals')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      console.warn('Warning: CLI command `listing-approval` is deprecated. Use Console instead.');
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await enableApprovals(marketplace);
    });

  // Disable subcommand
  cmd
    .command('disable')
    .description('disable listing approvals')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      console.warn('Warning: CLI command `listing-approval` is deprecated. Use Console instead.');
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await disableApprovals(marketplace);
    });
}
