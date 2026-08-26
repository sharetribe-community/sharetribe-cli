/**
 * Authentication storage - manages flex-cli's auth.edn
 *
 * Must maintain 100% compatibility with flex-cli's auth.edn format *and* with
 * the location flex-cli keeps it in. The location is not always
 * `~/.config/flex-cli`: flex-cli follows the XDG spec, so `XDG_CONFIG_HOME`
 * wins where it is set, and on Windows `%LOCALAPPDATA%` is used instead of
 * `~/.config`. Hardcoding `~/.config` meant this SDK looked in the wrong place
 * on Windows and on any machine with `XDG_CONFIG_HOME` set, so a user who had
 * logged in with flex-cli appeared logged out.
 *
 * `resolveConfigDir` reproduces flex-cli's own resolution order, taken from its
 * `sharetribe.flex-cli.xdg` namespace.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import edn from 'jsedn';

const CONFIG_DIR_NAME = 'flex-cli';
const AUTH_FILE_NAME = 'auth.edn';

/** The subset of `process.env` that takes part in resolving the config dir. */
export interface ConfigDirEnv {
  readonly HOME?: string;
  readonly XDG_CONFIG_HOME?: string;
  readonly LOCALAPPDATA?: string;
  readonly HOMEDRIVE?: string;
  readonly HOMEPATH?: string;
  readonly USERPROFILE?: string;
  /** Present so `process.env` itself is accepted. */
  readonly [key: string]: string | undefined;
}

/**
 * flex-cli's notion of the home directory. Windows has no `HOME`, so it falls
 * back to `HOMEDRIVE` + `HOMEPATH` and then `USERPROFILE` before reaching for
 * the OS defaults.
 */
function resolveHome(
  platform: NodeJS.Platform,
  env: ConfigDirEnv,
  osHome: string
): string {
  if (env.HOME) {
    return env.HOME;
  }

  if (platform === 'win32') {
    if (env.HOMEDRIVE && env.HOMEPATH) {
      return join(env.HOMEDRIVE, env.HOMEPATH);
    }
    if (env.USERPROFILE) {
      return env.USERPROFILE;
    }
  }

  return osHome || tmpdir();
}

/**
 * The config directory for a given platform and environment, exported so the
 * Windows and XDG branches can be exercised from any machine.
 *
 * Order, matching flex-cli exactly: `XDG_CONFIG_HOME`, then `%LOCALAPPDATA%`
 * on Windows only, then `<home>/.config`. A single directory, not a search
 * path: flex-cli reads and writes one location, and so must this.
 */
export function configDirFor(
  platform: NodeJS.Platform,
  env: ConfigDirEnv,
  osHome: string
): string {
  const base =
    env.XDG_CONFIG_HOME ||
    (platform === 'win32' ? env.LOCALAPPDATA : undefined) ||
    join(resolveHome(platform, env, osHome), '.config');

  return join(base, CONFIG_DIR_NAME);
}

/**
 * The config directory on this machine, resolved at call time so a change to
 * the environment is honoured rather than frozen at import.
 */
export function resolveConfigDir(): string {
  return configDirFor(process.platform, process.env, homedir());
}

/** Full path to the `auth.edn` this SDK reads and writes. */
export function getAuthFilePath(): string {
  return join(resolveConfigDir(), AUTH_FILE_NAME);
}

export interface AuthData {
  apiKey: string;
}

/**
 * Reads authentication data from flex-cli's auth.edn
 *
 * Returns null if file doesn't exist or is invalid
 */
export function readAuth(): AuthData | null {
  try {
    const authFile = getAuthFilePath();
    if (!existsSync(authFile)) {
      return null;
    }

    const content = readFileSync(authFile, 'utf-8');
    const parsed = edn.parse(content);

    // EDN keys are symbols, get :api-key
    const apiKeySymbol = edn.kw(':api-key');
    const apiKey = parsed.at(apiKeySymbol);

    if (typeof apiKey !== 'string') {
      return null;
    }

    return { apiKey };
  } catch (error) {
    return null;
  }
}

/**
 * Writes authentication data to flex-cli's auth.edn
 *
 * Format must match flex-cli exactly: {:api-key "..."}
 */
export function writeAuth(data: AuthData): void {
  const configDir = resolveConfigDir();

  // Ensure config directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Create EDN map with :api-key
  const authMap = new (edn as any).Map([edn.kw(':api-key'), data.apiKey]);
  const ednString = edn.encode(authMap);

  writeFileSync(join(configDir, AUTH_FILE_NAME), ednString, 'utf-8');
}

/**
 * Clears authentication data (deletes auth.edn file)
 */
export async function clearAuth(): Promise<void> {
  try {
    const authFile = getAuthFilePath();
    if (existsSync(authFile)) {
      const fs = await import('node:fs/promises');
      await fs.unlink(authFile);
    }
  } catch (error) {
    // Ignore errors if file doesn't exist
  }
}
