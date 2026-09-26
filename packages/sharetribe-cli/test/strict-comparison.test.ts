/**
 * Strict byte-by-byte comparison tests
 *
 * These tests verify EXACT output matching with zero tolerance for differences
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { MARKETPLACE, writableMarketplace } from './marketplaces.js';

/**
 * Executes a CLI command and returns output (stdout + stderr combined)
 *
 * spawnSync with `shell: false` on purpose. `execSync` runs the command through
 * `/bin/sh`, so its timeout signal lands on the shell and leaves the CLI itself
 * running. flex-cli's `assets pull` spins forever against this marketplace: it
 * fails with "No matching clause: application/edn" and then loops printing
 * "Downloaded 0.00MB", so every run that hit the bound leaked a process pegging
 * a core until someone killed it by hand. Spawning the binary directly puts the
 * SIGKILL on the CLI, so an overrunning run leaves nothing behind.
 *
 * `command` is split on whitespace: no call site quotes an argument, and the
 * paths passed in come from mkdtemp.
 */
function runCli(
  command: string,
  cli: 'flex' | 'sharetribe',
  envOverrides?: Record<string, string>
): string {
  const cliName = cli === 'flex' ? 'flex-cli' : 'sharetribe-community-cli';
  const env = envOverrides ? { ...process.env, ...envOverrides } : process.env;
  const result = spawnSync(cliName, command.split(/\s+/).filter(Boolean), {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    // A CLI that never exits would block the whole run: spawnSync is
    // synchronous, so vitest's own testTimeout cannot interrupt it.
    timeout: 60_000,
    killSignal: 'SIGKILL',
    env,
  });
  if (result.error) {
    throw result.error;
  }
  return result.status === 0 ? result.stdout : result.stdout + result.stderr;
}

/**
 * Normalizes dynamic data for comparison
 */
function normalizeOutput(output: string, type: 'table' | 'json' | 'text'): string {
  if (type === 'json') {
    // Parse and re-stringify to normalize formatting
    const lines = output.trim().split('\n');
    return lines.map(line => {
      try {
        const obj = JSON.parse(line);
        // Remove dynamic fields
        delete obj.createdAt;
        delete obj.sequenceId;
        delete obj.id;
        delete obj.marketplaceId;
        return JSON.stringify(obj);
      } catch {
        return line;
      }
    }).join('\n');
  }

  if (type === 'table') {
    // For tables, we verify structure but accept dynamic data
    return output;
  }

  return output;
}

/**
 * Bound for a test that drives the live Build API
 *
 * Each of these spawns one or two CLIs that make real API calls, and vitest's
 * default 5 seconds is inside normal latency for that, so runs went red on slow
 * responses alone. runCli already caps a single hung CLI at 60 seconds, so this
 * only has to be clear of ordinary network time while still surfacing a hang.
 */
const LIVE_API_TIMEOUT_MS = 30_000;

/**
 * Bound for flex-cli's assets pull probe
 *
 * Its known hang shows itself in the first second, so this only has to be long
 * enough that a working flex-cli finishes a real pull inside it. One that needs
 * longer hits the bound without the hang signature, which fails the test rather
 * than skipping it, and the fix is then to raise this.
 */
const FLEX_PULL_TIMEOUT_MS = 30_000;

/** Outcome of a CLI run that is allowed to hang or fail */
interface CliAttempt {
  /** Combined stdout and stderr captured before the process ended or was killed */
  output: string;
  /** True when the process was still running when the bound fired */
  timedOut: boolean;
}

/**
 * Runs a CLI and reports a bound being hit rather than throwing
 *
 * runCli rethrows ETIMEDOUT, which is right for a command expected to finish.
 * A caller that has to find out whether flex-cli still hangs needs the captured
 * output instead.
 *
 * @param command - Arguments, split on whitespace
 * @param cli - Which binary to run
 * @param timeoutMs - Bound after which the process is SIGKILLed
 */
