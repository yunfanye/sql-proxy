import mysql from 'mysql2/promise';
import { DatabaseConnector, QueryResult, StandardCredentials } from '../types';

export class MySQLConnector implements DatabaseConnector {
  private connection: mysql.Connection | null = null;
  private credentials: StandardCredentials;

  constructor(credentials: StandardCredentials) {
    this.credentials = credentials;
  }

  async connect(): Promise<void> {
    this.connection = await mysql.createConnection(this.credentials.DB_URL);
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to database' };
    }

    try {
      const [rows, fields] = await this.connection.execute(sql);
      const data = Array.isArray(rows) ? rows : [rows];
      return {
        success: true,
        data: data as any[],
        rowCount: data.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async listTables(): Promise<string[]> {
    if (!this.connection) {
      throw new Error('Not connected to database');
    }

    const [rows] = await this.connection.execute('SHOW TABLES');
    return (rows as any[]).map((row: any) => Object.values(row)[0] as string);
  }
}
