import snowflake from 'snowflake-sdk';
import { DatabaseConnector, QueryResult, SnowflakeCredentials } from '../types';

export class SnowflakeConnector implements DatabaseConnector {
  private connection: snowflake.Connection | null = null;
  private credentials: SnowflakeCredentials;

  constructor(credentials: SnowflakeCredentials) {
    this.credentials = credentials;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection = snowflake.createConnection({
        account: this.credentials.SNOWSQL_ACCOUNT,
        username: this.credentials.SNOWSQL_USER,
        password: this.credentials.SNOWSQL_PWD,
        warehouse: this.credentials.SNOWSQL_WH,
        database: this.credentials.SNOWSQL_DB,
        schema: this.credentials.SNOWSQL_SCHEMA,
      });

      this.connection.connect((err, conn) => {
        if (err) {
          reject(new Error(`Failed to connect to Snowflake: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connection) {
        this.connection.destroy((err, conn) => {
          if (err) {
            reject(err);
          } else {
            this.connection = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to database' };
    }

    return new Promise((resolve) => {
      this.connection!.execute({
        sqlText: sql,
        complete: (err, stmt, rows) => {
          if (err) {
            resolve({
              success: false,
              error: err.message,
            });
          } else {
            resolve({
              success: true,
              data: rows || [],
              rowCount: rows?.length || 0,
            });
          }
        },
      });
    });
  }

  async listTables(): Promise<string[]> {
    if (!this.connection) {
      throw new Error('Not connected to database');
    }

    return new Promise((resolve, reject) => {
      this.connection!.execute({
        sqlText: 'SHOW TABLES',
        complete: (err, stmt, rows) => {
          if (err) {
            reject(new Error(`Failed to list tables: ${err.message}`));
          } else {
            const tables = (rows || []).map((row: any) => row.name);
            resolve(tables);
          }
        },
      });
    });
  }
}