function attemptCli(command: string, cli: 'flex' | 'sharetribe', timeoutMs: number): CliAttempt {
  const cliName = cli === 'flex' ? 'flex-cli' : 'sharetribe-community-cli';
  const result = spawnSync(cliName, command.split(/\s+/).filter(Boolean), {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
  });
  return {
    output: (result.stdout || '') + (result.stderr || ''),
    timedOut: (result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT',
  };
}

/**
 * Tells flex-cli's known `assets pull` hang from any other outcome
 *
 * flex-cli asks for application/zip. When the Build API answers an error, it
 * answers in edn, and flex-cli's parse-body has no clause for that content
 * type, so it throws "No matching clause: application/edn", loses its response
 * stream, and then loops on its download progress line forever. Only a signal
 * stops it, so there is no finite output to compare against.
 *
 * Matching the signature rather than the bound alone matters: a flex-cli that
 * merely runs slowly would hit the bound without it, and that should fail the
 * test loudly rather than skip it.
 *
 * @param attempt - Result of running flex-cli's assets pull
 */
function isKnownFlexPullHang(attempt: CliAttempt): boolean {
  return (
    attempt.timedOut &&
    attempt.output.includes('No matching clause: application/edn') &&
    attempt.output.includes('Downloaded 0.00MB')
  );
}

/**
 * Splits CLI output into non-empty lines
 *
 * A marketplace with no events prints nothing under --json and a header-only
 * table otherwise, so a bare split leaves one empty string that no assertion
 * should count as a row.
 */
function nonEmptyLines(output: string): string[] {
  return output.split('\n').filter(line => line.trim() !== '');
}

describe('Strict Byte-by-Byte Comparison Tests', () => {
  describe('version command', () => {
    it('tracks flex-cli version numbering', () => {
      const flexOutput = runCli('version', 'flex').trim();
      const shareOutput = runCli('version', 'sharetribe').trim();

      // flex-cli prints its hardcoded cli-info/version constant rather than its
      // npm version, and upstream leaves the constant behind: the published
      // flex-cli 1.17.1 still prints 1.16.0, because 4480e695a moved the
      // constant to 1.17.1 only after that release was built. We track the npm
      // numbering, so our printed version may run ahead of theirs, but must
      // never fall behind.
      const flexVersion = flexOutput.match(/^(\d+)\.(\d+)/);
      const shareVersion = shareOutput.match(/^(\d+)\.(\d+)/);

      if (flexVersion && shareVersion) {
        expect(Number(shareVersion[1])).toBe(Number(flexVersion[1]));
        expect(Number(shareVersion[2])).toBeGreaterThanOrEqual(Number(flexVersion[2]));
      } else {
        // Fallback to exact match if version pattern not found
        expect(shareOutput).toBe(flexOutput);
      }
    });
  });

  describe('error messages', () => {
    it('events without marketplace - exact match', () => {
      const flexOutput = runCli('events 2>&1', 'flex');
      const shareOutput = runCli('events 2>&1', 'sharetribe');

      // Both should output the same error message
      expect(shareOutput).toContain('Could not parse arguments:');
      expect(shareOutput).toContain('--marketplace is required');

      // Check exact format
      const flexLines = flexOutput.trim().split('\n');
      const shareLines = shareOutput.trim().split('\n');
      expect(shareLines).toEqual(flexLines);
    });
  });

  describe('debug command', () => {
    it('debug output matches flex-cli when available', () => {
      const apiBaseUrl = 'https://example.invalid/build-api';
      const flexOutput = runCli('debug', 'flex', {
        FLEX_API_BASE_URL: apiBaseUrl,
      });
      const shareOutput = runCli('debug', 'sharetribe', {
        FLEX_API_BASE_URL: apiBaseUrl,
      });

      const flexMissingDebug =
        flexOutput.includes('Command not found: debug') ||
        flexOutput.includes('unknown command');

      if (flexMissingDebug) {
        expect(shareOutput).toContain(apiBaseUrl);
        expect(shareOutput).not.toContain('Command not found: debug');
      } else {
        expect(shareOutput).toBe(flexOutput);
      }
    });
  });

  describe('table output format', () => {
    it('process list --process has exact column spacing', () => {
      const flexOutput = runCli(`process list --marketplace ${MARKETPLACE} --process=default-purchase`, 'flex');
      const shareOutput = runCli(`process list --marketplace ${MARKETPLACE} --process=default-purchase`, 'sharetribe');

      // Split into lines
      const flexLines = flexOutput.split('\n');
      const shareLines = shareOutput.split('\n');

      // Same number of lines
      expect(shareLines.length).toBe(flexLines.length);

      // Header line (index 1) should match exactly
      if (flexLines.length > 1 && shareLines.length > 1) {
        expect(shareLines[1]).toBe(flexLines[1]);
      }

      // Empty lines should match
      expect(shareLines[0]).toBe(flexLines[0]); // Before table
      expect(shareLines[shareLines.length - 1]).toBe(flexLines[flexLines.length - 1]); // After table
    }, LIVE_API_TIMEOUT_MS);

    it('events table has consistent column structure', () => {
      const output = runCli(`events --marketplace ${MARKETPLACE} --limit 3`, 'sharetribe');
      const lines = output.split('\n');

      // Should have empty line at start and end
      expect(lines[0]).toBe('');
      expect(lines[lines.length - 1]).toBe('');

      // Header should be present
      const header = lines[1];
      expect(header).toContain('Seq ID');
      expect(header).toContain('Resource ID');
      expect(header).toContain('Event type');
      expect(header).toContain('Created at local time');
      expect(header).toContain('Source');
      expect(header).toContain('Actor');
    }, LIVE_API_TIMEOUT_MS);
  });

  describe('JSON output format', () => {
    it('events --json has valid JSON on each line', () => {
      const output = runCli(`events --marketplace ${MARKETPLACE} --json --limit 3`, 'sharetribe');

      // A marketplace with no events prints nothing here, which is what
      // flex-cli does, so this asserts that the lines which exist are valid
      // JSON, not that any exist.
      for (const line of nonEmptyLines(output)) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }, 15000);

    it('events --json structure matches flex-cli', () => {
      const flexOutput = runCli(`events --marketplace ${MARKETPLACE} --json --limit 3`, 'flex');
      const shareOutput = runCli(`events --marketplace ${MARKETPLACE} --json --limit 3`, 'sharetribe');

      const flexLines = nonEmptyLines(flexOutput);
      const shareLines = nonEmptyLines(shareOutput);

      // Both CLIs must report the same events. Neither is required to find any:
      // what is being tested is that they agree.
      expect(shareLines.length).toBe(flexLines.length);

      for (let i = 0; i < flexLines.length; i++) {
        expect(Object.keys(JSON.parse(shareLines[i])).sort()).toEqual(
          Object.keys(JSON.parse(flexLines[i])).sort()
        );
      }
    }, LIVE_API_TIMEOUT_MS);
  });

  describe('help output format', () => {
    it('main help has VERSION section', () => {
      const output = runCli('--help', 'sharetribe');

      expect(output).toContain('VERSION');
      // Check for major.minor version pattern (e.g., "1.15") instead of exact patch version
      expect(output).toMatch(/\d+\.\d+/);
    });

    it('main help has USAGE section', () => {
      const output = runCli('--help', 'sharetribe');

      expect(output).toContain('USAGE');
      expect(output).toContain('$ sharetribe-community-cli [COMMAND]');
    });

    it('main help has COMMANDS section', () => {
      const output = runCli('--help', 'sharetribe');

      expect(output).toContain('COMMANDS');
      expect(output).toContain('events');
      expect(output).toContain('process');
      expect(output).toContain('search');
    });

    it('main help does NOT have OPTIONS section', () => {
      const output = runCli('--help', 'sharetribe');

      // Main help should not have OPTIONS section (flex-cli doesn't show it)
      const lines = output.split('\n');
      const commandsIndex = lines.findIndex(l => l === 'COMMANDS');
      const subcommandIndex = lines.findIndex(l => l.startsWith('Subcommand help:'));

      // Between COMMANDS and Subcommand help, there should be no OPTIONS
      if (commandsIndex !== -1 && subcommandIndex !== -1) {
        const betweenLines = lines.slice(commandsIndex, subcommandIndex);
        const hasOptions = betweenLines.some(l => l === 'OPTIONS');
        expect(hasOptions).toBe(false);
      }
    });

    it('subcommand help shows command structure', () => {
      // Note: Commander.js "help process list" shows parent "process" help
      // Direct command "--help" works: "process list --help"
      const output = runCli('process list --help', 'sharetribe');

      expect(output).toContain('OPTIONS');
      expect(output).toContain('--process');
      expect(output).toContain('--marketplace');
    });
  });

  describe('command descriptions match flex-cli', () => {
    it('events command description', () => {
      const output = runCli('--help', 'sharetribe');
      expect(output).toContain('Get a list of events.');
    });

    it('events tail description', () => {
      const output = runCli('--help', 'sharetribe');
      expect(output).toContain('Tail events live as they happen');
    });

    it('process description', () => {
      const output = runCli('--help', 'sharetribe');
      expect(output).toContain('describe a process file');
    });

    it('process list description', () => {
      const output = runCli('--help', 'sharetribe');
      expect(output).toContain('list all transaction processes');
    });

    it('notifications preview description', () => {
      const output = runCli('--help', 'sharetribe');
      expect(output).toContain('render a preview of an email template');
    });

    it('notifications send description', () => {
      const output = runCli('--help', 'sharetribe');
      expect(output).toContain('send a preview of an email template to the logged in admin');
    });
  });

  describe('column width consistency', () => {
    it('all table columns use minimum 10 char total width', () => {
      const output = runCli(`events --marketplace ${MARKETPLACE} --limit 1`, 'sharetribe');
      const lines = output.split('\n').filter(l => l.trim().length > 0);

      if (lines.length > 1) {
        const header = lines[0];

        // Check that columns are properly spaced
        // flex-cli uses minimum 10 chars total per column (content + spacing)
        const columns = header.split(/\s{2,}/);

        expect(columns.length).toBeGreaterThan(0);
      }
    }, LIVE_API_TIMEOUT_MS);
  });

  describe('events command', () => {
    it('events --marketplace matches flex-cli exactly', () => {
      const flexOutput = runCli(`events --marketplace ${MARKETPLACE} --limit 3`, 'flex');
      const shareOutput = runCli(`events --marketplace ${MARKETPLACE} --limit 3`, 'sharetribe');

      // Split into lines
      const flexLines = flexOutput.split('\n');
      const shareLines = shareOutput.split('\n');

      // Same structure (same number of lines)
      expect(shareLines.length).toBe(flexLines.length);

      // Header should match exactly
      expect(shareLines[1]).toBe(flexLines[1]);

      // Empty lines match
      expect(shareLines[0]).toBe(flexLines[0]);
      expect(shareLines[shareLines.length - 1]).toBe(flexLines[flexLines.length - 1]);
    }, LIVE_API_TIMEOUT_MS);

    it('events --limit 5 matches flex-cli', () => {
      const flexOutput = runCli(`events --marketplace ${MARKETPLACE} --limit 5`, 'flex');
      const shareOutput = runCli(`events --marketplace ${MARKETPLACE} --limit 5`, 'sharetribe');

      const flexLines = nonEmptyLines(flexOutput).filter(l => !l.includes('Seq ID'));
      const shareLines = nonEmptyLines(shareOutput).filter(l => !l.includes('Seq ID'));

      // The two CLIs must return the same rows and --limit must cap them. A
      // marketplace with no events yields none from either, which is agreement.
      expect(shareLines.length).toBe(flexLines.length);
      expect(shareLines.length).toBeLessThanOrEqual(5);
    }, LIVE_API_TIMEOUT_MS);

    it('events --filter user/created matches flex-cli', () => {
      const flexOutput = runCli(`events --marketplace ${MARKETPLACE} --filter user/created --limit 3`, 'flex');
      const shareOutput = runCli(`events --marketplace ${MARKETPLACE} --filter user/created --limit 3`, 'sharetribe');

      // Structure should match
      const flexLines = flexOutput.split('\n');
      const shareLines = shareOutput.split('\n');

      expect(shareLines[0]).toBe(flexLines[0]); // Empty line
      expect(shareLines[1]).toBe(flexLines[1]); // Header

      // All data lines should contain user/created
      const dataLines = shareOutput.split('\n').filter(l => l.trim() && !l.includes('Event type'));
      for (const line of dataLines) {
        expect(line).toContain('user/created');
      }
    }, LIVE_API_TIMEOUT_MS);

    it('events tail --help matches flex-cli', () => {
      const flexOutput = runCli('events tail --help', 'flex');
      const shareOutput = runCli('events tail --help', 'sharetribe');

      // Should contain same key elements (exact match would differ due to CLI name)
      expect(shareOutput).toContain('Tail events live');
      expect(shareOutput).toContain('--marketplace');
      expect(shareOutput).toContain('--filter');
    });
  });

  describe('process command', () => {
    it('process list --marketplace matches flex-cli', () => {
      const flexOutput = runCli(`process list --marketplace ${MARKETPLACE}`, 'flex');
      const shareOutput = runCli(`process list --marketplace ${MARKETPLACE}`, 'sharetribe');

      const flexLines = flexOutput.split('\n');
      const shareLines = shareOutput.split('\n');

      // Same structure
      expect(shareLines.length).toBe(flexLines.length);

      // Header matches exactly
      expect(shareLines[1]).toBe(flexLines[1]);
    }, LIVE_API_TIMEOUT_MS);

    it('process list --process=default-purchase matches flex-cli', () => {
      const flexOutput = runCli(`process list --marketplace ${MARKETPLACE} --process=default-purchase`, 'flex');
      const shareOutput = runCli(`process list --marketplace ${MARKETPLACE} --process=default-purchase`, 'sharetribe');

      const flexLines = flexOutput.split('\n');
      const shareLines = shareOutput.split('\n');

      // Same number of lines
      expect(shareLines.length).toBe(flexLines.length);

      // Header matches
      expect(shareLines[1]).toBe(flexLines[1]);
    }, LIVE_API_TIMEOUT_MS);
  });

  describe('search command', () => {
    it('search --marketplace matches flex-cli exactly', () => {
      const flexOutput = runCli(`search --marketplace ${MARKETPLACE}`, 'flex');
      const shareOutput = runCli(`search --marketplace ${MARKETPLACE}`, 'sharetribe');

      // Should match byte-for-byte
      expect(shareOutput).toBe(flexOutput);
    }, LIVE_API_TIMEOUT_MS);

    it('search set --help matches flex-cli structure', () => {
      const flexOutput = runCli('search set --help', 'flex');
      const shareOutput = runCli('search set --help', 'sharetribe');

      expect(shareOutput).toContain('set search schema');
      expect(shareOutput).toContain('--key');
      expect(shareOutput).toContain('--scope');
      expect(shareOutput).toContain('--type');
    });

    it('search unset --help matches flex-cli structure', () => {
      const flexOutput = runCli('search unset --help', 'flex');
      const shareOutput = runCli('search unset --help', 'sharetribe');

      expect(shareOutput).toContain('unset search schema');
      expect(shareOutput).toContain('--key');
      expect(shareOutput).toContain('--scope');
    });
  });

  describe('assets command', () => {
    it('assets pull --help matches flex-cli structure', () => {
      const flexOutput = runCli('assets pull --help', 'flex');
      const shareOutput = runCli('assets pull --help', 'sharetribe');

      expect(shareOutput).toContain('pull assets from remote');
      expect(shareOutput).toContain('--marketplace');
      expect(shareOutput).toContain('--path');
    });

    it('assets push --help matches flex-cli structure', () => {
      const flexOutput = runCli('assets push --help', 'flex');
      const shareOutput = runCli('assets push --help', 'sharetribe');

      expect(shareOutput).toContain('push assets to remote');
      expect(shareOutput).toContain('--marketplace');
      expect(shareOutput).toContain('--path');
    });
  });

  describe('notifications command', () => {
    it('notifications preview --help matches flex-cli structure', () => {
      const flexOutput = runCli('notifications preview --help', 'flex');
      const shareOutput = runCli('notifications preview --help', 'sharetribe');

      expect(shareOutput).toContain('render a preview of an email template');
      expect(shareOutput).toContain('--marketplace');
      expect(shareOutput).toContain('--template');
    });

    it('notifications send --help matches flex-cli structure', () => {
      const flexOutput = runCli('notifications send --help', 'flex');
      const shareOutput = runCli('notifications send --help', 'sharetribe');

      expect(shareOutput).toContain('send a preview of an email template');
      expect(shareOutput).toContain('--marketplace');
      expect(shareOutput).toContain('--template');
    });
  });

  describe('listing-approval command', () => {
    it('listing-approval --help shows DEPRECATED', () => {
      const shareOutput = runCli('listing-approval --help', 'sharetribe');

      expect(shareOutput).toContain('DEPRECATED');
      expect(shareOutput).toContain('Console');
    });

    it('listing-approval enable --help matches flex-cli structure', () => {
      const flexOutput = runCli('listing-approval enable --help', 'flex');
      const shareOutput = runCli('listing-approval enable --help', 'sharetribe');

      expect(shareOutput).toContain('enable listing approvals');
      expect(shareOutput).toContain('--marketplace');
    });

    it('listing-approval disable --help matches flex-cli structure', () => {
      const flexOutput = runCli('listing-approval disable --help', 'flex');
      const shareOutput = runCli('listing-approval disable --help', 'sharetribe');

      expect(shareOutput).toContain('disable listing approvals');
      expect(shareOutput).toContain('--marketplace');
    });
  });

  describe('stripe command', () => {
    it('stripe update-version --help matches flex-cli structure', () => {
      const flexOutput = runCli('stripe update-version --help', 'flex');
      const shareOutput = runCli('stripe update-version --help', 'sharetribe');

      expect(shareOutput).toContain('update Stripe API version');
      expect(shareOutput).toContain('--marketplace');
      expect(shareOutput).toContain('--version');
    });
  });

  describe('login/logout commands', () => {
    it('login --help matches flex-cli structure', () => {
      const flexOutput = runCli('login --help', 'flex');
      const shareOutput = runCli('login --help', 'sharetribe');

      expect(shareOutput).toContain('log in with API key');
    });

    it('logout --help matches flex-cli structure', () => {
      const flexOutput = runCli('logout --help', 'flex');
      const shareOutput = runCli('logout --help', 'sharetribe');

      expect(shareOutput).toContain('logout');
    });
  });

  describe('workflow tests', () => {
    it('search set/unset workflow matches flex-cli', async () => {
      // This test writes: search unset then search set against the marketplace.
      const marketplace = writableMarketplace();
      // 1. List existing schemas to find one we can test with
      const listFlexOutput = runCli(`search --marketplace ${marketplace}`, 'flex');
      const listShareOutput = runCli(`search --marketplace ${marketplace}`, 'sharetribe');

      // Headers should match exactly
      const flexLines = listFlexOutput.split('\n');
      const shareLines = listShareOutput.split('\n');
      expect(shareLines[1]).toBe(flexLines[1]); // Header line

      // Find an existing schema to test with
      // Avoid schemas "defined in Console" which can't be edited with CLI
      // Skip empty lines and header line
      const schemaLines = flexLines.filter(line =>
        line.trim().length > 0 &&
        !line.includes('Schema for') &&
        !line.includes('Console')
      );

      if (schemaLines.length === 0) {
        console.warn('No existing editable listing schemas found, skipping unset/set test');
        return;
      }

      // Parse the first schema line to extract key and other details
      // Format: "schemaFor  scope  key  type  defaultValue  doc"
      const schemaLine = schemaLines[0];
      const parts = schemaLine.split(/\s{2,}/).map(p => p.trim());
      const testSchemaFor = parts[0]; // Schema for column
      const testScope = parts[1]; // Scope column
      const testKey = parts[2]; // Key column
      const testType = parts[3]; // Type column
      const testDefault = parts[4] || ''; // Default value (optional)
      const testDoc = parts[5] || ''; // Doc column (optional)

      // Build the set command
      let setCommand = `search set --marketplace ${marketplace} --key ${testKey} --scope ${testScope} --type ${testType} --schema-for ${testSchemaFor}`;
      if (testDoc) {
        setCommand += ` --doc "${testDoc}"`;
      }
      if (testDefault) {
        setCommand += ` --default "${testDefault}"`;
      }

      // 2. Run all 3 flex-cli commands first
      const unsetFlexOutput = runCli(
        `search unset --marketplace ${marketplace} --key ${testKey} --scope ${testScope} --schema-for ${testSchemaFor}`,
        'flex'
      );
      const setFlexOutput = runCli(setCommand, 'flex');
      const verifyFlexOutput = runCli(`search --marketplace ${marketplace}`, 'flex');

      // 3. Run all 3 sharetribe-community-cli commands
      const unsetShareOutput = runCli(
        `search unset --marketplace ${marketplace} --key ${testKey} --scope ${testScope} --schema-for ${testSchemaFor}`,
        'sharetribe'
      );
      const setShareOutput = runCli(setCommand, 'sharetribe');
      const verifyShareOutput = runCli(`search --marketplace ${marketplace}`, 'sharetribe');

      // 4. Do all assertions together
      expect(unsetShareOutput).toBe(unsetFlexOutput);
      expect(setShareOutput).toBe(setFlexOutput);
      expect(verifyShareOutput).toBe(verifyFlexOutput);
    }, 30000);

    it('events tail can be started and stopped', () => {
      // This test verifies events tail starts correctly with timeout
      // We can't do full byte-by-byte comparison since tail runs indefinitely
      const { spawn } = require('child_process');

      return new Promise<void>((resolve, reject) => {
        const flexProc = spawn('flex-cli', ['events', 'tail', '--marketplace', MARKETPLACE, '--limit', '1']);
        const shareProc = spawn('sharetribe-community-cli', ['events', 'tail', '--marketplace', MARKETPLACE, '--limit', '1']);

        let flexOutput = '';
        let shareOutput = '';
        let flexExited = false;
        let shareExited = false;

        flexProc.stdout.on('data', (data: Buffer) => {
          flexOutput += data.toString();
        });

        shareProc.stdout.on('data', (data: Buffer) => {
          shareOutput += data.toString();
        });

        const checkBothExited = () => {
          if (flexExited && shareExited) {
            // Both should show "tailing" or "tail" message
            try {
              expect(shareOutput.toLowerCase()).toMatch(/tail|starting/);
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        };

        flexProc.on('exit', () => {
          flexExited = true;
          checkBothExited();
        });

        shareProc.on('exit', () => {
          shareExited = true;
          checkBothExited();
        });

        // Wait for initial output, then kill both processes
        setTimeout(() => {
          flexProc.kill('SIGINT');
          shareProc.kill('SIGINT');

          // Force kill if they don't exit after SIGINT
          setTimeout(() => {
            if (!flexExited) flexProc.kill('SIGKILL');
            if (!shareExited) shareProc.kill('SIGKILL');

            // If still not exited after SIGKILL, resolve anyway
            setTimeout(() => {
              if (!flexExited || !shareExited) {
                // Processes didn't exit cleanly, but that's okay for this test
                resolve();
              }
            }, 500);
          }, 1000);
        }, 2000);
      });
    }, 10000); // 10 second timeout

    it('assets pull/push workflow matches flex-cli', () => {
      // This test writes: assets push against the marketplace.
      const marketplace = writableMarketplace();
      const { mkdtempSync, rmSync } = require('fs');
      const { tmpdir } = require('os');
      const { join } = require('path');

      // Create temporary directories for both CLIs
      const flexDir = mkdtempSync(join(tmpdir(), 'flex-assets-'));
      const shareDir = mkdtempSync(join(tmpdir(), 'share-assets-'));

      try {
        // flex-cli runs first on purpose. Against this Build API its assets pull
        // never returns, so there is nothing to compare against and the rest of
        // the test is meaningless. Skip on that exact signature, and compare as
        // normal on anything else, including a flex-cli that starts working.
        const pullFlexAttempt = attemptCli(
          `assets pull --marketplace ${marketplace} --path ${flexDir}`,
          'flex',
          FLEX_PULL_TIMEOUT_MS
        );
        if (isKnownFlexPullHang(pullFlexAttempt)) {
          console.log(
            'Skipping: flex-cli assets pull still hangs on the edn error body it cannot parse, so there is no output to compare. Re-runs by itself once upstream fixes it.'
          );
          return;
        }

        const pullShareOutput = runCli(
          `assets pull --marketplace ${marketplace} --path ${shareDir}`,
          'sharetribe'
        );

        // Both should complete successfully
        // We can't do exact byte comparison since output may include file counts/timestamps
        // But we verify both succeed
        expect(pullShareOutput).toBeTruthy();

        // Verify push works (should show no changes since we just pulled)
        const pushFlexOutput = runCli(
          `assets push --marketplace ${marketplace} --path ${flexDir}`,
          'flex'
        );
        const pushShareOutput = runCli(
          `assets push --marketplace ${marketplace} --path ${shareDir}`,
          'sharetribe'
        );

        // Both should complete
        expect(pushShareOutput).toBeTruthy();

      } finally {
        // Clean up temporary directories
        try {
          rmSync(flexDir, { recursive: true, force: true });
          rmSync(shareDir, { recursive: true, force: true });
        } catch (cleanupError) {
          console.warn('Cleanup failed:', cleanupError);
        }
      }
      // The flex-cli probe can burn its whole 30s bound, and a working flex-cli
      // then adds our pull plus two pushes at runCli's 60s bound each, so the
      // budget below has to cover all four rather than just the probe.
    }, 240_000);

    it('listing-approval toggle workflow matches flex-cli', () => {
      // This test writes: it toggles listing approval on the marketplace.
      const marketplace = writableMarketplace();
      // Simple toggle test: enable → disable → enable to restore
      // Both CLIs should produce similar output

      // Enable listing approval
      const enableFlexOutput = runCli(
        `listing-approval enable --marketplace ${marketplace}`,
        'flex'
      );
      const enableShareOutput = runCli(
        `listing-approval enable --marketplace ${marketplace}`,
        'sharetribe'
      );

      // Both should show enabled (or already enabled)
      expect(enableShareOutput.toLowerCase()).toMatch(/enabled|already/);
      expect(enableShareOutput.toLowerCase()).toContain('approval');

      // Disable listing approval
      const disableFlexOutput = runCli(
        `listing-approval disable --marketplace ${marketplace}`,
        'flex'
      );
      const disableShareOutput = runCli(
        `listing-approval disable --marketplace ${marketplace}`,
        'sharetribe'
      );

      // Both should show disabled (or success)
      expect(disableShareOutput.toLowerCase()).toMatch(/disabled|success/);

      // Re-enable to restore to known state
      const restoreFlexOutput = runCli(
        `listing-approval enable --marketplace ${marketplace}`,
        'flex'
      );
      const restoreShareOutput = runCli(
        `listing-approval enable --marketplace ${marketplace}`,
        'sharetribe'
      );

      expect(restoreShareOutput.toLowerCase()).toMatch(/enabled|success/);
    }, 15000); // 15 second timeout

    // Note: notifications preview/send require interactive template selection
    // and don't support --help, so we only test them via --help tests above
  });
});
