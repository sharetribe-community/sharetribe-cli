/**
 * Process management functions
 *
 * Programmatic API for managing Sharetribe transaction processes
 */

import { apiGet, apiPost, apiPostMultipart, apiPostTransit, type MultipartField } from './api/client.js';
import { keyword, keywordMap } from './api/transit.js';

export interface ProcessListItem {
  name: string;
  version?: number;
}

export interface ProcessVersion {
  createdAt: string;
  version: number;
  aliases?: string[];
  transactionCount?: number;
}

export interface ProcessDetails {
  definition: string;
  version: number;
  name: string;
  emailTemplates?: Array<{
    name: string;
    html: string;
    subject: string;
  }>;
}

export interface CreateProcessResult {
  name: string;
  version: number;
}

export interface PushProcessResult {
  version?: number;
  noChanges?: boolean;
}

export interface AliasResult {
  alias: string;
  version: number;
}

/**
 * Lists all processes for a marketplace
 *
 * @param apiKey - Optional Sharetribe API key. If not provided, reads from flex-cli's auth.edn (see getAuthFilePath)
 * @param marketplace - Marketplace ID
 * @returns Array of processes with their latest versions
 */
export async function listProcesses(
  apiKey: string | undefined,
  marketplace: string
): Promise<ProcessListItem[]> {
  const response = await apiGet<{ data: Array<{ 'process/name': string; 'process/version'?: number }> }>(
    apiKey,
    '/processes/query',
    { marketplace }
  );

  return response.data.map(p => ({
    name: p['process/name'],
    version: p['process/version'],
  }));
}

/**
 * Lists all versions of a specific process
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name of the process
 * @returns Array of process versions
 */
export async function listProcessVersions(
  apiKey: string | undefined,
  marketplace: string,
  processName: string
): Promise<ProcessVersion[]> {
  const response = await apiGet<{
    data: Array<{
      'process/createdAt': string;
      'process/version': number;
      'process/aliases'?: string[];
      'process/transactionCount'?: number;
    }>;
  }>(
    apiKey,
    '/processes/query-versions',
    { marketplace, name: processName }
  );

  return response.data.map(v => ({
    createdAt: v['process/createdAt'],
    version: v['process/version'],
    aliases: v['process/aliases'],
    transactionCount: v['process/transactionCount'],
  }));
}

/**
 * Gets details of a specific process version
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name of the process
 * @param options - Optional version or alias to retrieve
 * @returns Process details including definition and templates
 */
export async function getProcess(
  apiKey: string | undefined,
  marketplace: string,
  processName: string,
  options?: { version?: string; alias?: string }
): Promise<ProcessDetails> {
  const queryParams: Record<string, string> = {
    marketplace,
    name: processName,
  };

  if (options?.version) {
    queryParams.version = options.version;
  } else if (options?.alias) {
    queryParams.alias = options.alias;
  }

  const response = await apiGet<{ data: any }>(apiKey, '/processes/show', queryParams);

  const emailTemplates = (response.data['process/emailTemplates'] || []).map((t: any) => ({
    name: t['emailTemplate/name'],
    html: t['emailTemplate/html'],
    subject: t['emailTemplate/subject'],
  }));

  return {
    definition: response.data['process/process'] || response.data.definition,
    version: response.data['process/version'] || response.data.version,
    name: response.data['process/name'] || processName,
    emailTemplates,
  };
}

/**
 * Creates a new transaction process
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name for the new process
 * @param definition - Process definition (EDN format)
 * @returns Created process details
 */
export async function createProcess(
  apiKey: string | undefined,
  marketplace: string,
  processName: string,
  definition: string
): Promise<CreateProcessResult> {
  const response = await apiPost<{ data: { 'process/name': string; 'process/version': number } }>(
    apiKey,
    '/processes/create',
    { marketplace },
    { name: processName, definition }
  );

  return {
    name: response.data['process/name'],
    version: response.data['process/version'],
  };
}

/**
 * Pushes a new version of an existing process
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name of the process
 * @param definition - Process definition (EDN format)
 * @param templates - Optional email templates
 * @returns Push result with version number
 */
export async function pushProcess(
  apiKey: string | undefined,
  marketplace: string,
  processName: string,
  definition: string,
  templates?: Array<{ name: string; html: string; subject: string }>
): Promise<PushProcessResult> {
  const fields: MultipartField[] = [
    { name: 'name', value: processName },
    { name: 'definition', value: definition },
  ];

  if (templates) {
    for (const template of templates) {
      fields.push({ name: `template-html-${template.name}`, value: template.html });
      fields.push({ name: `template-subject-${template.name}`, value: template.subject });
    }
  }

  const response = await apiPostMultipart<{ data: any; meta?: { result?: string } }>(
    apiKey,
    '/processes/create-version',
    { marketplace },
    fields
  );

  if (response.meta?.result === 'no-changes') {
    return { noChanges: true };
  }

  return {
    version: response.data['process/version'] || response.data.version,
  };
}

/**
 * Creates a process alias
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name of the process
 * @param version - Version number to point the alias to
 * @param alias - Alias name
 * @returns Created alias details
 */
export async function createAlias(
  apiKey: string | undefined,
  marketplace: string,
  processName: string,
  version: number,
  alias: string
): Promise<AliasResult> {
  const response = await apiPostTransit<{
    data: { 'processAlias/alias': string; 'processAlias/version': number };
  }>(
    apiKey,
    '/aliases/create-alias',
    { marketplace },
    keywordMap({
      name: keyword(processName),
      version,
      alias: keyword(alias),
    })
  );

  return {
    alias: response.data['processAlias/alias'],
    version: response.data['processAlias/version'],
  };
}

/**
 * Updates a process alias to point to a different version
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name of the process
 * @param version - Version number to point the alias to
 * @param alias - Alias name
 * @returns Updated alias details
 */
export async function updateAlias(
  apiKey: string | undefined,
  marketplace: string,
  processName: string,
  version: number,
  alias: string
): Promise<AliasResult> {
  const response = await apiPostTransit<{
    data: { 'processAlias/alias': string; 'processAlias/version': number };
  }>(
    apiKey,
    '/aliases/update-alias',
    { marketplace },
    keywordMap({
      name: keyword(processName),
      version,
      alias: keyword(alias),
    })
  );

  return {
    alias: response.data['processAlias/alias'],
    version: response.data['processAlias/version'],
  };
}

/**
 * Deletes a process alias
 *
 * @param apiKey - Sharetribe API key
 * @param marketplace - Marketplace ID
 * @param processName - Name of the process
 * @param alias - Alias name to delete
 * @returns Deleted alias name
 */
export async function deleteAlias(
  apiKey: string | undefined,
  marketplace: string,
  processName: string,
  alias: string
): Promise<{ alias: string }> {
  const response = await apiPostTransit<{ data: { 'processAlias/alias': string } }>(
    apiKey,
    '/aliases/delete-alias',
    { marketplace },
    keywordMap({
      name: keyword(processName),
      alias: keyword(alias),
    })
  );

  return {
    alias: response.data['processAlias/alias'],
  };
}
