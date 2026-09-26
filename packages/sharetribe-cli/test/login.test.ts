/**
 * Tests for the login command's error page and key handling
 *
 * The expected bytes come from flex-cli's default-error-format, whose
 * /current_admin/show branch only login can reach. The stored-key assertions
 * pin a deliberate divergence: flex-cli writes a rejected key over auth.edn and
 * exits 0, which goals.md lists as an upstream bug we do not copy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import chalk from 'chalk';
import { printApiError, CURRENT_ADMIN_PATH } from '../src/util/api-error.js';

/**
 * Captures everything printApiError writes to stderr
 */
function captureStderr(run: () => void): string {
  let captured = '';
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    captured += String(chunk);
    return true;
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  return captured;
}

describe('login error page', () => {
  let colorLevel: typeof chalk.level;

  beforeEach(() => {
    colorLevel = chalk.level;
    chalk.level = 0;
  });

  afterEach(() => {
    chalk.level = colorLevel;
  });

  it('names the key, not a marketplace, when the key itself did not verify', () => {
    const body = JSON.stringify({ errors: [{ title: 'Access denied' }] });
    const output = captureStderr(() => {
      printApiError({ status: 401, path: CURRENT_ADMIN_PATH, title: 'Access denied', originalText: body }, '', 'key-ending-1234');
    });

    expect(output).toBe(
      ' › Error: Access denied\n' +
        ' › \n' +
        ' › Failed to verify API key ending with ...1234\n' +
        ' › \n' +
        ' › Check your API key and use sharetribe-community-cli login to relogin.\n' +
        '\n\n'
    );
  });

  it('names the marketplace for a 401 from any other endpoint', () => {
    const output = captureStderr(() => {
      printApiError({ status: 401, path: '/assets/pull' }, 'some-marketplace', 'key-ending-1234');
    });

    expect(output).toBe(
      ' › Error: Access denied\n' +
        ' › \n' +
        ' › Failed to access marketplace some-marketplace with API key ending with ...1234\n' +
        ' › \n' +
        ' › Use sharetribe-community-cli login to relogin if needed.\n' +
        '\n\n'
    );
  });

  it('falls back to the marketplace page when no path is carried', () => {
    const output = captureStderr(() => {
      printApiError({ status: 401 }, 'some-marketplace', 'key-ending-1234');
    });

    expect(output).toContain('Failed to access marketplace some-marketplace');
  });
});
