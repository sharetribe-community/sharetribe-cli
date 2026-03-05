/**
 * Process command - main entry point for process subcommands
 */

import { Command } from 'commander';
import { listProcesses } from './list.js';
import { createProcess } from './create.js';
import { pushProcess } from './push.js';
import { pullProcess } from './pull.js';
import { createAlias, updateAlias, deleteAlias } from './aliases.js';
import { createOrPushAndCreateOrUpdateAlias } from './combined.js';

/**
 * Registers all process subcommands
 */
export function registerProcessCommands(program: Command): void {
  // Register the parent 'process' command for help display
  const processCmd = program
    .command('process')
    .description('describe a process file')
    .option('--path <PROCESS_DIR>', 'path to the directory where the process.edn file is')
    .option('--transition <TRANSITION_NAME>', 'transition name, e.g. transition/request to get more details of it')
    .action(async (options) => {
      // Process describe functionality
      if (options.path) {
        console.log(`Describing process at: ${options.path}`);
        if (options.transition) {
          console.log(`Transition: ${options.transition}`);
        }
        // TODO: Implement actual process file parsing and description
        console.log('Process description not yet implemented');
      } else {
        // If no options, show help
        processCmd.outputHelp();
      }
    });

  // Register subcommands - these are registered as BOTH subcommands (for help) and top-level (for routing)

  // process list (as subcommand)
  processCmd
    .command('list')
    .description('list all transaction processes')
    .option('--process <PROCESS_NAME>', 'print version and alias info of a specific process')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await listProcesses(marketplace, options.process);
    });

  // process create
  processCmd
    .command('create')
    .description('create a new transaction process')
    .requiredOption('--process <PROCESS_NAME>', 'name for the new process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path to the directory where the process.edn file is')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await createProcess(marketplace, options.process, options.path);
    });

  // process push
  processCmd
    .command('push')
    .description('push a process file to the remote')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path to the directory where the process.edn file is')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await pushProcess(marketplace, options.process, options.path);
    });

  // process pull
  processCmd
    .command('pull')
    .description('fetch a process file')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path where to save the process')
    .option('--version <VERSION_NUM>', 'version number')
    .option('--alias <PROCESS_ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await pullProcess(marketplace, options.process, options.path, options.version, options.alias);
    });

  // process create-alias
  processCmd
    .command('create-alias')
    .description('create a new alias')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--version <VERSION_NUM>', 'version number')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .allowUnknownOption(false)
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await createAlias(marketplace, options.process, parseInt(options.version), options.alias);
    });

  // process update-alias
  processCmd
    .command('update-alias')
    .description('update an existing alias')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--version <VERSION_NUM>', 'version number')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await updateAlias(marketplace, options.process, parseInt(options.version), options.alias);
    });

  // process delete-alias
  processCmd
    .command('delete-alias')
    .description('delete an existing alias')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await deleteAlias(marketplace, options.process, options.alias);
    });

  // process deploy (combined command: create-or-push-and-create-or-update-alias)
  processCmd
    .command('deploy')
    .description('deploy a process file with alias (create/push + alias create/update)')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path to the directory with the process files')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await createOrPushAndCreateOrUpdateAlias(
        marketplace,
        options.process,
        options.path,
        options.alias
      );
    });

  // Register top-level command aliases for routing (hidden from help)
  // These handle the routed commands like 'process-pull' that avoid Commander's parent/child option conflicts

  program
    .command('process-list', { hidden: true })
    .description('list all transaction processes')
    .option('--process <PROCESS_NAME>', 'print version and alias info of a specific process')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await listProcesses(marketplace, options.process);
    });

  program
    .command('process-create', { hidden: true })
    .description('create a new transaction process')
    .requiredOption('--process <PROCESS_NAME>', 'name for the new process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path to the directory where the process.edn file is')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await createProcess(marketplace, options.process, options.path);
    });

  program
    .command('process-push', { hidden: true })
    .description('push a process file to the remote')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path to the directory where the process.edn file is')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await pushProcess(marketplace, options.process, options.path);
    });

  program
    .command('process-pull', { hidden: true })
    .description('fetch a process file')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path where to save the process')
    .option('--version <VERSION_NUM>', 'version number')
    .option('--alias <PROCESS_ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await pullProcess(marketplace, options.process, options.path, options.version, options.alias);
    });

  program
    .command('process-create-alias', { hidden: true })
    .description('create a new alias')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--version <VERSION_NUM>', 'version number')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await createAlias(marketplace, options.process, parseInt(options.version), options.alias);
    });

  program
    .command('process-update-alias', { hidden: true })
    .description('update an existing alias')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--version <VERSION_NUM>', 'version number')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await updateAlias(marketplace, options.process, parseInt(options.version), options.alias);
    });

  program
    .command('process-delete-alias', { hidden: true })
    .description('delete an existing alias')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await deleteAlias(marketplace, options.process, options.alias);
    });

  program
    .command('process-deploy', { hidden: true })
    .description('deploy a process file with alias (create/push + alias create/update)')
    .requiredOption('--process <PROCESS_NAME>', 'name of the process')
    .requiredOption('--path <LOCAL_PROCESS_DIR>', 'path to the directory with the process files')
    .requiredOption('--alias <ALIAS>', 'alias name')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await createOrPushAndCreateOrUpdateAlias(
        marketplace,
        options.process,
        options.path,
        options.alias
      );
    });
}
