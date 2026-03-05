/**
 * Assets commands - manage marketplace assets
 */

import { Command } from 'commander';
import {
  pushAssets as sdkPushAssets,
  stageAsset as sdkStageAsset,
  getApiBaseUrl,
  readAuth,
} from 'sharetribe-flex-build-sdk';
import { printError } from '../../util/output.js';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  createWriteStream,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import * as http from 'node:http';
import * as https from 'node:https';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import chalk from 'chalk';
import edn from 'jsedn';
import yauzl from 'yauzl';


interface AssetMetadata {
  version: string;
  assets: Array<{ path: string; 'content-hash': string }>;
}

const ASSET_META_FILENAME = 'meta/asset-meta.edn';
const ASSETS_DIR = 'assets/';
const CLEAR_LINE = '\x1b[K';
const CARRIAGE_RETURN = '\r';

function parseAssetMetadataEdn(content: string): AssetMetadata | null {
  try {
    const parsed = edn.parse(content);
    const version = parsed.at(edn.kw(':version')) || parsed.at(edn.kw(':aliased-version'));
    const assets = parsed.at(edn.kw(':assets'));

    const assetList: Array<{ path: string; 'content-hash': string }> = [];
    if (assets && assets.val) {
      for (const asset of assets.val) {
        assetList.push({
          path: asset.at(edn.kw(':path')),
          'content-hash': asset.at(edn.kw(':content-hash')),
        });
      }
    }

    if (!version) {
      return null;
    }

    return { version, assets: assetList };
  } catch {
    return null;
  }
}

/**
 * Reads asset metadata from .flex-cli/asset-meta.edn
 */
function readAssetMetadata(basePath: string): AssetMetadata | null {
  const metaPath = join(basePath, '.flex-cli', 'asset-meta.edn');
  if (!existsSync(metaPath)) {
    return null;
  }

  try {
    const content = readFileSync(metaPath, 'utf-8');
    return parseAssetMetadataEdn(content);
  } catch {
    return null;
  }
}

/**
 * Writes asset metadata to .flex-cli/asset-meta.edn
 */
function writeAssetMetadata(basePath: string, metadata: AssetMetadata): void {
  const metaDir = join(basePath, '.flex-cli');
  if (!existsSync(metaDir)) {
    mkdirSync(metaDir, { recursive: true });
  }

  const assets = metadata.assets.map(a =>
    new edn.Map([
      edn.kw(':path'), a.path,
      edn.kw(':content-hash'), a['content-hash']
    ])
  );

  const ednMap = new edn.Map([
    edn.kw(':version'), metadata.version,
    edn.kw(':assets'), new edn.Vector(assets)
  ]);

  const metaPath = join(basePath, '.flex-cli', 'asset-meta.edn');
  writeFileSync(metaPath, edn.encode(ednMap), 'utf-8');
}

/**
 * Calculates SHA-1 hash of file content matching backend convention
 * Content is prefixed with `${byte-count}|` before hashing
 */
function calculateHash(data: Buffer): string {
  const prefix = Buffer.from(`${data.length}|`, 'utf-8');
  return createHash('sha1').update(prefix).update(data).digest('hex');
}

/**
 * Reads all assets from a directory
 */
function readLocalAssets(basePath: string): Array<{ path: string; data: Buffer; hash: string }> {
  const assets: Array<{ path: string; data: Buffer; hash: string }> = [];

  function scanDir(dir: string, relativePath: string = '') {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (entry === '.flex-cli') continue; // Skip metadata directory
      if (entry === '.DS_Store') continue; // Skip .DS_Store files

      const fullPath = join(dir, entry);
      const relPath = relativePath ? join(relativePath, entry) : entry;
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (stat.isFile()) {
        const data = readFileSync(fullPath);
        const hash = calculateHash(data);
        assets.push({ path: relPath, data, hash });
      }
    }
  }

  scanDir(basePath);
  return assets;
}

/**
 * Lists local asset paths without reading file data
 */
function listLocalAssetPaths(basePath: string): string[] {
  const assets: string[] = [];

  function scanDir(dir: string, relativePath: string = '') {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      if (entry === '.flex-cli') continue;
      if (entry === '.DS_Store') continue;

      const fullPath = join(dir, entry);
      const relPath = relativePath ? join(relativePath, entry) : entry;
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (stat.isFile()) {
        assets.push(relPath);
      }
    }
  }

  scanDir(basePath);
  return assets;
}

/**
 * Validates JSON files
 */
function validateJsonAssets(assets: Array<{ path: string; data: Buffer }>): void {
  for (const asset of assets) {
    if (asset.path.endsWith('.json')) {
      try {
        JSON.parse(asset.data.toString('utf-8'));
      } catch (error) {
        throw new Error(`Invalid JSON in ${asset.path}: ${error}`);
      }
    }
  }
}

