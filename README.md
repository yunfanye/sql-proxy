# @yunfanye/sql-proxy

A lightweight SQL proxy server that accepts SQL queries via HTTP and executes them against configured database backends. Supports PostgreSQL, MySQL, and Snowflake.

## Features

- **Multi-database support**: Connect to PostgreSQL, MySQL, or Snowflake
- **HTTP API**: Execute SQL queries via simple HTTP requests
- **Table access control**: Configure disallowed tables to prevent access to sensitive data
- **SQL validation**: Parses and validates SQL queries before execution
- **Interactive setup**: Guided configuration wizard when no config file exists
- **Zero configuration start**: Just run `npx @yunfanye/sql-proxy` to get started
- **Public access**: Expose your server to the internet via Cloudflare tunnel with `--public`

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

### Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `db_engine` | string | Yes | Database engine: `postgresql`, `mysql`, or `snowsql` |
| `disallowed_tables` | string[] | No | List of table names that cannot be queried |
| `db_credentials` | object | Yes | Database connection credentials |

## CLI Options

```bash
npx @yunfanye/sql-proxy [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Port to run the server on | 3000 |
| `-c, --config <path>` | Path to database config file | database_config.json |
| `--public` | Create a Cloudflare tunnel for public access | - |
| `-h, --help` | Display help information | - |
| `-V, --version` | Display version number | - |

### Examples

```bash
# Start with default settings
npx @yunfanye/sql-proxy

# Start on a custom port
npx @yunfanye/sql-proxy --port 8080

# Start with public internet access
npx @yunfanye/sql-proxy --public

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

### Table Access Control

Use the `disallowed_tables` configuration to prevent access to sensitive tables:

```json
{
  "db_engine": "postgresql",
  "disallowed_tables": ["users", "passwords", "api_keys", "secrets"],
  "db_credentials": {
    "DB_URL": "postgresql://user:password@localhost:5432/mydb"
  }
}
```

When a query attempts to access a disallowed table, it will be rejected with a 403 error before reaching the database.

### SQL Parsing

All SQL queries are parsed using [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) to:

- Extract table names from the query
- Validate against the disallowed tables list
- Detect malformed SQL before execution

## Public Access with Cloudflare Tunnel

Use the `--public` flag to expose your local server to the internet via a Cloudflare tunnel:

```bash
npx @yunfanye/sql-proxy --public
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

You can also use sql-proxy as a library:

```typescript
import { SqlProxyServer, loadConfig } from '@yunfanye/sql-proxy';

const config = loadConfig();
if (config) {
  const server = new SqlProxyServer({ port: 3000, config });
  await server.start();
}
```

## Requirements

- Node.js >= 16.0.0

## License

MIT

## Contributing

Issues and pull requests are welcome at [https://github.com/yunfanye/sql-proxy](https://github.com/yunfanye/sql-proxy).
