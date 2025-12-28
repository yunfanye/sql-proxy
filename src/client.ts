import { DatabaseConfig, DatabaseConnector, QueryResult } from './types';
import { createConnector } from './connectors';
import { validateQuery, ValidationResult } from './validator';

export interface DatabaseClientOptions {
  config: DatabaseConfig;
  allowWrite?: boolean;
}

export interface ExecuteResult extends QueryResult {
  validation?: ValidationResult;
}

/**
 * DatabaseClient provides a high-level interface for executing validated SQL queries
 * against a configured database. It combines connection management, query validation,
 * and execution into a single, easy-to-use class.
 */
export class DatabaseClient {
  private connector: DatabaseConnector;
  private config: DatabaseConfig;
  private allowWrite: boolean;
  private connected: boolean = false;

  /**
   * Creates a new DatabaseClient instance.
   * @param options - Configuration options including database config and write permissions
   */
  constructor(options: DatabaseClientOptions) {
    this.config = options.config;
    this.allowWrite = options.allowWrite ?? false;
    this.connector = createConnector(this.config);
  }

  /**
   * Connects to the database.
   * Must be called before executing queries.
   */
  async connect(): Promise<void> {
    await this.connector.connect();
    this.connected = true;
  }

  /**
   * Disconnects from the database.
   * Should be called when done using the client.
   */
  async disconnect(): Promise<void> {
    await this.connector.disconnect();
    this.connected = false;
  }

  /**
   * Returns whether the client is currently connected to the database.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Returns whether write operations are allowed.
   */
  isWriteAllowed(): boolean {
    return this.allowWrite;
  }

  /**
   * Returns the database engine type.
   */
  getDbEngine(): string {
    return this.config.db_engine;
  }

  /**
   * Returns the list of disallowed tables.
   */
  getDisallowedTables(): string[] {
    return this.config.disallowed_tables ?? [];
  }

  /**
   * Validates and executes a SQL query.
   * The query is first validated against disallowed tables and read-only mode,
   * then executed if validation passes.
   * @param sql - The SQL query to validate and execute
   * @returns The query result including validation details
   */
  async validateAndExecuteQuery(sql: string): Promise<ExecuteResult> {
    if (!this.connected) {
      return {
        success: false,
        error: 'Not connected to database. Call connect() first.',
      };
    }

    // Validate the query
    const validation = validateQuery(sql, this.config.disallowed_tables, !this.allowWrite);

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
        validation,
      };
    }

    // Execute the query
    const result = await this.connector.executeQuery(sql);

    return {
      ...result,
      validation,
    };
  }

  /**
   * Lists all tables in the database.
   * @returns Array of table names
   */
  async listTables(): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Not connected to database. Call connect() first.');
    }
    return this.connector.listTables();
  }
}
