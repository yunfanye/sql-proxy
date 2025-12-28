import express, { Request, Response, NextFunction } from 'express';
import { DatabaseConfig, DatabaseConnector } from './types';
import { createConnector } from './connectors';
import { validateQuery } from './validator';

export interface ServerOptions {
  port: number;
  config: DatabaseConfig;
}

export class SqlProxyServer {
  private app: express.Application;
  private connector: DatabaseConnector;
  private config: DatabaseConfig;
  private port: number;
  private server: any;

  constructor(options: ServerOptions) {
    this.app = express();
    this.config = options.config;
    this.port = options.port;
    this.connector = createConnector(this.config);

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.text({ type: 'text/plain' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', db_engine: this.config.db_engine });
    });

    // SQL query endpoint
    this.app.post('/query', async (req: Request, res: Response) => {
      try {
        let sql: string;

        // Support both JSON body and plain text
        if (typeof req.body === 'string') {
          sql = req.body;
        } else if (req.body && req.body.sql) {
          sql = req.body.sql;
        } else {
          res.status(400).json({
            success: false,
            error: 'Missing SQL query. Send { "sql": "..." } or plain text SQL.',
          });
          return;
        }

        if (!sql || typeof sql !== 'string' || sql.trim().length === 0) {
          res.status(400).json({
            success: false,
            error: 'SQL query cannot be empty',
          });
          return;
        }

        // Validate the query against disallowed tables
        const validation = validateQuery(sql, this.config.disallowed_tables);

        if (!validation.valid) {
          res.status(403).json({
            success: false,
            error: validation.error,
            disallowed_tables: validation.disallowedTables,
          });
          return;
        }

        // Execute the query
        const result = await this.connector.executeQuery(sql);

        if (result.success) {
          res.json({
            success: true,
            data: result.data,
            rowCount: result.rowCount,
          });
        } else {
          res.status(400).json({
            success: false,
            error: result.error,
          });
        }
      } catch (error: any) {
        console.error('Query error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // List tables endpoint
    this.app.get('/tables', async (req: Request, res: Response) => {
      try {
        const tables = await this.connector.listTables();
        res.json({
          success: true,
          tables,
          disallowed_tables: this.config.disallowed_tables || [],
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Not found',
        available_endpoints: [
          'GET /health - Health check',
          'POST /query - Execute SQL query',
          'GET /tables - List available tables',
        ],
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    });
  }

  async start(): Promise<void> {
    // Connect to the database
    console.log(`Connecting to ${this.config.db_engine}...`);
    await this.connector.connect();
    console.log('Database connected successfully.\n');

    // List available tables
    try {
      const tables = await this.connector.listTables();
      console.log('Available tables:');
      if (tables.length === 0) {
        console.log('  (no tables found)');
      } else {
        tables.forEach((table) => {
          const isDisallowed = this.config.disallowed_tables?.includes(table);
          console.log(`  - ${table}${isDisallowed ? ' (disallowed)' : ''}`);
        });
      }
      console.log('');

      if (this.config.disallowed_tables && this.config.disallowed_tables.length > 0) {
        console.log('Disallowed tables:', this.config.disallowed_tables.join(', '));
        console.log('');
      }
    } catch (error: any) {
      console.warn('Warning: Could not list tables:', error.message);
      console.log('');
    }

    // Start the HTTP server
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`SQL Proxy Server running on http://localhost:${this.port}`);
        console.log('');
        console.log('Endpoints:');
        console.log(`  GET  http://localhost:${this.port}/health  - Health check`);
        console.log(`  POST http://localhost:${this.port}/query   - Execute SQL query`);
        console.log(`  GET  http://localhost:${this.port}/tables  - List tables`);
        console.log('');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
    await this.connector.disconnect();
  }
}
