/**
 * Sharetribe CLI - Unofficial 100% compatible implementation
 *
 * Main entry point for the CLI application
 */

import { Command } from 'commander';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { version } from './commands/version.js';
import { login } from './commands/login.js';
import { logout } from './commands/logout.js';
import { registerProcessCommands } from './commands/process/index.js';
import { registerSearchCommands } from './commands/search/index.js';
import { registerAssetsCommands } from './commands/assets/index.js';
import { registerNotificationsCommands } from './commands/notifications/index.js';
import { registerListingApprovalCommand } from './commands/listing-approval.js';
import { registerEventsCommand } from './commands/events/index.js';
import { registerStripeCommands } from './commands/stripe/index.js';
import { debug } from './commands/debug.js';
import { configureHelp } from './util/help-formatter.js';
import { routeProcessCommand } from './util/command-router.js';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);

// Print unofficial notice to stderr on first run only
const configDir = join(homedir(), '.config', 'flex-cli');
const noticeShownMarker = join(configDir, '.sharetribe-community-cli-notice-shown');
if (!existsSync(noticeShownMarker)) {
  console.error(chalk.yellow('⚠️  NOTICE: This is an UNOFFICIAL Sharetribe CLI (community reimplementation).'));
  console.error(chalk.yellow('   For the official CLI, install: ') + chalk.cyan('npm install -g flex-cli') + '\n');
  try {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(noticeShownMarker, new Date().toISOString());
  } catch {
    // Ignore errors writing marker file
  }
}

// Route argv to handle process subcommands
const routedArgv = routeProcessCommand(process.argv);

const program = new Command();

// Configure custom help formatter to match flex-cli
configureHelp(program);

// Configure output to add trailing newline (flex-cli behavior)
program.configureOutput({
  writeOut: (str) => process.stdout.write(str + '\n'),
  writeErr: (str) => process.stderr.write(str + '\n'),
});

// Configure the main program
program
  .name('sharetribe-community-cli')
  .description('CLI to interact with Sharetribe Flex')
  .version(packageJson.version, '-V', 'output the version number')
  .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier');

// Register commands

// version command
program
  .command('version')
  .description('show version')
  .action(() => {
    version();
  });

// login command
program
  .command('login')
  .description('log in with API key')
  .action(async () => {
    await login();
  });

// logout command
program
  .command('logout')
  .description('logout')
  .action(async () => {
    await logout();
  });

// debug command
program
  .command('debug')
  .description('display debug info')
  .action(() => {
    debug();
  });

// Register process commands
registerProcessCommands(program);

// Register search commands
registerSearchCommands(program);

// Register assets commands
registerAssetsCommands(program);

// Register notifications commands
registerNotificationsCommands(program);

// Register listing-approval command
registerListingApprovalCommand(program);

// Register events command
registerEventsCommand(program);

// Register stripe commands
registerStripeCommands(program);

// Register custom help command (to support "help process list" syntax)
program
  .command('help [command...]')
  .description('display help for Flex CLI')
  .action((commandPath: string[]) => {
    if (!commandPath || commandPath.length === 0) {
      program.outputHelp();
      return;
    }

    // Navigate to the nested command
    let targetCmd: Command = program;
    for (const cmdName of commandPath) {
      const subCmd = targetCmd.commands.find(c => c.name() === cmdName);
      if (!subCmd) {
        console.error(`Unknown command: ${commandPath.join(' ')}`);
        process.exitCode = 1; return;
      }
      targetCmd = subCmd;
    }

    // Show help for the target command
    targetCmd.outputHelp();
  });

// If no command specified, show help and exit with status 0
if (!routedArgv.slice(2).length) {
  program.outputHelp();
  // Don't call process.exit() - let Commander handle it naturally with exitOverride
} else {
  // Parse command line arguments with routed argv
  program.parse(routedArgv);
}
