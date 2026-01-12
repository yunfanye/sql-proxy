# @yunfanye/sql-proxy

A lightweight SQL proxy server that accepts SQL queries via HTTP and executes them against configured database backends. Supports PostgreSQL, MySQL, and Snowflake.

## Features

- **Multi-database support**: Connect to PostgreSQL, MySQL, Snowflake, or another sql-proxy instance
- **HTTP API**: Execute SQL queries via simple HTTP requests
- **Read-only by default**: Only SELECT queries allowed unless `--allow-write` is specified
- **Table access control**: Configure disallowed tables to prevent access to sensitive data
- **SQL validation**: Parses and validates SQL queries before execution
- **Query logging**: All SQL queries are logged to the console with timestamps
- **Interactive setup**: Guided configuration wizard when no config file exists
- **Zero configuration start**: Just run `npx @yunfanye/sql-proxy` to get started
- **Cloudflare Tunnel**: Expose your server to the internet via Cloudflare tunnel with `--tunnel`
- **Authentication**: Optional Bearer token authentication with `--auth-token`

## Installation

### Using npx (recommended)

```bash
npx @yunfanye/sql-proxy
```

### Global installation

```bash
npm install -g @yunfanye/sql-proxy
sql-proxy
```

### Local installation

```bash
npm install @yunfanye/sql-proxy
npx sql-proxy
```

## Quick Start

1. Run the proxy server:

```bash
npx @yunfanye/sql-proxy
```

2. If no `database_config.json` exists, the setup wizard will guide you through configuration.

3. Once running, execute SQL queries via HTTP:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM my_table LIMIT 10"}'
```

## Configuration

The server reads configuration from `database_config.json` in the current working directory.

### PostgreSQL / MySQL

```json
{
  "db_engine": "postgresql",
  "allowed_tables": ["products", "orders"],
  "disallowed_tables": ["users", "secrets"],
  "db_credentials": {
    "DB_URL": "postgresql://user:password@localhost:5432/mydb"
  }
}
```

### Snowflake

```json
{
  "db_engine": "snowsql",
  "allowed_tables": [],
  "disallowed_tables": [],
  "db_credentials": {
    "SNOWSQL_ACCOUNT": "abc123.us-east-1",
    "SNOWSQL_USER": "myuser",
    "SNOWSQL_PWD": "mypassword",
    "SNOWSQL_WH": "COMPUTE_WH",
    "SNOWSQL_DB": "MYDB",
    "SNOWSQL_SCHEMA": "PUBLIC"
  }
}
```

### SQL Proxy (Chaining)

Connect to another sql-proxy instance for chaining proxies or accessing remote databases through a proxy:

```json
{
  "db_engine": "sql-proxy",
  "allowed_tables": [],
  "disallowed_tables": [],
  "db_credentials": {
    "DB_URL": "http://localhost:3001",
    "AUTH_TOKEN": "secret-token"
  }
}
```

The `AUTH_TOKEN` is optional. If provided, it will be sent as a `Authorization: Bearer <token>` header when connecting to the upstream sql-proxy server.

### Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `db_engine` | string | Yes | Database engine: `postgresql`, `mysql`, `snowsql`, or `sql-proxy` |
| `allowed_tables` | string[] | No | List of table names that can be queried (allowlist). If set, takes priority over `disallowed_tables` |
| `disallowed_tables` | string[] | No | List of table names that cannot be queried (blocklist) |
| `db_credentials` | object | Yes | Database connection credentials |

## CLI Options

```bash
npx @yunfanye/sql-proxy [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Port to run the server on | 3000 |
| `-c, --config <path>` | Path to database config file | database_config.json |
| `--allow-write` | Allow write operations (INSERT, UPDATE, DELETE, etc.) | Read-only |
| `--auth-token <token>` | Require Bearer token authentication for all requests | Disabled |
| `--tunnel` | Create a Cloudflare tunnel for public access | - |
| `-h, --help` | Display help information | - |
| `-V, --version` | Display version number | - |

### Examples

```bash
# Start in read-only mode (default)
npx @yunfanye/sql-proxy

# Start on a custom port
npx @yunfanye/sql-proxy --port 8080

# Start with write operations enabled
npx @yunfanye/sql-proxy --allow-write

# Start with public internet access
npx @yunfanye/sql-proxy --tunnel

# Start with authentication required
npx @yunfanye/sql-proxy --auth-token mysecrettoken

# Combine options
npx @yunfanye/sql-proxy --port 8080 --allow-write --tunnel --auth-token mysecrettoken

# Display help
npx @yunfanye/sql-proxy --help
```

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "db_engine": "postgresql"
}
```

### POST /query

Execute a SQL query.

**Request (JSON):**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM products LIMIT 5"}'
```

