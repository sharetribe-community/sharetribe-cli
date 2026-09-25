/**
 * Events command - query marketplace events
 */

import { Command } from 'commander';
import { printTable, printTableContinuation, printError, type ColumnWidths } from '../../util/output.js';
import {
  queryEvents as sdkQueryEvents,
  pollEvents as sdkPollEvents,
  type EventData as SdkEventData
} from 'sharetribe-flex-build-sdk';

/** Event table columns, in flex-cli's order */
const EVENT_HEADERS = [
  'Seq ID',
  'Resource ID',
  'Event type',
  'Created at local time',
  'Source',
  'Actor',
];

interface EventsQueryOptions {
  resourceId?: string;
  relatedResourceId?: string;
  eventTypes?: string;
  sequenceId?: number;
  afterSeqId?: number;
  beforeSeqId?: number;
  afterTs?: string;
  beforeTs?: string;
  limit?: number;
  json?: boolean;
  jsonPretty?: boolean;
}

/**
 * Validates query parameters
 */
function validateParams(opts: EventsQueryOptions): void {
  const exclusiveParams = [
    opts.sequenceId !== undefined,
    opts.afterSeqId !== undefined,
    opts.beforeSeqId !== undefined,
    opts.afterTs !== undefined,
    opts.beforeTs !== undefined,
  ];

  if (exclusiveParams.filter(Boolean).length > 1) {
    throw new Error(
      'Only one of --seqid, --after-seqid, --before-seqid, --after-ts, or --before-ts can be specified'
    );
  }

  if (opts.resourceId && opts.relatedResourceId) {
    throw new Error('Only one of --resource or --related-resource can be specified');
  }
}

/**
 * Formats timestamp to match flex-cli format: YYYY-MM-DD H:MM:SS AM/PM
 */
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const timeString = date.toLocaleTimeString('en-US');

    return `${year}-${month}-${day} ${timeString}`;
  } catch {
    return timestamp;
  }
}

/**
 * Queries events from API
 */
