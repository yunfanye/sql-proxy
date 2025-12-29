import { DatabaseConnector, DatabaseConfig, DbEngine, SnowflakeCredentials, StandardCredentials } from '../types';
import { PostgreSQLConnector } from './postgresql';
import { MySQLConnector } from './mysql';
import { SnowflakeConnector } from './snowflake';
import { SqlProxyConnector } from './sql-proxy';

export function createConnector(config: DatabaseConfig): DatabaseConnector {
  switch (config.db_engine) {
    case 'postgresql':
      return new PostgreSQLConnector(config.db_credentials as StandardCredentials);
    case 'mysql':
      return new MySQLConnector(config.db_credentials as StandardCredentials);
    case 'snowsql':
      return new SnowflakeConnector(config.db_credentials as SnowflakeCredentials);
    case 'sql-proxy':
      return new SqlProxyConnector(config.db_credentials as StandardCredentials);
    default:
      throw new Error(`Unsupported database engine: ${config.db_engine}`);
  }
}

export { PostgreSQLConnector } from './postgresql';
export { MySQLConnector } from './mysql';
export { SnowflakeConnector } from './snowflake';
export { SqlProxyConnector } from './sql-proxy';