function formatDownloadProgress(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${CARRIAGE_RETURN}${CLEAR_LINE}Downloaded ${mb.toFixed(2)}MB`;
}

function printDownloadProgress(stream: NodeJS.ReadableStream): void {
  let downloaded = 0;
  const printProgress = (): void => {
    process.stderr.write(formatDownloadProgress(downloaded));
  };
  const interval = setInterval(printProgress, 100);

  stream.on('data', (chunk: Buffer) => {
    downloaded += chunk.length;
  });

  stream.on('end', () => {
    clearInterval(interval);
    printProgress();
    process.stderr.write('\nFinished downloading assets\n');
  });
}

function getApiKeyOrThrow(): string {
  const auth = readAuth();
  if (!auth?.apiKey) {
    throw new Error('Not logged in. Please provide apiKey or run: sharetribe-community-cli login');
  }
  return auth.apiKey;
}

function getAssetsPullUrl(marketplace: string, version?: string): URL {
  const url = new URL(getApiBaseUrl() + '/assets/pull');
  url.searchParams.set('marketplace', marketplace);
  if (version) {
    url.searchParams.set('version', version);
  } else {
    url.searchParams.set('version-alias', 'latest');
  }
  return url;
}

function getErrorMessage(body: string, statusCode: number): string {
  try {
    const parsed = JSON.parse(body) as { errors?: Array<{ message?: string }> };
    const message = parsed.errors?.[0]?.message;
    if (message) {
      return message;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return body || `HTTP ${statusCode}`;
}

async function getAssetsZipStream(
  marketplace: string,
  version?: string
): Promise<http.IncomingMessage> {
  const url = getAssetsPullUrl(marketplace, version);
  const apiKey = getApiKeyOrThrow();
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          Authorization: `Apikey ${apiKey}`,
          Accept: 'application/zip',
        },
      },
      (res) => {
        const statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            reject(new Error(getErrorMessage(body, statusCode)));
          });
          return;
        }
        resolve(res);
      }
    );

    req.setTimeout(120000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function createTempZipPath(): string {
  return join(tmpdir(), `assets-${Date.now()}.zip`);
}

function removeAssetsDir(filename: string): string {
  if (filename.startsWith(ASSETS_DIR)) {
    return filename.slice(ASSETS_DIR.length);
  }
  return filename;
}

function readStreamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

async function unzipAssets(zipPath: string, basePath: string): Promise<AssetMetadata> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err || new Error('Failed to open zip file'));
        return;
      }

      let assetMeta: AssetMetadata | null = null;

      zipfile.on('error', reject);
      zipfile.on('end', () => {
        if (!assetMeta) {
          reject(new Error('Asset metadata not found in zip'));
          return;
        }
        resolve(assetMeta);
      });

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }

        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr || !readStream) {
            reject(streamErr || new Error('Failed to read zip entry'));
            return;
          }

          if (entry.fileName === ASSET_META_FILENAME) {
            readStreamToString(readStream)
              .then((content) => {
                assetMeta = parseAssetMetadataEdn(content);
                if (!assetMeta) {
                  reject(new Error('Invalid asset metadata'));
                  return;
                }
                zipfile.readEntry();
              })
              .catch(reject);
            return;
          }

          const assetPath = join(basePath, removeAssetsDir(entry.fileName));
          const assetDir = dirname(assetPath);
          if (!existsSync(assetDir)) {
            mkdirSync(assetDir, { recursive: true });
          }

          pipeline(readStream, createWriteStream(assetPath))
            .then(() => zipfile.readEntry())
            .catch(reject);
        });
      });
    });
  });
}

/**
 * Pulls assets from remote
 */
async function pullAssets(
  marketplace: string,
  path: string,
  version?: string,
  prune?: boolean
): Promise<void> {
  try {
    // Create directory if it doesn't exist
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }

    const stat = statSync(path);
    if (!stat.isDirectory()) {
      throw new Error(`${path} is not a directory`);
    }

    const localAssets = prune ? listLocalAssetPaths(path) : [];
    const currentMeta = readAssetMetadata(path);
    const tempZipPath = createTempZipPath();

    try {
      const zipStream = await getAssetsZipStream(marketplace, version);
      printDownloadProgress(zipStream);
      await pipeline(zipStream, createWriteStream(tempZipPath));

      const newAssetMeta = await unzipAssets(tempZipPath, path);
      const remoteVersion = newAssetMeta.version;

      const deletedPaths = prune
        ? new Set(localAssets.filter(p => !newAssetMeta.assets.some(a => a.path === p)))
        : new Set<string>();

      const updated = currentMeta?.version !== remoteVersion;
      const shouldReportUpdate = updated || deletedPaths.size > 0;

      if (deletedPaths.size > 0) {
        for (const assetPath of deletedPaths) {
          const fullPath = join(path, assetPath);
          if (existsSync(fullPath)) {
            unlinkSync(fullPath);
          }
        }
      }

      if (shouldReportUpdate) {
        writeAssetMetadata(path, {
          version: remoteVersion,
          assets: newAssetMeta.assets,
        });
        console.log(`Version ${remoteVersion} successfully pulled.`);
      } else {
        console.log('Assets are up to date.');
      }
    } finally {
      if (existsSync(tempZipPath)) {
        unlinkSync(tempZipPath);
      }
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to pull assets');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Filters assets to only those that have changed
 */
function filterChangedAssets(
  existingMeta: Array<{ path: string; 'content-hash': string }>,
  localAssets: Array<{ path: string; hash: string }>
): Array<{ path: string; data: Buffer; hash: string }> {
  const hashByPath = new Map(existingMeta.map(a => [a.path, a['content-hash']]));
  
  return localAssets.filter(asset => {
    const storedHash = hashByPath.get(asset.path);
    // Assets without stored metadata are treated as changed
    return !storedHash || storedHash !== asset.hash;
  });
}

/**
 * Pushes assets to remote
 */
async function pushAssets(
  marketplace: string,
  path: string,
  prune?: boolean
): Promise<void> {
  try {
    // Validate path
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      throw new Error(`${path} is not a valid directory`);
    }

    // Read current metadata
    const currentMeta = readAssetMetadata(path);
    const currentVersion = currentMeta?.version || 'nil';

    // Read local assets
    const localAssets = readLocalAssets(path);

    // Validate JSON files
    validateJsonAssets(localAssets);

    // Filter to only changed assets
    const changedAssets = filterChangedAssets(currentMeta?.assets || [], localAssets);

    // Separate JSON and non-JSON assets
    const isJsonAsset = (assetPath: string): boolean => {
      return assetPath.toLowerCase().endsWith('.json');
    };

    const stageableAssets = changedAssets.filter(a => !isJsonAsset(a.path));

    // Find assets to delete (if prune enabled)
    const localAssetMap = new Map(localAssets.map(a => [a.path, a]));
    const deleteOperations: Array<{ path: string; op: 'delete' }> = [];
    if (prune && currentMeta) {
      for (const currentAsset of currentMeta.assets) {
        if (!localAssetMap.has(currentAsset.path)) {
          deleteOperations.push({
            path: currentAsset.path,
            op: 'delete',
          });
        }
      }
    }

    // Check if there are any changes
    const noOps = changedAssets.length === 0 && deleteOperations.length === 0;
    if (noOps) {
      console.log('Assets are up to date.');
      return;
    }

    // Log changed assets
    if (changedAssets.length > 0) {
      const paths = changedAssets.map(a => a.path).join(', ');
      console.log(chalk.green(`Uploading changed assets: ${paths}`));
    }

    // Stage non-JSON assets
    const stagedByPath = new Map<string, string>();
    if (stageableAssets.length > 0) {
      const paths = stageableAssets.map(a => a.path).join(', ');
      console.log(chalk.green(`Staging assets: ${paths}`));

      for (const asset of stageableAssets) {
        try {
          const stagingResult = await sdkStageAsset(
            undefined,
            marketplace,
            asset.data,
            asset.path
          );
          stagedByPath.set(asset.path, stagingResult.stagingId);
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'asset-invalid-content') {
            const detail = 'message' in error ? error.message : 'The file is missing or uses an unsupported format.';
            throw new Error(`Failed to stage image ${asset.path}: ${detail}\nFix the file and rerun assets push to retry staging.`);
          }
          throw error;
        }
      }
    }

    // Build upsert operations
    const upsertOperations = changedAssets.map(asset => {
      const stagingId = stagedByPath.get(asset.path);
      return {
        path: asset.path,
        op: 'upsert' as const,
        ...(stagingId
          ? { stagingId }
          : { data: asset.data, filename: asset.path }),
      };
    });

    // Upload to API
    const result = await sdkPushAssets(
      undefined,
      marketplace,
      currentVersion,
      [...upsertOperations, ...deleteOperations]
    );

    // Update local metadata
    writeAssetMetadata(path, {
      version: result.version,
      assets: result.assets.map(a => ({
        path: a.path,
        'content-hash': a.contentHash,
      })),
    });

    console.log(`New version ${result.version} successfully created.`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to push assets');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Registers assets commands
 */
export function registerAssetsCommands(program: Command): void {
  const assetsCmd = program.command('assets').description('manage marketplace assets');

  // assets pull
  assetsCmd
    .command('pull')
    .description('pull assets from remote')
    .requiredOption('--path <PATH>', 'path to directory where assets will be stored')
    .option('--version <VERSION>', 'version of assets to pull')
    .option('--prune', 'delete local files no longer present as remote assets')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await pullAssets(marketplace, opts.path, opts.version, opts.prune);
    });

  // assets push
  assetsCmd
    .command('push')
    .description('push assets to remote')
    .requiredOption('--path <PATH>', 'path to directory with assets')
    .option('--prune', 'delete remote assets no longer present locally')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await pushAssets(marketplace, opts.path, opts.prune);
    });
}

export const __test__ = {
  formatDownloadProgress,
  removeAssetsDir,
  parseAssetMetadataEdn,
};
