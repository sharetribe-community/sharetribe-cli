/**
 * Search command - manage search schemas
 */

import { Command } from 'commander';
import {
  listSearchSchemas as sdkListSearchSchemas,
  setSearchSchema as sdkSetSearchSchema,
  unsetSearchSchema as sdkUnsetSearchSchema,
} from 'sharetribe-flex-build-sdk';
import { printTable, printError } from '../../util/output.js';

interface SetSchemaOptions {
  key: string;
  scope: string;
  type: string;
  doc?: string;
  default?: string;
  schemaFor?: string;
}

interface UnsetSchemaOptions {
  key: string;
  scope: string;
  schemaFor?: string;
}

/**
 * Scope label mapping
 */
const SCOPE_LABELS: Record<string, string> = {
  metadata: 'Metadata',
  private: 'Private data',
  protected: 'Protected data',
  public: 'Public data',
};

/**
 * Sets a search schema field
 */
async function setSearchSchema(marketplace: string, opts: SetSchemaOptions): Promise<void> {
  try {
    await sdkSetSearchSchema(undefined, marketplace, {
      key: opts.key,
      scope: opts.scope,
      type: opts.type,
      doc: opts.doc,
      defaultValue: opts.default,
      schemaFor: opts.schemaFor,
    });

    const schemaFor = opts.schemaFor || 'listing';
    const scopeLabel = SCOPE_LABELS[opts.scope] || opts.scope;
    console.log(`${scopeLabel} schema, ${opts.key} is successfully set for ${schemaFor}.`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to set search schema');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Unsets a search schema field
 */
async function unsetSearchSchema(marketplace: string, opts: UnsetSchemaOptions): Promise<void> {
  try {
    await sdkUnsetSearchSchema(undefined, marketplace, {
      key: opts.key,
      scope: opts.scope,
      schemaFor: opts.schemaFor,
    });

    const schemaFor = opts.schemaFor || 'listing';
    const scopeLabel = SCOPE_LABELS[opts.scope] || opts.scope;
    console.log(`${scopeLabel} schema, ${opts.key} is successfully unset for ${schemaFor}.`);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to unset search schema');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Converts default value to display string
 */
function getDefaultValueLabel(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return String(value);
}

/**
 * Lists all search schemas
 */
async function listSearchSchemas(marketplace: string): Promise<void> {
  try {
    const schemas = await sdkListSearchSchemas(undefined, marketplace);

    // No schemas is not a special case: flex-cli passes its column list to
    // print-table, so an empty result still prints the header.
    // Map and sort the data (by schema-for, scope, key)
    const rows = schemas
      .map((s) => ({
        'Schema for': s.schemaFor,
        'Scope': s.scope,
        'Key': s.key,
        'Type': s.type,
        'Default value': getDefaultValueLabel(s.defaultValue),
        'Doc': s.doc || '',
      }))
      .sort((a, b) => {
        // Sort by schema-for, then scope, then key
        if (a['Schema for'] !== b['Schema for']) {
          return a['Schema for'].localeCompare(b['Schema for']);
        }
        if (a['Scope'] !== b['Scope']) {
          return a['Scope'].localeCompare(b['Scope']);
        }
        return a['Key'].localeCompare(b['Key']);
      });

    // Print table using flex-cli compatible formatting
    const headers = ['Schema for', 'Scope', 'Key', 'Type', 'Default value', 'Doc'];

    // One renderer for every table: search's own copy padded each column to
    // width then used a two space separator, which is the same bytes printTable
    // produces from width + 1 and a one space separator, but it missed the bold
    // header. flex-cli passes its column list here, so an empty result still
    // prints the header.
    printTable(headers, rows);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to list search schemas');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Registers search commands
 */
export function registerSearchCommands(program: Command): void {
  const searchCmd = program
    .command('search')
    .description('list all search schemas')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (options) => {
      const marketplace = options.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await listSearchSchemas(marketplace);
    });

  // search set
  searchCmd
    .command('set')
    .description('set search schema')
    .requiredOption('--key <KEY>', 'key name')
    .requiredOption(
      '--scope <SCOPE>',
      'extended data scope (either metadata or public for listing schema, metadata, private, protected or public for userProfile schema, metadata or protected for transaction schema)'
    )
    .requiredOption('--type <TYPE>', 'value type (either enum, multi-enum, boolean, long or text)')
    .option('--doc <DOC>', 'description of the schema')
    .option('--default <DEFAULT>', 'default value for search if value is not set')
    .option(
      '--schema-for <SCHEMA_FOR>',
      'Subject of the schema (either listing, userProfile or transaction, defaults to listing)'
    )
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await setSearchSchema(marketplace, {
        key: opts.key,
        scope: opts.scope,
        type: opts.type,
        doc: opts.doc,
        default: opts.default,
        schemaFor: opts.schemaFor,
      });
    });

  // search unset
  searchCmd
    .command('unset')
    .description('unset search schema')
    .requiredOption('--key <KEY>', 'key name')
    .requiredOption(
      '--scope <SCOPE>',
      'extended data scope (either metadata or public for listing schema, metadata, private, protected or public for userProfile schema, metadata or protected for transaction schema)'
    )
    .option(
      '--schema-for <SCHEMA_FOR>',
      'Subject of the schema (either listing, userProfile or transaction, defaults to listing)'
    )
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Error: --marketplace is required');
        process.exitCode = 1; return;
      }
      await unsetSearchSchema(marketplace, {
        key: opts.key,
        scope: opts.scope,
        schemaFor: opts.schemaFor,
      });
    });
}
