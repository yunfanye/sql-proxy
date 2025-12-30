import express, { Request, Response, NextFunction } from 'express';
import { DatabaseConfig } from './types';
import { DatabaseClient } from './client';

export interface ServerOptions {
  port: number;
  config: DatabaseConfig;
  allowWrite?: boolean;
  authToken?: string;
}

export class SqlProxyServer {
  private app: express.Application;
  private client: DatabaseClient;
  private config: DatabaseConfig;
  private port: number;
  private server: any;
  private authToken?: string;

  constructor(options: ServerOptions) {
    this.app = express();
    this.config = options.config;
    this.port = options.port;
    this.authToken = options.authToken;
    this.client = new DatabaseClient({
      config: options.config,
      allowWrite: options.allowWrite,
    });

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

    // Auth token validation
    if (this.authToken) {
      this.app.use((req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({
            success: false,
            error: 'Missing or invalid Authorization header. Expected: Bearer <token>',
          });
          return;
        }
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        if (token !== this.authToken) {
          res.status(403).json({
            success: false,
            error: 'Invalid auth token',
          });
          return;
        }
        next();
      });
    }
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

        // Log the raw SQL query
        console.log(`[${new Date().toISOString()}] SQL: ${sql}`);

        // Validate and execute the query
        const result = await this.client.validateAndExecuteQuery(sql);

        if (result.success) {
          res.json({
            success: true,
            data: result.data,
            rowCount: result.rowCount,
          });
        } else {
          // Check if it's a validation error (403) or execution error (400)
          const statusCode = result.validation && !result.validation.valid ? 403 : 400;
          res.status(statusCode).json({
            success: false,
            error: result.error,
            disallowed_tables: result.validation?.disallowedTables,
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
        const tables = await this.client.listTables();
        res.json({
          success: true,
          tables,
          disallowed_tables: this.client.getDisallowedTables(),
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

  getPort(): number {
    return this.port;
  }

  private async tryListen(port: number, maxRetries: number = 10): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(port, () => {
        this.server = server;
        resolve(port);
      });

      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && maxRetries > 0) {
          console.log(`Port ${port} is in use, trying ${port + 1}...`);
          server.close();
          this.tryListen(port + 1, maxRetries - 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  async start(): Promise<void> {
    // Connect to the database
    console.log(`Connecting to ${this.client.getDbEngine()}...`);
    await this.client.connect();
    console.log('Database connected successfully.\n');

    // List available tables
    try {
      const tables = await this.client.listTables();
      const disallowedTables = this.client.getDisallowedTables();
      console.log('Available tables:');
      if (tables.length === 0) {
        console.log('  (no tables found)');
      } else {
        tables.forEach((table) => {
          const isDisallowed = disallowedTables.includes(table);
          console.log(`  - ${table}${isDisallowed ? ' (disallowed)' : ''}`);
        });
      }
      console.log('');

      if (disallowedTables.length > 0) {
        console.log('Disallowed tables:', disallowedTables.join(', '));
        console.log('');
      }
    } catch (error: any) {
      console.warn('Warning: Could not list tables:', error.message);
      console.log('');
    }

    // Start the HTTP server with auto port fallback
    const actualPort = await this.tryListen(this.port);
    this.port = actualPort;

    console.log(`SQL Proxy Server running on http://localhost:${this.port}`);
    console.log(`Mode: ${this.client.isWriteAllowed() ? 'READ/WRITE' : 'READ-ONLY'}`);
    console.log(`Auth: ${this.authToken ? 'ENABLED (Bearer token required)' : 'DISABLED'}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  http://localhost:${this.port}/health  - Health check`);
    console.log(`  POST http://localhost:${this.port}/query   - Execute SQL query`);
    console.log(`  GET  http://localhost:${this.port}/tables  - List tables`);
    console.log('');
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => resolve());
      });
    }
    await this.client.disconnect();
  }
}