**Request (Plain text):**
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: text/plain" \
  -d 'SELECT * FROM products LIMIT 5'
```

**Success Response:**
```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "Product A"},
    {"id": 2, "name": "Product B"}
  ],
  "rowCount": 2
}
```

**Error Response (Disallowed table):**
```json
{
  "success": false,
  "error": "Access to table(s) denied: users",
  "disallowed_tables": ["users"]
}
```

### GET /tables

List all available tables in the database.

**Response:**
```json
{
  "success": true,
  "tables": ["products", "orders", "categories"],
  "disallowed_tables": ["users", "secrets"]
}
```

## Security Features

### Authentication

Use the `--auth-token` flag to require authentication for all API requests:

```bash
npx @yunfanye/sql-proxy --auth-token mysecrettoken
```

When authentication is enabled, all requests must include the `Authorization` header with the Bearer token:

```bash
curl -X POST http://localhost:3000/query \
  -H "Authorization: Bearer mysecrettoken" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM products"}'
```

**Error Response (Missing or invalid token):**
```json
{
  "success": false,
  "error": "Missing or invalid Authorization header. Expected: Bearer <token>"
}
```

### Read-Only Mode (Default)

By default, the server runs in read-only mode, only allowing SELECT queries. This prevents accidental or malicious data modifications.

To enable write operations (INSERT, UPDATE, DELETE, CREATE, DROP, etc.), use the `--allow-write` flag:

```bash
npx @yunfanye/sql-proxy --allow-write
```

**Error Response (Write operation in read-only mode):**
```json
{
  "success": false,
  "error": "Write operations are not allowed. Server is running in read-only mode. Use --allow-write to enable write operations."
}
```

### Table Access Control

You can control which tables are accessible using either an **allowlist** or **blocklist** approach:

#### Allowlist (allowed_tables)

Use `allowed_tables` to specify exactly which tables can be queried. All other tables will be blocked:

```json
{
  "db_engine": "postgresql",
  "allowed_tables": ["products", "categories", "orders"],
  "db_credentials": {
    "DB_URL": "postgresql://user:password@localhost:5432/mydb"
  }
}
```

#### Blocklist (disallowed_tables)

Use `disallowed_tables` to block specific sensitive tables while allowing all others:

```json
{
  "db_engine": "postgresql",
  "disallowed_tables": ["users", "passwords", "api_keys", "secrets"],
  "db_credentials": {
    "DB_URL": "postgresql://user:password@localhost:5432/mydb"
  }
}
```

**Priority:** If both `allowed_tables` and `disallowed_tables` are configured, `allowed_tables` takes priority and `disallowed_tables` is ignored.

When a query attempts to access a restricted table, it will be rejected with a 403 error before reaching the database.

### SQL Parsing

All SQL queries are parsed using [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) to:

- Extract table names from the query
- Validate against the allowed/disallowed tables list
- Detect malformed SQL before execution

### Query Logging

All SQL queries are logged to the console with timestamps for auditing and debugging:

```
[2025-01-15T10:30:45.123Z] POST /query
[2025-01-15T10:30:45.125Z] SQL: SELECT * FROM products WHERE id = 1
[2025-01-15T10:30:46.456Z] POST /query
[2025-01-15T10:30:46.458Z] SQL: UPDATE products SET price = 29.99 WHERE id = 1
```

## Cloudflare Tunnel

Use the `--tunnel` flag to expose your local server to the internet via a Cloudflare tunnel:

```bash
npx @yunfanye/sql-proxy --tunnel
```

This will:
1. Start the local SQL proxy server
2. Create a secure Cloudflare tunnel
3. Print a public URL (e.g., `https://random-name.trycloudflare.com`)

