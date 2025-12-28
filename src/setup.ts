import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import { DatabaseConfig, DbEngine, SnowflakeCredentials, StandardCredentials } from './types';

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
    const snowflakeAnswers = await inquirer.prompt<SnowflakeCredentials>([
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
      {
        type: 'input',
        name: 'SNOWSQL_WH',
        message: 'Snowflake Warehouse:',
        validate: (input) => input.length > 0 || 'Warehouse is required',
      },
      {
        type: 'input',
        name: 'SNOWSQL_DB',
        message: 'Snowflake Database:',
        validate: (input) => input.length > 0 || 'Database is required',
      },
      {
        type: 'input',
        name: 'SNOWSQL_SCHEMA',
        message: 'Snowflake Schema:',
        default: 'PUBLIC',
        validate: (input) => input.length > 0 || 'Schema is required',
      },
    ]);
    credentials = snowflakeAnswers;
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
