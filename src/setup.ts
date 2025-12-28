import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import snowflake from 'snowflake-sdk';
import { DatabaseConfig, DbEngine, SnowflakeCredentials, StandardCredentials } from './types';

// Helper to create a temporary Snowflake connection for querying options
function createSnowflakeConnection(options: {
  account: string;
  username: string;
  password: string;
  warehouse?: string;
  database?: string;
}): Promise<snowflake.Connection> {
  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection({
      account: options.account,
      username: options.username,
      password: options.password,
      warehouse: options.warehouse,
      database: options.database,
    });

    connection.connect((err) => {
      if (err) {
        reject(new Error(`Failed to connect to Snowflake: ${err.message}`));
      } else {
        resolve(connection);
      }
    });
  });
}

// Helper to execute a query on Snowflake connection
function executeSnowflakeQuery(connection: snowflake.Connection, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(new Error(`Query failed: ${err.message}`));
        } else {
          resolve(rows || []);
        }
      },
    });
  });
}

// Helper to destroy Snowflake connection
function destroySnowflakeConnection(connection: snowflake.Connection): Promise<void> {
  return new Promise((resolve) => {
    connection.destroy((err) => {
      resolve();
    });
  });
}

const CONFIG_FILE = 'database_config.json';

export async function runSetup(): Promise<DatabaseConfig> {
  console.log('\n🔧 SQL Proxy Setup Wizard\n');
  console.log('No database_config.json found. Let\'s set up your database connection.\n');

  const { dbEngine } = await inquirer.prompt<{ dbEngine: DbEngine }>([
    {
      type: 'list',
      name: 'dbEngine',
      message: 'Select your database engine:',
      choices: [
        { name: 'PostgreSQL', value: 'postgresql' },
        { name: 'MySQL', value: 'mysql' },
        { name: 'Snowflake (snowsql)', value: 'snowsql' },
      ],
    },
  ]);

  let credentials: SnowflakeCredentials | StandardCredentials;

  if (dbEngine === 'snowsql') {
    // Step 1: Get account, username, and password
    const authAnswers = await inquirer.prompt<{
      SNOWSQL_ACCOUNT: string;
      SNOWSQL_USER: string;
      SNOWSQL_PWD: string;
    }>([
      {
        type: 'input',
        name: 'SNOWSQL_ACCOUNT',
        message: 'Snowflake Account (e.g., abc123.us-east-1):',
        validate: (input) => input.length > 0 || 'Account is required',
      },
      {
        type: 'input',
        name: 'SNOWSQL_USER',
        message: 'Snowflake Username:',
        validate: (input) => input.length > 0 || 'Username is required',
      },
      {
        type: 'password',
        name: 'SNOWSQL_PWD',
        message: 'Snowflake Password:',
        mask: '*',
        validate: (input) => input.length > 0 || 'Password is required',
      },
    ]);

    // Step 2: Connect and fetch warehouses
    console.log('\nConnecting to Snowflake...');
    let connection: snowflake.Connection;
    try {
      connection = await createSnowflakeConnection({
        account: authAnswers.SNOWSQL_ACCOUNT,
        username: authAnswers.SNOWSQL_USER,
        password: authAnswers.SNOWSQL_PWD,
      });
      console.log('Connected successfully!\n');
    } catch (error: any) {
      console.error(`\nFailed to connect: ${error.message}`);
      console.log('Please check your credentials and try again.\n');
      throw error;
    }

    let selectedWarehouse: string;
    let selectedDatabase: string;
    let selectedSchema: string;

    try {
      // Query available warehouses
      console.log('Fetching available warehouses...');
      const warehouses = await executeSnowflakeQuery(connection, 'SHOW WAREHOUSES');
      const warehouseNames = warehouses.map((row: any) => row.name);

      if (warehouseNames.length === 0) {
        await destroySnowflakeConnection(connection);
        throw new Error('No warehouses found in your Snowflake account');
      }

      const { warehouse } = await inquirer.prompt<{ warehouse: string }>([
        {
          type: 'list',
          name: 'warehouse',
          message: 'Select Snowflake Warehouse:',
          choices: warehouseNames,
        },
      ]);
      selectedWarehouse = warehouse;

      // Step 3: Query available databases
      console.log('\nFetching available databases...');
      const databases = await executeSnowflakeQuery(connection, 'SHOW DATABASES');
      const databaseNames = databases.map((row: any) => row.name);

      if (databaseNames.length === 0) {
        await destroySnowflakeConnection(connection);
        throw new Error('No databases found in your Snowflake account');
      }

      const { database } = await inquirer.prompt<{ database: string }>([
        {
          type: 'list',
          name: 'database',
          message: 'Select Snowflake Database:',
          choices: databaseNames,
        },
      ]);
      selectedDatabase = database;

      // Step 4: Query available schemas for the selected database
      console.log('\nFetching available schemas...');
      const schemas = await executeSnowflakeQuery(connection, `SHOW SCHEMAS IN DATABASE "${selectedDatabase}"`);
      const schemaNames = schemas.map((row: any) => row.name);

      if (schemaNames.length === 0) {
        await destroySnowflakeConnection(connection);
        throw new Error(`No schemas found in database ${selectedDatabase}`);
      }

      const { schema } = await inquirer.prompt<{ schema: string }>([
        {
          type: 'list',
          name: 'schema',
          message: 'Select Snowflake Schema:',
          choices: schemaNames,
          default: schemaNames.includes('PUBLIC') ? 'PUBLIC' : schemaNames[0],
        },
      ]);
      selectedSchema = schema;

      // Clean up connection
      await destroySnowflakeConnection(connection);

    } catch (error: any) {
      await destroySnowflakeConnection(connection);
      throw error;
    }

    credentials = {
      SNOWSQL_ACCOUNT: authAnswers.SNOWSQL_ACCOUNT,
      SNOWSQL_USER: authAnswers.SNOWSQL_USER,
      SNOWSQL_PWD: authAnswers.SNOWSQL_PWD,
      SNOWSQL_WH: selectedWarehouse,
      SNOWSQL_DB: selectedDatabase,
      SNOWSQL_SCHEMA: selectedSchema,
    };
  } else {
    const urlPrompt = dbEngine === 'postgresql'
      ? 'PostgreSQL connection URL (e.g., postgresql://user:pass@host:5432/db):'
      : 'MySQL connection URL (e.g., mysql://user:pass@host:3306/db):';

    const urlAnswers = await inquirer.prompt<StandardCredentials>([
      {
        type: 'input',
        name: 'DB_URL',
        message: urlPrompt,
        validate: (input) => {
          if (input.length === 0) return 'Connection URL is required';
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL';
          }
        },
      },
    ]);
    credentials = urlAnswers;
  }

  const { configureDisallowed } = await inquirer.prompt<{ configureDisallowed: boolean }>([
    {
      type: 'confirm',
      name: 'configureDisallowed',
      message: 'Would you like to configure disallowed tables?',
      default: false,
    },
  ]);

  let disallowedTables: string[] | undefined;

  if (configureDisallowed) {
    const { tables } = await inquirer.prompt<{ tables: string }>([
      {
        type: 'input',
        name: 'tables',
        message: 'Enter comma-separated table names to disallow:',
        filter: (input) => input.trim(),
      },
    ]);

    if (tables) {
      disallowedTables = tables.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    }
  }

  const config: DatabaseConfig = {
    db_engine: dbEngine,
    db_credentials: credentials,
  };

  if (disallowedTables && disallowedTables.length > 0) {
    config.disallowed_tables = disallowedTables;
  }

  // Save the configuration
  const configPath = path.join(process.cwd(), CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n✅ Configuration saved to ${CONFIG_FILE}\n`);

  return config;
}

export function loadConfig(): DatabaseConfig | null {
  const configPath = path.join(process.cwd(), CONFIG_FILE);

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as DatabaseConfig;
  } catch (error) {
    console.error('Error reading database_config.json:', error);
    return null;
  }
}
