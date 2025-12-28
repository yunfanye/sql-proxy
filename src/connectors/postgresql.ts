import { Pool, PoolClient } from 'pg';
import { DatabaseConnector, QueryResult, StandardCredentials } from '../types';

export class PostgreSQLConnector implements DatabaseConnector {
  private pool: Pool | null = null;
  private credentials: StandardCredentials;

  constructor(credentials: StandardCredentials) {
    this.credentials = credentials;
  }

  async connect(): Promise<void> {
    this.pool = new Pool({
      connectionString: this.credentials.DB_URL,
    });

    // Test the connection
    const client = await this.pool.connect();
    client.release();
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.pool) {
      return { success: false, error: 'Not connected to database' };
    }

    try {
      const result = await this.pool.query(sql);
      return {
        success: true,
        data: result.rows,
        rowCount: result.rowCount ?? 0,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async listTables(): Promise<string[]> {
    if (!this.pool) {
      throw new Error('Not connected to database');
    }

    const result = await this.pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    return result.rows.map((row: any) => row.table_name);
  }
}
