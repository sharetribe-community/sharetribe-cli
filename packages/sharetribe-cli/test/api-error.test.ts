/**
 * Tests for the API error page
 *
 * The expected bytes come from flex-cli's default-error-format and error-page
 * (src/sharetribe/flex_cli/api/client.cljs), rendered with colour off so the
 * spacing is readable.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import chalk from 'chalk';
import { parseApiErrorBody, printApiError } from '../src/util/api-error.js';

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

describe('API error page', () => {
  let colorLevel: typeof chalk.level;

  beforeEach(() => {
    colorLevel = chalk.level;
    chalk.level = 0;
  });

  afterEach(() => {
    chalk.level = colorLevel;
  });

  it('prints the reason alone when the body carries no asset details', () => {
    const body = JSON.stringify({ errors: [{ title: 'Bad request' }] });
    const output = captureStderr(() => {
      printApiError(parseApiErrorBody(body, 400), 'my-marketplace', 'abcd1234');
    });

    expect(output).toBe(' › API call failed. Status: 400, reason: Bad request\n\n\n');
  });

  it('lists each asset path and its messages under the reason', () => {
    const body = JSON.stringify({
      errors: [
        {
          title: 'Validation failed',
          details: {
            assets: [
              {
                path: 'content/pages/landing.json',
                errors: [{ message: 'should be object' }, { message: 'is required' }],
              },
              { path: 'design/branding.json', errors: [{ message: 'unknown property' }] },
            ],
          },
        },
      ],
    });
    const output = captureStderr(() => {
      printApiError(parseApiErrorBody(body, 400), 'my-marketplace', 'abcd1234');
    });

    expect(output).toBe(
      ' › API call failed. Status: 400, reason: Validation failed\n' +
        ' › In content/pages/landing.json:\n' +
        ' ›   should be object\n' +
        ' ›   is required\n' +
        ' › In design/branding.json:\n' +
        ' ›   unknown property\n' +
        '\n\n'
    );
  });

  it('prints a repeated error only once per asset', () => {
    const body = JSON.stringify({
      errors: [
        {
          title: 'Validation failed',
          details: {
            assets: [
              {
                path: 'a.json',
                errors: [
                  { message: 'should be object' },
                  { message: 'should be object' },
                  { message: 'should be object', keyword: 'type' },
                ],
              },
            ],
          },
        },
      ],
    });
    const output = captureStderr(() => {
      printApiError(parseApiErrorBody(body, 400), 'my-marketplace', 'abcd1234');
    });

    // flex-cli deduplicates whole error objects, so the third error, which
    // differs outside its message, still prints.
    expect(output).toBe(
      ' › API call failed. Status: 400, reason: Validation failed\n' +
        ' › In a.json:\n' +
        ' ›   should be object\n' +
        ' ›   should be object\n' +
        '\n\n'
    );
  });

  it('leaves the 500 and 401 pages alone', () => {
    const body = JSON.stringify({
      errors: [{ title: 'Nope', details: { assets: [{ path: 'a.json', errors: [{ message: 'x' }] }] } }],
    });

    expect(captureStderr(() => printApiError(parseApiErrorBody(body, 500), 'm', 'abcd1234'))).toBe(
      ' › API call failed. Reason: Internal server error.\n\n\n'
    );
    expect(captureStderr(() => printApiError(parseApiErrorBody(body, 401), 'm', 'abcd1234'))).toBe(
      ' › Error: Access denied\n' +
        ' › \n' +
        ' › Failed to access marketplace m with API key ending with ...1234\n' +
        ' › \n' +
        ' › Use sharetribe-community-cli login to relogin if needed.\n' +
        '\n\n'
    );
  });
});
