/**
 * Comprehensive help output comparison tests
 *
 * Tests that help output matches flex-cli for all commands
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

/**
 * Executes a CLI command and returns output
 */
function runCli(command: string, cli: 'flex' | 'sharetribe'): string {
  const cliName = cli === 'flex' ? 'flex-cli' : 'sharetribe-community-cli';
  try {
    return execSync(`${cliName} ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // A CLI that never exits would block the whole run: execSync is
      // synchronous, so vitest's own testTimeout cannot interrupt it.
      timeout: 60_000,
    });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      const stdout = (error as any).stdout || '';
      const stderr = (error as any).stderr || '';
      return stdout + stderr;
    }
    throw error;
  }
}

/**
 * Normalizes help output for comparison (removes CLI name differences)
 */
function normalizeHelp(output: string, cliName: string): string {
  return output
    .replace(new RegExp(cliName, 'g'), 'CLI')
    .replace(/\s+$/gm, ''); // Trim trailing spaces per line
}

/**
 * Compares help structure (sections present, not exact content)
 */
function compareHelpStructure(flexOutput: string, shareOutput: string, cmdName: string) {
  // Both should have description
  const flexLines = flexOutput.split('\n');
  const shareLines = shareOutput.split('\n');

  // First line should be description
  expect(shareLines[0]).toBeTruthy();
  expect(shareLines[0]).not.toMatch(/^USAGE|^OPTIONS|^COMMANDS/);

  // Should have USAGE section
  expect(shareOutput).toContain('USAGE');

  // Check if flex has OPTIONS
  if (flexOutput.includes('OPTIONS')) {
    expect(shareOutput).toContain('OPTIONS');
  }

  // Check if flex has COMMANDS
  if (flexOutput.includes('COMMANDS')) {
    expect(shareOutput).toContain('COMMANDS');
  }
}

describe('Help Comparison Tests', () => {
  describe('Main help', () => {
    it('has same structure as flex-cli', () => {
      const flexOutput = runCli('--help', 'flex');
      const shareOutput = runCli('--help', 'sharetribe');

      expect(shareOutput).toContain('VERSION');
      expect(shareOutput).toContain('USAGE');
      expect(shareOutput).toContain('COMMANDS');
      expect(shareOutput).toContain('Subcommand help:');

      // Should NOT have OPTIONS in main help
      const lines = shareOutput.split('\n');
      const commandsIndex = lines.findIndex(l => l === 'COMMANDS');
      const subcommandIndex = lines.findIndex(l => l.startsWith('Subcommand help:'));
      const betweenLines = lines.slice(commandsIndex, subcommandIndex);
      expect(betweenLines.some(l => l === 'OPTIONS')).toBe(false);
    });

    it('commands are alphabetically sorted', () => {
      const shareOutput = runCli('--help', 'sharetribe');
      const lines = shareOutput.split('\n');
      const commandsStartIndex = lines.findIndex(l => l === 'COMMANDS');
      const commandLines = lines.slice(commandsStartIndex + 1).filter(l => l.match(/^\s+\w/));

      const commandNames = commandLines.map(l => l.trim().split(/\s+/)[0]);
      const sortedNames = [...commandNames].sort();

      expect(commandNames).toEqual(sortedNames);
    });

    it('ends with empty line', () => {
      const shareOutput = runCli('--help', 'sharetribe');
      expect(shareOutput).toMatch(/\n$/);
      expect(shareOutput).toMatch(/\n\n$/);
    });
  });

  describe('help process', () => {
    it('matches flex-cli structure', () => {
      const flexOutput = runCli('help process', 'flex');
      const shareOutput = runCli('help process', 'sharetribe');

      compareHelpStructure(flexOutput, shareOutput, 'process');

      // Should have OPTIONS (process has --path and --transition options)
      expect(shareOutput).toContain('OPTIONS');
      expect(shareOutput).toContain('--path');
      expect(shareOutput).toContain('--transition');
    });

    it('has correct description', () => {
      const shareOutput = runCli('help process', 'sharetribe');
      const lines = shareOutput.split('\n');
      expect(lines[0]).toBe('describe a process file');
    });

    it('has correct usage', () => {
      const shareOutput = runCli('help process', 'sharetribe');
      expect(shareOutput).toMatch(/\$ sharetribe-community-cli process$/m);
    });
  });

  describe('help process list', () => {
    it('matches flex-cli structure', () => {
      const flexOutput = runCli('help process list', 'flex');
      const shareOutput = runCli('help process list', 'sharetribe');

      compareHelpStructure(flexOutput, shareOutput, 'process list');

      expect(shareOutput).toContain('OPTIONS');
      expect(shareOutput).toContain('--process');
      expect(shareOutput).toContain('--marketplace');
    });

    it('has correct description', () => {
      const shareOutput = runCli('help process list', 'sharetribe');
      expect(shareOutput).toMatch(/^list all transaction processes/);
    });
  });

  describe('help events', () => {
    it('matches flex-cli structure', () => {
      const flexOutput = runCli('help events', 'flex');
      const shareOutput = runCli('help events', 'sharetribe');

      compareHelpStructure(flexOutput, shareOutput, 'events');

      expect(shareOutput).toContain('OPTIONS');
    });

    it('has correct description', () => {
      const shareOutput = runCli('help events', 'sharetribe');
      expect(shareOutput).toMatch(/^Get a list of events\./);
    });
  });

  describe('help search', () => {
    it('matches flex-cli structure', () => {
      const flexOutput = runCli('help search', 'flex');
      const shareOutput = runCli('help search', 'sharetribe');

      compareHelpStructure(flexOutput, shareOutput, 'search');
    });

    it('has correct description', () => {
      const shareOutput = runCli('help search', 'sharetribe');
      expect(shareOutput).toMatch(/^list all search schemas/);
    });
  });

  describe('help search set option descriptions', () => {
    it('matches flex-cli wording for key and scope options', () => {
      const shareOutput = runCli('help search set', 'sharetribe');
      expect(shareOutput).toContain('key name');
      expect(shareOutput).toContain('extended data scope (either metadata or public for listing schema,');
      expect(shareOutput).toContain('metadata, private, protected or public for userProfile schema,');
      expect(shareOutput).toContain('metadata or protected for transaction schema)');
    });

    it('matches flex-cli wording for type and schema-for options', () => {
      const shareOutput = runCli('help search set', 'sharetribe');
      expect(shareOutput).toContain('value type (either enum, multi-enum, boolean, long or text)');
      expect(shareOutput).toContain('Subject of the schema (either listing, userProfile or transaction,');
      expect(shareOutput).toContain('defaults to listing');
    });
  });

  describe('help search unset option descriptions', () => {
    it('matches flex-cli wording for key, scope, and schema-for options', () => {
      const shareOutput = runCli('help search unset', 'sharetribe');
      expect(shareOutput).toContain('key name');
      expect(shareOutput).toContain('extended data scope (either metadata or public for listing schema,');
      expect(shareOutput).toContain('metadata, private, protected or public for userProfile schema,');
      expect(shareOutput).toContain('metadata or protected for transaction schema)');
      expect(shareOutput).toContain('Subject of the schema (either listing, userProfile or transaction,');
      expect(shareOutput).toContain('defaults to listing');
    });
  });

  describe('help notifications', () => {
    it('has correct structure', () => {
      const shareOutput = runCli('help notifications', 'sharetribe');

      expect(shareOutput).toContain('USAGE');
      expect(shareOutput).toContain('COMMANDS');
    });
  });

  describe('help login', () => {
    it('has correct structure', () => {
      const shareOutput = runCli('help login', 'sharetribe');

      expect(shareOutput).toContain('USAGE');
      expect(shareOutput).toContain('$ sharetribe-community-cli login');
    });
  });

  describe('help logout', () => {
    it('has correct structure', () => {
      const shareOutput = runCli('help logout', 'sharetribe');

      expect(shareOutput).toContain('USAGE');
      expect(shareOutput).toContain('$ sharetribe-community-cli logout');
    });
  });

  describe('help version', () => {
    it('has correct structure', () => {
      const shareOutput = runCli('help version', 'sharetribe');

      expect(shareOutput).toContain('USAGE');
      expect(shareOutput).toContain('$ sharetribe-community-cli version');
    });
  });

  describe('All help commands have consistent format', () => {
    const commands = [
      'help',
      'events',
      'events tail',
      'login',
      'logout',
      'process',
      'process list',
      'process create',
      'process push',
      'process pull',
      'process create-alias',
      'process update-alias',
      'process delete-alias',
      'search',
      'search set',
      'search unset',
      'notifications',
      'notifications preview',
      'notifications send',
      'stripe',
      'stripe update-version',
      'version',
    ];

    commands.forEach(cmd => {
      it(`help ${cmd} - has description and USAGE`, () => {
        const output = runCli(`help ${cmd}`, 'sharetribe');
        const lines = output.split('\n').filter(l => l.trim());

        // Should have at least description and USAGE
        expect(lines.length).toBeGreaterThan(2);
        expect(output).toContain('USAGE');
        expect(output).toMatch(/\$ sharetribe-community-cli/);
      });

      it(`help ${cmd} - ends with empty line`, () => {
        const output = runCli(`help ${cmd}`, 'sharetribe');
        expect(output).toMatch(/\n\n$/);
      });
    });
  });
});
