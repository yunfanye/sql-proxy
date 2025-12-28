#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, runSetup } from './setup';
import { SqlProxyServer } from './server';
import { createTunnel, TunnelInfo } from './tunnel';

const program = new Command();

program
  .name('sql-proxy')
  .description('A SQL proxy server that accepts SQL queries via HTTP and executes them against configured database backends')
  .version('1.0.0')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .option('-c, --config <path>', 'Path to database config file', 'database_config.json')
  .option('--public', 'Create a Cloudflare tunnel to expose the server to the public internet')
  .helpOption('-h, --help', 'Display help information')
  .addHelpText('after', `

Examples:
  $ npx @yunfanye/sql-proxy                    Start the server (runs setup if no config exists)
  $ npx @yunfanye/sql-proxy --port 8080        Start the server on port 8080
  $ npx @yunfanye/sql-proxy --public           Start server with public Cloudflare tunnel
  $ npx @yunfanye/sql-proxy --help             Show this help message

Configuration:
  The server reads configuration from database_config.json in the current directory.
  If the file doesn't exist, an interactive setup wizard will guide you through the configuration.

  Supported database engines:
    - postgresql  PostgreSQL database
    - mysql       MySQL database
    - snowsql     Snowflake data warehouse

  Example database_config.json for PostgreSQL/MySQL:
    {
      "db_engine": "postgresql",
      "disallowed_tables": ["users", "secrets"],
      "db_credentials": {
        "DB_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }

  Example database_config.json for Snowflake:
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

API Endpoints:
  GET  /health   Health check endpoint
  POST /query    Execute a SQL query (JSON body: { "sql": "SELECT ..." })
  GET  /tables   List all available tables

Public Access (--public):
  When using --public, the server creates a Cloudflare tunnel that exposes
  your local server to the public internet. A unique URL will be printed
  that can be accessed from anywhere. No Cloudflare account required.

Security:
  - Use disallowed_tables to prevent access to sensitive tables
  - The server validates SQL queries before execution
  - Access to disallowed tables will be rejected with a 403 error
`);

async function main(): Promise<void> {
  program.parse();
  const options = program.opts();

  const port = parseInt(options.port, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('Error: Port must be a number between 1 and 65535');
    process.exit(1);
  }

  // Load or create configuration
  let config = loadConfig();

  if (!config) {
    config = await runSetup();
  }

  // Create and start the server
  const server = new SqlProxyServer({ port, config });

  let tunnelInfo: TunnelInfo | null = null;

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');

    if (tunnelInfo) {
      console.log('Closing Cloudflare tunnel...');
      await tunnelInfo.stop();
    }

    await server.stop();
    console.log('Server stopped.');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await server.start();

    // Create tunnel if --public flag is set
    if (options.public) {
      tunnelInfo = await createTunnel(port);
      console.log('');
      console.log('='.repeat(60));
      console.log('PUBLIC URL (accessible from anywhere):');
      console.log(`  ${tunnelInfo.url}`);
      console.log('='.repeat(60));
      console.log('');
      console.log('Public endpoints:');
      console.log(`  GET  ${tunnelInfo.url}/health  - Health check`);
      console.log(`  POST ${tunnelInfo.url}/query   - Execute SQL query`);
      console.log(`  GET  ${tunnelInfo.url}/tables  - List tables`);
      console.log('');
    }
  } catch (error: any) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
