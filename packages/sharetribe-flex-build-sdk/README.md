# Sharetribe Flex Build SDK

SDK for building and managing Sharetribe Flex transaction processes programmatically.

## Installation

```bash
npm install sharetribe-flex-build-sdk
```

## Features

- **Process Management**: Programmatic API for all process commands (list, create, push, pull, aliases)
- **API Client Functions**: Make authenticated API calls to Sharetribe Build API
- **Transit Support**: Full support for Transit format encoding/decoding
- **EDN Parser**: Parse and serialize process.edn files
- **HTTP Client**: Pure Node.js HTTP client (no external dependencies except transit-js/jsedn)
- **TypeScript**: Full type definitions included
- **1-to-1 with CLI**: Functions match CLI command capabilities exactly

## Quick Start

The SDK provides programmatic access to all CLI capabilities:

```typescript
import {
  listProcesses,
  getProcess,
  createProcess,
  pushProcess,
  createAlias
} from 'sharetribe-flex-build-sdk';

const apiKey = 'your-api-key';
const marketplace = 'your-marketplace-id';

// List all processes
const processes = await listProcesses(apiKey, marketplace);

// Get a specific process
const process = await getProcess(apiKey, marketplace, 'my-process');

// Create new process
await createProcess(apiKey, marketplace, 'new-process', ednDefinition);

// Push an update
await pushProcess(apiKey, marketplace, 'my-process', updatedDefinition, templates);

// Create alias
await createAlias(apiKey, marketplace, 'my-process', 1, 'release');
```

## Usage

### Process Management (CLI Equivalents)

```typescript
import {
  listProcesses,
  listProcessVersions,
  getProcess,
  createProcess,
  pushProcess,
  createAlias,
  updateAlias,
  deleteAlias
} from 'sharetribe-flex-build-sdk';

// List processes (flex-cli: process list)
const processes = await listProcesses(apiKey, marketplace);
// Returns: [{ name: 'instant-booking', version: 3 }, ...]

// List versions (flex-cli: process list --process my-process)
const versions = await listProcessVersions(apiKey, marketplace, 'my-process');
// Returns: [{ version: 1, createdAt: '...', aliases: ['release'], transactionCount: 42 }, ...]

// Get process details (flex-cli: process pull)
const details = await getProcess(apiKey, marketplace, 'my-process', { version: '2' });
// Returns: { definition: '...', version: 2, emailTemplates: [...] }

// Create process (flex-cli: process create)
const result = await createProcess(apiKey, marketplace, 'new-process', ednText, templates);
// Returns: { name: 'new-process', version: 1 }

// Push update (flex-cli: process push)
const pushResult = await pushProcess(apiKey, marketplace, 'my-process', ednText, templates);
// Returns: { version: 2 } or { noChanges: true }

// Manage aliases (flex-cli: process create-alias, update-alias)
await createAlias(apiKey, marketplace, 'my-process', 1, 'release');
await updateAlias(apiKey, marketplace, 'my-process', 2, 'release');
await deleteAlias(apiKey, marketplace, 'my-process', 'release');
```

`createProcess` and `pushProcess` both take `ednText`, the process.edn file's own text, and both
send it as multipart along with the email templates. Read the text with `fs.readFileSync`; do not
build it with `serializeProcess`, which is lossy (see below).

### Deploying a Process

The SDK is one function per Build API endpoint and deliberately ships no `deployProcess`
orchestrator. Compose the primitives instead. `listProcessVersions` is what decides create versus
push, and the same response tells you whether the alias already exists, because aliases sit on the
versions they point at:

```typescript
import {
  listProcessVersions,
  createProcess,
  pushProcess,
  createAlias,
  updateAlias,
} from 'sharetribe-flex-build-sdk';

let versions;
try {
  versions = await listProcessVersions(apiKey, marketplace, processName);
} catch (error) {
  // The Build API answers an unknown process with this code, and only this code.
  if (error.code !== 'tx-process-not-found') throw error;
  versions = null;
}

if (versions === null) {
  const created = await createProcess(apiKey, marketplace, processName, ednText, templates);
  await createAlias(apiKey, marketplace, processName, created.version, alias);
} else {
  const aliasExists = versions.some((v) => v.aliases?.includes(alias));
  const pushed = await pushProcess(apiKey, marketplace, processName, ednText, templates);
  // A push with nothing to change returns no version; the alias then targets the latest one.
  const version = pushed.version ?? Math.max(...versions.map((v) => v.version));
  const pointAlias = aliasExists ? updateAlias : createAlias;
  await pointAlias(apiKey, marketplace, processName, version, alias);
}
```

