/**
 * API error rendering
 *
 * Reproduces the branches of flex-cli's default-error-format
 * (src/sharetribe/flex_cli/api/client.cljs) that a failing assets call can
 * reach, so our stderr matches flex-cli byte for byte.
 */

import chalk from 'chalk';
import edn from 'jsedn';
import { printErrorPage } from './output.js';

const BIN = 'sharetribe-community-cli';

export interface ApiErrorDetails {
  status: number;
  /** errors[0].title from the response body, when the body carried one */
  title?: string;
  /** Raw response body, used as the reason when the body carried no title */
  originalText?: string;
}

/**
 * Reads errors[0].title out of a JSON error body
 */
function titleFromJson(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ title?: string }> };
    return parsed.errors?.[0]?.title;
  } catch {
    return undefined;
  }
}

/**
 * Reads errors[0].title out of an edn error body
 */
function titleFromEdn(body: string): string | undefined {
  try {
    const errors = edn.parse(body).at(edn.kw(':errors'));
    const first = errors?.val?.[0];
    return first ? first.at(edn.kw(':title')) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parses an API error body into what the error page prints
 *
 * The Build API answers JSON on most endpoints but edn on assets pull, which
 * asks for application/zip, so both shapes have to be understood here.
 *
 * @param body - Raw response body
 * @param status - HTTP status of the response
 */
export function parseApiErrorBody(body: string, status: number): ApiErrorDetails {
  return {
    status,
    title: titleFromJson(body) ?? titleFromEdn(body),
    originalText: body || undefined,
  };
}

/**
 * Prints the error page flex-cli prints for a failed API call
 *
 * The 401 page names the marketplace and the last four characters of the API
 * key, exactly as flex-cli does. flex-cli also has a 401 page specific to
 * /current_admin/show, which only its login command can reach and which is not
 * reproduced here.
 *
 * @param details - Status and reason taken from the response
 * @param marketplace - Marketplace the call was made against
 * @param apiKey - API key the call used; only its last four characters are printed
 */
export function printApiError(details: ApiErrorDetails, marketplace: string, apiKey: string): void {
  const { status, title, originalText } = details;

  if (status === 500) {
    printErrorPage(['API call failed. Reason: Internal server error.']);
    return;
  }

  if (status === 401) {
    printErrorPage([
      'Error: Access denied',
      `Failed to access marketplace ${chalk.bold(marketplace)} with API key ending with ...${chalk.bold(apiKey.slice(-4))}`,
      `Use ${chalk.bold(`${BIN} login`)} to relogin if needed.`,
    ]);
    return;
  }

  printErrorPage([
    `API call failed. Status: ${status}, reason: ${title || originalText || 'Unspecified'}`,
  ]);
}
