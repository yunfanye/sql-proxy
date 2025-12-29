import { DatabaseConnector, QueryResult, StandardCredentials } from '../types';

interface SqlProxyQueryResponse {
  success: boolean;
  data?: any[];
  rowCount?: number;
  error?: string;
}

interface SqlProxyTablesResponse {
  success: boolean;
  tables?: string[];
  error?: string;
}

export class SqlProxyConnector implements DatabaseConnector {
  private baseUrl: string;
  private connected: boolean = false;

  constructor(credentials: StandardCredentials) {
    // Remove trailing slash if present
    this.baseUrl = credentials.DB_URL.replace(/\/$/, '');
  }

  async connect(): Promise<void> {
    // Test the connection by hitting the health endpoint
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Failed to connect to sql-proxy at ${this.baseUrl}: ${response.statusText}`);
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.connected) {
      return { success: false, error: 'Not connected to sql-proxy' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });

      const result = await response.json() as SqlProxyQueryResponse;

      if (result.success) {
        return {
          success: true,
          data: result.data,
          rowCount: result.rowCount,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async listTables(): Promise<string[]> {
    if (!this.connected) {
      throw new Error('Not connected to sql-proxy');
    }

    const response = await fetch(`${this.baseUrl}/tables`);
    const result = await response.json() as SqlProxyTablesResponse;

    if (result.success && result.tables) {
      return result.tables;
    } else {
      throw new Error(result.error || 'Failed to list tables');
    }
  }
}
