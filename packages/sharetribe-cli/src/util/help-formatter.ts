/**
 * Custom help formatter to match flex-cli output exactly
 */

import { Command, Help } from 'commander';
import chalk from 'chalk';

/**
 * Formats help text to match flex-cli style
 *
 * flex-cli format:
 * - Description (no label)
 * - VERSION section (for main help only)
 * - USAGE section
 * - COMMANDS section (flattened list of all leaf commands)
 * - OPTIONS section (for subcommands only, not main)
 * - Subcommand help instructions
 *
 * @param cmd - Commander command instance
 * @returns Formatted help text matching flex-cli
 */
export function formatHelp(cmd: Command): string {
  const parts: string[] = [];
  const isRootCommand = !cmd.parent;

  // Description (no label, just the text)
  const description = cmd.description();
  if (description) {
    parts.push(description);
    parts.push('');
  }

  // VERSION section (only for root command)
  if (isRootCommand) {
    const version = cmd.version();
    if (version) {
      parts.push('VERSION');
      parts.push(`  ${version}`);
      parts.push('');
    }
  }

  // USAGE section
  parts.push('USAGE');
  const usage = formatUsage(cmd);
  parts.push(`  $ ${usage}`);
  parts.push('');

  // COMMANDS section
  // Note: If command has an action (options), don't show COMMANDS section (like flex-cli)
  const allCommands = collectAllLeafCommands(cmd);
  const hasAction = cmd.options.length > 0 && !isRootCommand;

  if (allCommands.length > 0 && !hasAction) {
    parts.push('COMMANDS');

    // Calculate max command name length for alignment
    const maxLength = Math.max(...allCommands.map(c => c.name.length));

    for (const cmdInfo of allCommands) {
      const paddedName = cmdInfo.name.padEnd(maxLength + 2);
      parts.push(`  ${paddedName}${cmdInfo.description}`);
    }
    parts.push('');
  }

  // OPTIONS section (only for subcommands, not root)
  if (!isRootCommand) {
    const options = cmd.options;
    if (options.length > 0) {
      parts.push('OPTIONS');

      // Calculate max option flags length for alignment
      const maxFlagsLength = Math.max(...options.map(opt => formatOptionFlags(opt).length));

      for (const opt of options) {
        const flags = formatOptionFlags(opt);
        const paddedFlags = flags.padEnd(maxFlagsLength + 2);
        const desc = opt.description || '';
        parts.push(`  ${paddedFlags}${desc}`);
      }
      parts.push('');
    }
  }

  // Subcommand help instructions (only for main and group commands without actions)
  if (allCommands.length > 0 && !hasAction) {
    parts.push('Subcommand help:');
    const cmdName = getCommandName(cmd);
    parts.push(`  $ ${cmdName} help [COMMAND]`);
  }

  // Always add empty line at end to match flex-cli
  parts.push('');

  return parts.join('\n');
}

/**
 * Recursively collects all commands (both parent and leaf commands)
 *
 * flex-cli shows ALL commands, including parent commands that have their own actions
 * Example: both "events" and "events tail" are shown
 *
 * @param cmd - Commander command instance
 * @returns Array of command info objects with name and description
 */
function collectAllLeafCommands(cmd: Command): Array<{ name: string; description: string }> {
  const results: Array<{ name: string; description: string }> = [];
  const commands = cmd.commands.filter(c => !c._hidden && c.name() !== 'help');

  for (const subCmd of commands) {
    const fullName = getCommandFullName(subCmd);
    const subCommands = subCmd.commands.filter(c => !c._hidden);

    // Add this command if it has an action or description
    if (subCmd.description()) {
      results.push({
        name: fullName,
        description: subCmd.description() || ''
      });
    }

    // If it has subcommands, recurse and add those too
    if (subCommands.length > 0) {
      const subResults = collectAllLeafCommands(subCmd);
      for (const sub of subResults) {
        results.push(sub);
      }
    }
  }

  // Add "help" command at the beginning if this is root
  if (!cmd.parent) {
    results.unshift({
      name: 'help',
      description: 'display help for Sharetribe CLI'
    });
  }

  // Sort alphabetically by command name
  results.sort((a, b) => a.name.localeCompare(b.name));

  return results;
}