**Output example:**
```
SQL Proxy Server running on http://localhost:3000

============================================================
PUBLIC URL (accessible from anywhere):
  https://example-tunnel.trycloudflare.com
============================================================

Public endpoints:
  GET  https://example-tunnel.trycloudflare.com/health  - Health check
  POST https://example-tunnel.trycloudflare.com/query   - Execute SQL query
  GET  https://example-tunnel.trycloudflare.com/tables  - List tables
```

**Notes:**
- No Cloudflare account required
- The tunnel URL changes each time you restart the server
- The tunnel is automatically closed when you stop the server

## Programmatic Usage

You can also use sql-proxy as a library.

### Using DatabaseClient (Recommended)

The `DatabaseClient` class is the recommended way to interact with databases programmatically. It combines connection management, query validation, and execution into a single, easy-to-use class.

```typescript
import { DatabaseClient, DatabaseConfig } from '@yunfanye/sql-proxy';

// Create configuration
const config: DatabaseConfig = {
  db_engine: 'postgresql',
  allowed_tables: ['products', 'categories'],  // Only these tables can be queried
  disallowed_tables: ['users', 'secrets'],     // Ignored when allowed_tables is set
  db_credentials: {
    DB_URL: 'postgresql://user:password@localhost:5432/mydb'
  }
};

// Create client (allowWrite defaults to false)
const client = new DatabaseClient({
  config,
  allowWrite: false  // Optional: set to true to allow INSERT, UPDATE, DELETE, etc.
});

// Connect to the database
await client.connect();

// Validate and execute a query
const result = await client.validateAndExecuteQuery('SELECT * FROM products LIMIT 10');

if (result.success) {
  console.log('Data:', result.data);
  console.log('Row count:', result.rowCount);
} else {
  console.error('Error:', result.error);
  // If validation failed, details are in result.validation
  if (result.validation?.allowedTables) {
    console.error('Tables not in allowed list:', result.validation.allowedTables);
  }
  if (result.validation?.disallowedTables) {
    console.error('Disallowed tables:', result.validation.disallowedTables);
  }
}

// List available tables
const tables = await client.listTables();
console.log('Tables:', tables);

// Get client info
console.log('DB Engine:', client.getDbEngine());
console.log('Write allowed:', client.isWriteAllowed());
console.log('Allowed tables:', client.getAllowedTables());
console.log('Disallowed tables:', client.getDisallowedTables());

// Disconnect when done
await client.disconnect();
```

#### DatabaseClient API

```typescript
interface DatabaseClientOptions {
  config: DatabaseConfig;
  allowWrite?: boolean;  // Default: false
}

class DatabaseClient {
  constructor(options: DatabaseClientOptions);

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Query execution
  validateAndExecuteQuery(sql: string): Promise<ExecuteResult>;

  // Table operations
  listTables(): Promise<string[]>;

  // Configuration info
  getDbEngine(): string;
  isWriteAllowed(): boolean;
  getAllowedTables(): string[];
  getDisallowedTables(): string[];
}

interface ExecuteResult {
  success: boolean;
  data?: any[];
  error?: string;
  rowCount?: number;
  validation?: ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  tables: string[];
  error?: string;
  allowedTables?: string[];    // Tables not in allowed list (when using allowlist)
  disallowedTables?: string[]; // Tables in disallowed list (when using blocklist)
  isReadOnly?: boolean;
}
```

