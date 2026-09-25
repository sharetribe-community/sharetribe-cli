/**
 * Marketplaces the comparison tests run against
 *
 * The names live in test-marketplaces.json at the repo root, which is
 * gitignored: this repo is public, and a marketplace ident is not ours to
 * publish. Nothing here hardcodes a name, and a missing or malformed file fails
 * loudly rather than letting the suite quietly test nothing.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Repo-root file holding the idents, relative to this file */
const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test-marketplaces.json');

interface TestMarketplaces {
  /** Ident every test targets unless it needs something else */
  default: string;
  /** Idents a test may write to, meaning the dev and test tiers */
  writable: string[];
  /** Idents that must only ever be read, meaning the production marketplaces */
  readOnly: string[];
}

const SHAPE = `{
  "default": "<ident every test targets>",
  "writable": ["<dev and test tier idents a test may write to>"],
  "readOnly": ["<production idents that must only ever be read>"]
}`;

/**
 * Reads and validates the marketplace config
 *
 * @throws If the file is absent, unparseable, or missing any field
 */
function readConfig(): TestMarketplaces {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, 'utf-8');
  } catch {
    throw new Error(
      `${CONFIG_PATH} not found. The comparison tests need marketplace idents, which are not committed because this repo is public. Create the file with this shape:\n\n${SHAPE}\n`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${CONFIG_PATH} is not valid JSON: ${(error as Error).message}`);
  }

  const config = parsed as Partial<TestMarketplaces>;
  const missing = (['default', 'writable', 'readOnly'] as const).filter(key =>
    key === 'default' ? typeof config.default !== 'string' : !Array.isArray(config[key])
  );
  if (missing.length > 0) {
    throw new Error(
      `${CONFIG_PATH} is missing or mistyped: ${missing.join(', ')}. Expected shape:\n\n${SHAPE}\n`
    );
  }

  return config as TestMarketplaces;
}

const config = readConfig();

/** Marketplace every test targets. Read-only tests use this directly. */
export const MARKETPLACE = config.default;

/**
 * Returns the marketplace a write-path test may target
 *
 * `assets push`, `search set`, `search unset`, `listing-approval enable` and
 * `disable`, and the whole process push and alias suite all change marketplace
 * state, so they go through here instead of reading MARKETPLACE. Pointing the
 * suite at a production marketplace then fails the write tests rather than
 * modifying a live marketplace.
 *
 * @throws If the configured default is not listed as writable
 */
export function writableMarketplace(): string {
  if (config.readOnly.includes(MARKETPLACE)) {
    throw new Error(
      `${MARKETPLACE} is listed under readOnly in ${CONFIG_PATH}, so a test that changes marketplace state must not target it. Point "default" at a dev or test tier marketplace to run the write-path tests.`
    );
  }
  if (!config.writable.includes(MARKETPLACE)) {
    throw new Error(
      `${MARKETPLACE} is not listed under writable in ${CONFIG_PATH}, so a test that changes marketplace state must not target it. Add it to "writable" if it really is a dev or test tier marketplace.`
    );
  }
  return MARKETPLACE;
}
