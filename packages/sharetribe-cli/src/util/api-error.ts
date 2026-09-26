/**
 * API error rendering
 *
 * Reproduces the branches of flex-cli's default-error-format
 * (src/sharetribe/flex_cli/api/client.cljs) that a failing assets call can
 * reach, so our stderr matches flex-cli byte for byte.
 */

import chalk from 'chalk';
import edn from 'jsedn';
import { errorPageLine, printErrorPage } from './output.js';

const BIN = 'sharetribe-community-cli';

/** Endpoint whose 401 means the key did not verify, rather than a marketplace refusal */
export const CURRENT_ADMIN_PATH = '/current_admin/show';

/** JSON Schema validation failures the API reported against a single asset */
export interface AssetValidationError {
  /** Path of the asset that failed validation */
  path: string;
  /** Validation messages for that asset, in response order, duplicates dropped */
  messages: string[];
}

export interface ApiErrorDetails {
  status: number;
  /** Endpoint the call was made against, which selects the 401 page to print */
  path?: string;
  /** errors[0].title from the response body, when the body carried one */
  title?: string;
  /** Raw response body, used as the reason when the body carried no title */
  originalText?: string;
  /** errors[0].details.assets, listed under the reason on the error page */
  assetErrors?: AssetValidationError[];
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
 * Reads errors[0].details.assets out of a JSON error body
 *
 * Only asset pushes carry these details, and the Build API answers that
 * endpoint in JSON, so the edn bodies that assets pull returns are not searched
 * for them.
 *
 * Duplicate errors are dropped per asset, as flex-cli's asset-validation-errors
 * does. It deduplicates whole error objects rather than messages, so two
 * failures that share a message but differ elsewhere are both printed.
 *
 * @param body - Raw response body
 */
function assetErrorsFromJson(body: string): AssetValidationError[] | undefined {
  let assets: Array<{ path?: string; errors?: Array<{ message?: string }> }> | undefined;
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{
        details?: { assets?: Array<{ path?: string; errors?: Array<{ message?: string }> }> };
      }>;
    };
    assets = parsed.errors?.[0]?.details?.assets;
  } catch {
    return undefined;
  }

  if (!Array.isArray(assets) || assets.length === 0) {
    return undefined;
  }

  return assets.map(asset => {
    const seen = new Set<string>();
    const messages: string[] = [];
    for (const error of asset.errors ?? []) {
      const key = JSON.stringify(error);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      messages.push(error.message ?? '');
    }
    return { path: asset.path ?? '', messages };
  });
}

/**
 * Renders the per-asset validation lines that hang under the reason
 *
 * Each asset gets a line naming its path in bold and one further line per
 * message, indented two spaces deeper. Every line carries its own arrow because
 * the whole block is one error-page section.
 *
 * @param assetErrors - Validation failures, one entry per asset
 */
function formatAssetErrors(assetErrors: AssetValidationError[]): string {
  return assetErrors
    .flatMap(({ path, messages }) => [
      errorPageLine(` In ${chalk.bold(path)}:`),
      ...messages.map(message => errorPageLine(`   ${message}`)),
    ])
    .map(line => `\n${line}`)
    .join('');
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
    assetErrors: assetErrorsFromJson(body),
  };
}

/**
 * Prints the error page flex-cli prints for a failed API call
 *
 * There are two 401 pages, as flex-cli has. A 401 from /current_admin/show
 * means the key itself did not verify, so that page names only the key and
 * tells the user to relogin. Any other 401 means the key is valid but cannot
 * reach that marketplace, so that page names the marketplace too.
 *
 * @param details - Status and reason taken from the response
 * @param marketplace - Marketplace the call was made against
 * @param apiKey - API key the call used; only its last four characters are printed
 */
export function printApiError(details: ApiErrorDetails, marketplace: string, apiKey: string): void {
  const { status, path, title, originalText, assetErrors } = details;

  if (status === 500) {
    printErrorPage(['API call failed. Reason: Internal server error.']);
    return;
  }

  if (status === 401 && path === CURRENT_ADMIN_PATH) {
    printErrorPage([
      'Error: Access denied',
      `Failed to verify API key ending with ...${chalk.bold(apiKey.slice(-4))}`,
      `Check your API key and use ${chalk.bold(`${BIN} login`)} to relogin.`,
    ]);
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

  const reason = `API call failed. Status: ${status}, reason: ${title || originalText || 'Unspecified'}`;
  printErrorPage([
    assetErrors?.length ? `${reason}${formatAssetErrors(assetErrors)}` : reason,
  ]);
}