Do not branch on a caught create or alias failure instead. The API's codes are
`tx-process-already-exists` for a duplicate process and `alias-not-found` for a missing alias, and
`getProcess` cannot tell "no such process" from "no such alias". The `listProcessVersions` read is
the only one that answers both questions in a single call, and you keep its version list.

### Parse EDN Process Files

```typescript
import { parseProcessFile, serializeProcess } from 'sharetribe-flex-build-sdk';

// Parse a process.edn file
const process = parseProcessFile('./ext/transaction-processes/default-booking/process.edn');
console.log(process.name, process.states, process.transitions);
```

Sharetribe's process files declare neither `:name` nor `:states`, so `parseProcessFile` takes the name from the directory holding the file and derives the states from the transitions' `:from` and `:to`. Keywords come back with their namespace and without the leading colon, so a transition is `transition/accept` and an action is `action/privileged-set-line-items`. `from` and `actor` are absent on the transitions that have no `:from` or no `:actor`, which is every initial transition and every time-based one.

```typescript
// Serialize back to EDN format
const ednString = serializeProcess(process);
```

`serializeProcess` writes a simplified EDN form that keeps only the names: it drops `:privileged?`, action configs, `:at` and everything else a real process carries. Do not push its output to a marketplace. To deploy a process, push the file's own text.

### Make API Calls

```typescript
import { apiGet, apiPost, apiPostTransit } from 'sharetribe-flex-build-sdk';

const apiKey = 'your-api-key';
const marketplace = 'your-marketplace-id';

// List processes
const response = await apiGet(apiKey, '/processes/query', { marketplace });

// Create a process
await apiPost(apiKey, '/processes/create', { marketplace }, {
  process: 'my-process-name'
});

// Push a process update (Transit format)
await apiPostTransit(apiKey, '/processes/update',
  { marketplace, process: 'my-process' },
  processData
);
```

### Transit Utilities

```typescript
import { encodeTransit, decodeTransit, keyword, keywordMap } from 'sharetribe-flex-build-sdk';

// Create Transit keywords (Clojure-style)
const processName = keyword('instant-booking');

// Create Transit maps with keyword keys
const transitMap = keywordMap({
  name: keyword('my-process'),
  version: 1
});

// Encode/decode Transit format
const encoded = encodeTransit(transitMap);
const decoded = decodeTransit(encoded);
```

### Type Definitions

```typescript
import type {
  ProcessDefinition,
  ProcessState,
  ProcessTransition,
  ProcessNotification,
  ApiError,
  HttpResponse
} from 'sharetribe-flex-build-sdk';
```

## API Reference

### API Functions

- `apiGet(apiKey, endpoint, queryParams?)` - Make GET request
- `apiPost(apiKey, endpoint, queryParams?, body?)` - Make POST request
- `apiDelete(apiKey, endpoint, queryParams?)` - Make DELETE request
- `apiPostMultipart(apiKey, endpoint, queryParams, fields)` - Make multipart POST
- `apiPostTransit(apiKey, endpoint, queryParams, body)` - Make Transit-encoded POST

### EDN Functions

- `parseProcessFile(filePath)` - Parse process.edn file
- `serializeProcess(process)` - Serialize to EDN format

### Transit Functions

- `encodeTransit(data)` - Encode to Transit JSON
- `decodeTransit(transitString)` - Decode from Transit JSON
- `keyword(name)` - Create Transit keyword
- `keywordMap(obj)` - Create Transit map with keyword keys

### HTTP Functions

- `request(url, options)` - Low-level HTTP request
- `get(url, headers?)` - HTTP GET
- `post(url, data, headers?)` - HTTP POST with JSON
- `postTransit(url, body, headers?)` - HTTP POST with Transit
- `del(url, headers?)` - HTTP DELETE

## CLI vs SDK

The SDK provides programmatic access to CLI capabilities:

| CLI Command | SDK Function |
|-------------|--------------|
| `process list` | `listProcesses()` |
| `process list --process NAME` | `listProcessVersions()` |
| `process pull` | `getProcess()` |
| `process create` | `createProcess()` |
| `process push` | `pushProcess()` |
| `process create-alias` | `createAlias()` |
| `process update-alias` | `updateAlias()` |
| `process delete-alias` | `deleteAlias()` |

**Note**: The SDK focuses on process management (the core functionality). The CLI includes additional commands (search, assets, notifications, listing-approval, stripe, events) which use the lower-level API client functions exported by this SDK. Future versions may add higher-level wrappers for these commands.

## Related Packages

- [sharetribe-community-cli](https://www.npmjs.com/package/sharetribe-community-cli) - Command-line interface that depends on this SDK

## Version Relationship

- The CLI and SDK versions are kept in sync (1-to-1 relationship)
- Both packages are maintained in the same [monorepo](https://github.com/sharetribe-community/sharetribe-cli)

## License

Apache-2.0