### Using SqlProxyServer

To start a full HTTP server programmatically:

```typescript
import { SqlProxyServer, loadConfig } from '@yunfanye/sql-proxy';

const config = loadConfig();
if (config) {
  const server = new SqlProxyServer({ port: 3000, config });
  await server.start();
}
```

### DatabaseConfig Types

```typescript
type DbEngine = 'postgresql' | 'mysql' | 'snowsql' | 'sql-proxy';

interface StandardCredentials {
  DB_URL: string;
  AUTH_TOKEN?: string;  // For sql-proxy chaining
}

interface SnowflakeCredentials {
  SNOWSQL_ACCOUNT: string;
  SNOWSQL_USER: string;
  SNOWSQL_PWD: string;
  SNOWSQL_WH: string;
  SNOWSQL_DB: string;
  SNOWSQL_SCHEMA: string;
}

interface DatabaseConfig {
  db_engine: DbEngine;
  allowed_tables?: string[];    // Allowlist (takes priority if set)
  disallowed_tables?: string[]; // Blocklist
  db_credentials: StandardCredentials | SnowflakeCredentials;
}
```

#### Configuration Examples

```typescript
// PostgreSQL or MySQL with allowlist
const postgresConfig: DatabaseConfig = {
  db_engine: 'postgresql', // or 'mysql'
  allowed_tables: ['products', 'categories'],  // Only these tables accessible
  db_credentials: {
    DB_URL: 'postgresql://user:password@localhost:5432/mydb'
  }
};

// PostgreSQL or MySQL with blocklist
const postgresBlocklistConfig: DatabaseConfig = {
  db_engine: 'postgresql',
  disallowed_tables: ['users', 'secrets'],  // These tables blocked
  db_credentials: {
    DB_URL: 'postgresql://user:password@localhost:5432/mydb'
  }
};

// Snowflake
const snowflakeConfig: DatabaseConfig = {
  db_engine: 'snowsql',
  allowed_tables: [],
  disallowed_tables: [],
  db_credentials: {
    SNOWSQL_ACCOUNT: 'abc123.us-east-1',
    SNOWSQL_USER: 'myuser',
    SNOWSQL_PWD: 'mypassword',
    SNOWSQL_WH: 'COMPUTE_WH',
    SNOWSQL_DB: 'MYDB',
    SNOWSQL_SCHEMA: 'PUBLIC'
  }
};

// SQL Proxy (chaining to another sql-proxy instance)
const sqlProxyConfig: DatabaseConfig = {
  db_engine: 'sql-proxy',
  allowed_tables: [],
  disallowed_tables: [],
  db_credentials: {
    DB_URL: 'http://localhost:3001',
    AUTH_TOKEN: 'secret-token'  // Optional: for authenticated upstream
  }
};
```

### Using Low-Level Connectors

For advanced use cases where you need direct database access without validation, you can use the connector classes directly:

```typescript
import {
  createConnector,
  PostgreSQLConnector,
  MySQLConnector,
  SnowflakeConnector,
  SqlProxyConnector
} from '@yunfanye/sql-proxy';

// Using factory function
const connector = createConnector(config);
await connector.connect();
const result = await connector.executeQuery('SELECT * FROM products');
await connector.disconnect();

// Or use specific connector classes directly
const pgConnector = new PostgreSQLConnector({
  DB_URL: 'postgresql://user:pass@localhost:5432/mydb'
});
```

> **Note**: When using connectors directly, queries are NOT validated against disallowed tables or read-only mode. Use `DatabaseClient` for validated query execution.

## Requirements

- Node.js >= 16.0.0

## License

MIT

## Contributing

Issues and pull requests are welcome at [https://github.com/yunfanye/sql-proxy](https://github.com/yunfanye/sql-proxy).