async function queryEvents(
  marketplace: string,
  opts: EventsQueryOptions
): Promise<void> {
  try {
    validateParams(opts);

    const events = await sdkQueryEvents(
      undefined, // Use auth from file
      marketplace,
      {
        resourceId: opts.resourceId,
        relatedResourceId: opts.relatedResourceId,
        eventTypes: opts.eventTypes,
        sequenceId: opts.sequenceId,
        afterSeqId: opts.afterSeqId,
        beforeSeqId: opts.beforeSeqId,
        afterTs: opts.afterTs,
        beforeTs: opts.beforeTs,
        limit: opts.limit,
      }
    );

    // Output format. No events is not a special case: flex-cli prints the
    // header-only table, and nothing at all under --json or --json-pretty, so
    // that a parser reading the pipe never sees a prose line.
    if (opts.json) {
      for (const event of events) {
        // Exclude auditEmails to match flex-cli JSON format
        const { auditEmails, ...eventWithoutEmails } = event;
        console.log(JSON.stringify(eventWithoutEmails));
      }
    } else if (opts.jsonPretty) {
      for (const event of events) {
        // Exclude auditEmails to match flex-cli JSON format
        const { auditEmails, ...eventWithoutEmails } = event;
        console.log(JSON.stringify(eventWithoutEmails, null, 2));
      }
    } else {
      printTable(
        EVENT_HEADERS,
        events.map((event) => {
          const actor = event.auditEmails?.userEmail || event.auditEmails?.adminEmail || '';
          const source = event.source?.replace('source/', '') || '';

          return {
            'Seq ID': event.sequenceId.toString(),
            'Resource ID': event.resourceId,
            'Event type': event.eventType,
            'Created at local time': formatTimestamp(event.createdAt),
            'Source': source,
            'Actor': actor,
          };
        })
      );
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to query events');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Tails events (live streaming)
 */
async function tailEvents(
  marketplace: string,
  opts: EventsQueryOptions
): Promise<void> {
  try {
    validateParams(opts);

    console.log('Tailing events... Press Ctrl+C to stop');
    console.log('');

    let tailWidths: ColumnWidths | undefined;

    const stopPolling = sdkPollEvents(
      undefined, // Use auth from file
      marketplace,
      {
        resourceId: opts.resourceId,
        relatedResourceId: opts.relatedResourceId,
        eventTypes: opts.eventTypes,
        limit: opts.limit || 10,
      },
      (events: SdkEventData[]) => {
        // Output events
        if (opts.json) {
          for (const event of events) {
            // Exclude auditEmails to match flex-cli JSON format
            const { auditEmails, ...eventWithoutEmails } = event;
            console.log(JSON.stringify(eventWithoutEmails));
          }
        } else if (opts.jsonPretty) {
          for (const event of events) {
            // Exclude auditEmails to match flex-cli JSON format
            const { auditEmails, ...eventWithoutEmails } = event;
            console.log(JSON.stringify(eventWithoutEmails, null, 2));
          }
        } else {
          const rows = events.map((event) => {
            const actor = event.auditEmails?.userEmail || event.auditEmails?.adminEmail || '';
            const source = event.source?.replace('source/', '') || '';

            return {
              'Seq ID': event.sequenceId.toString(),
              'Resource ID': event.resourceId,
              'Event type': event.eventType,
              'Created at local time': formatTimestamp(event.createdAt),
              'Source': source,
              'Actor': actor,
            };
          });

          // flex-cli's polling loop prints the header once and every later
          // batch as a continuation, so the columns stay aligned and the
          // header does not repeat on each poll.
          if (tailWidths) {
            printTableContinuation(EVENT_HEADERS, tailWidths, rows);
          } else {
            tailWidths = printTable(EVENT_HEADERS, rows);
          }
        }
      },
      5000 // 5 second poll interval
    );

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('\nStopping tail...');
      stopPolling();
      process.exitCode = 0; return;
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      printError(error.message as string);
    } else {
      printError('Failed to tail events');
    }
    process.exitCode = 1; return;
  }
}

/**
 * Registers events command
 */
export function registerEventsCommand(program: Command): void {
  const cmd = program
    .command('events')
    .description('Get a list of events.')
    .option('--resource <RESOURCE_ID>', 'show events for specific resource ID')
    .option('--related-resource <RELATED_RESOURCE_ID>', 'show events related to specific resource ID')
    .option('--filter <EVENT_TYPES>', 'filter by event types (comma-separated)')
    .option('--seqid <SEQUENCE_ID>', 'get event with specific sequence ID', parseInt)
    .option('--after-seqid <SEQUENCE_ID>', 'show events after sequence ID (exclusive)', parseInt)
    .option('--before-seqid <SEQUENCE_ID>', 'show events before sequence ID (exclusive)', parseInt)
    .option('--after-ts <TIMESTAMP>', 'show events after timestamp')
    .option('--before-ts <TIMESTAMP>', 'show events before timestamp')
    .option('-l, --limit <NUMBER>', 'limit results (default: 100, max: 100)', parseInt)
    .option('--json', 'output as single-line JSON strings')
    .option('--json-pretty', 'output as indented multi-line JSON')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier');

  // Default action - query
  cmd.action(async (opts) => {
    const marketplace = opts.marketplace || program.opts().marketplace;
    if (!marketplace) {
      console.error('Could not parse arguments:');
      console.error('--marketplace is required');
      process.exitCode = 1; return;
    }

    await queryEvents(marketplace, {
      resourceId: opts.resource,
      relatedResourceId: opts.relatedResource,
      eventTypes: opts.filter,
      sequenceId: opts.seqid,
      afterSeqId: opts.afterSeqid,
      beforeSeqId: opts.beforeSeqid,
      afterTs: opts.afterTs,
      beforeTs: opts.beforeTs,
      limit: opts.limit || 100,
      json: opts.json,
      jsonPretty: opts.jsonPretty,
    });
  });

  // tail subcommand
  cmd
    .command('tail')
    .description('Tail events live as they happen')
    .option('--resource <RESOURCE_ID>', 'show events for specific resource ID')
    .option('--related-resource <RELATED_RESOURCE_ID>', 'show events related to specific resource ID')
    .option('--filter <EVENT_TYPES>', 'filter by event types (comma-separated)')
    .option('-l, --limit <NUMBER>', 'limit results per poll (default: 10, max: 100)', parseInt)
    .option('--json', 'output as single-line JSON strings')
    .option('--json-pretty', 'output as indented multi-line JSON')
    .option('-m, --marketplace <MARKETPLACE_ID>', 'marketplace identifier')
    .action(async (opts) => {
      const marketplace = opts.marketplace || program.opts().marketplace;
      if (!marketplace) {
        console.error('Could not parse arguments:');
        console.error('--marketplace is required');
        process.exitCode = 1; return;
      }

      await tailEvents(marketplace, {
        resourceId: opts.resource,
        relatedResourceId: opts.relatedResource,
        eventTypes: opts.filter,
        limit: opts.limit || 10,
        json: opts.json,
        jsonPretty: opts.jsonPretty,
      });
    });
}