/**
 * Gets the command name for usage (flex-cli vs sharetribe-community-cli)
 *
 * @param cmd - Commander command instance
 * @returns Command name (e.g., "sharetribe-community-cli" or "sharetribe-community-cli process")
 */
function getCommandName(cmd: Command): string {
  const names: string[] = [];
  let current: Command | null = cmd;

  while (current) {
    if (current.name()) {
      names.unshift(current.name());
    }
    current = current.parent;
  }

  // Replace first name with "sharetribe-community-cli" (or "flex-cli" for reference)
  if (names.length > 0) {
    names[0] = 'sharetribe-community-cli';
  }

  return names.join(' ');
}

/**
 * Formats the USAGE line
 *
 * @param cmd - Commander command instance
 * @returns Usage string (e.g., "sharetribe-community-cli [COMMAND]" or "sharetribe-community-cli process list")
 */
function formatUsage(cmd: Command): string {
  const cmdName = getCommandName(cmd);
  const commands = cmd.commands.filter(c => !c._hidden);
  const hasOptions = cmd.options.length > 0;
  const isRoot = !cmd.parent;

  // Root command always shows [COMMAND] if it has subcommands
  if (isRoot && commands.length > 0) {
    return `${cmdName} [COMMAND]`;
  }

  // If command has options (its own action), don't show [COMMAND] even if it has subcommands
  // This matches flex-cli behavior for commands like "process" which have both action and subcommands
  if (commands.length > 0 && !hasOptions) {
    // Has subcommands but no action
    return `${cmdName} [COMMAND]`;
  } else {
    // Leaf command or command with action - just show the command path
    return cmdName;
  }
}

/**
 * Gets the full command name including parent path
 *
 * @param cmd - Commander command instance
 * @returns Full command name (e.g., "process list" or "events tail")
 */
function getCommandFullName(cmd: Command): string {
  const names: string[] = [];
  let current: Command | null = cmd;

  while (current && current.parent) {
    if (current.name()) {
      names.unshift(current.name());
    }
    current = current.parent;
  }

  return names.join(' ');
}

/**
 * Formats option flags for display
 *
 * @param opt - Commander option instance
 * @returns Formatted flags string (e.g., "-m, --marketplace=MARKETPLACE_ID")
 */
function formatOptionFlags(opt: any): string {
  // Commander option flags are in opt.flags (e.g., "-m, --marketplace <MARKETPLACE_ID>")
  // We need to parse and reformat this to match flex-cli style
  const flagsStr = opt.flags || '';

  // Parse the flags string
  // Format: "-m, --marketplace <VALUE>" or "--flag" or "-f"
  const parts = flagsStr.split(/,\s*/);
  const formatted: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    // Check if it has a value placeholder (angle brackets or square brackets)
    const valueMatch = trimmed.match(/^((?:-{1,2}[\w-]+))\s*[<\[]([^\]>]+)[\]>]/);
    if (valueMatch) {
      // Has a value: "-m <MARKETPLACE_ID>" or "--marketplace <MARKETPLACE_ID>"
      const flag = valueMatch[1];
      const valueName = valueMatch[2];
      formatted.push(`${flag}=${valueName}`);
    } else {
      // No value: just the flag
      formatted.push(trimmed);
    }
  }

  return formatted.join(', ');
}

/**
 * Configures Commander.js to use custom help formatter
 *
 * @param program - Commander program instance
 */
export function configureHelp(program: Command): void {
  program.configureHelp({
    formatHelp: (cmd: Command, helper: Help) => {
      return formatHelp(cmd);
    }
  });
}
