export type DbEngine = 'postgresql' | 'mysql' | 'snowsql';

export interface SnowflakeCredentials {
  SNOWSQL_ACCOUNT: string;
  SNOWSQL_USER: string;
  SNOWSQL_PWD: string;
  SNOWSQL_WH: string;
  SNOWSQL_DB: string;
  SNOWSQL_SCHEMA: string;
}

export interface StandardCredentials {
  DB_URL: string;
}

export type DbCredentials = SnowflakeCredentials | StandardCredentials;

export interface DatabaseConfig {
  db_engine: DbEngine;
  disallowed_tables?: string[];
  db_credentials: DbCredentials;
}

export interface QueryResult {
  success: boolean;
  data?: any[];
  error?: string;
  rowCount?: number;
}

export interface DatabaseConnector {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  executeQuery(sql: string): Promise<QueryResult>;
  listTables(): Promise<string[]>;
}
