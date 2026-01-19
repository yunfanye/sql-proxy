import { Parser } from 'node-sql-parser';

const parser = new Parser();

export interface ValidationResult {
  valid: boolean;
  tables: string[];
  error?: string;
  allowedTables?: string[];
  disallowedTables?: string[];
  isReadOnly?: boolean;
}

// SQL statement types that modify data
const WRITE_OPERATIONS = ['insert', 'update', 'delete', 'replace', 'truncate', 'drop', 'alter', 'create', 'rename'];

export function validateQuery(sql: string, allowedTables?: string[], disallowedTables?: string[], readOnly: boolean = true, dbEngine?: string): ValidationResult {
  try {
    // Map db engine to node-sql-parser database option
    const databaseMap: Record<string, string> = {
      postgresql: 'Postgresql',
      mysql: 'MySQL',
      snowflake: 'Snowflake',
    };
    const database = dbEngine ? databaseMap[dbEngine.toLowerCase()] : undefined;

    // Parse the SQL to extract table references
    const ast = parser.astify(sql, database ? { database } : undefined);
    const tables = extractTables(ast);
    const isReadOnly = checkIsReadOnly(ast);

    // Check read-only mode
    if (readOnly && !isReadOnly) {
      return {
        valid: false,
        tables,
        isReadOnly,
        error: 'Write operations are not allowed. Server is running in read-only mode. Use --allow-write to enable write operations.',
      };
    }

    // Priority: allowed_tables > disallowed_tables
    if (allowedTables && allowedTables.length > 0) {
      // Allowlist mode: only permit specified tables
      const normalizedAllowed = allowedTables.map((t) => t.toLowerCase());
      const notAllowed = tables.filter((t) => !normalizedAllowed.includes(t.toLowerCase()));
      if (notAllowed.length > 0) {
        return {
          valid: false,
          tables,
          isReadOnly,
          allowedTables: notAllowed,
          error: `Access to table(s) denied (not in allowed list): ${notAllowed.join(', ')}`,
        };
      }
      return { valid: true, tables, isReadOnly };
    }

    // Blocklist mode: if no disallowed tables are configured, allow all
    if (!disallowedTables || disallowedTables.length === 0) {
      return { valid: true, tables, isReadOnly };
    }

    // Normalize table names for comparison (case-insensitive)
    const normalizedDisallowed = disallowedTables.map((t) => t.toLowerCase());
    const disallowedFound = tables.filter((table) =>
      normalizedDisallowed.includes(table.toLowerCase())
    );

    if (disallowedFound.length > 0) {
      return {
        valid: false,
        tables,
        isReadOnly,
        disallowedTables: disallowedFound,
        error: `Access to table(s) denied: ${disallowedFound.join(', ')}`,
      };
    }

    return { valid: true, tables, isReadOnly };
  } catch (error: any) {
    // If SQL parsing fails, let the query through by default
    // This ensures that unsupported SQL syntax doesn't block legitimate queries
    return {
      valid: true,
      tables: [],
      error: `SQL parsing error (allowing query): ${error.message}`,
    };
  }
}

function checkIsReadOnly(ast: any): boolean {
  if (Array.isArray(ast)) {
    return ast.every(checkIsReadOnly);
  }

  if (!ast || typeof ast !== 'object') {
    return true;
  }

  const type = ast.type?.toLowerCase();
  if (type && WRITE_OPERATIONS.includes(type)) {
    return false;
  }

  return true;
}

function extractTables(ast: any): string[] {
  const tables: Set<string> = new Set();

  function addTable(table: any): void {
    if (typeof table === 'string') {
      tables.add(table);
    } else if (table && typeof table === 'object' && typeof table.table === 'string') {
      tables.add(table.table);
    }
  }

  function traverse(node: any): void {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    if (typeof node !== 'object') return;

    // Handle table references in FROM clauses
    if (node.from) {
      extractFromClause(node.from);
    }

    // Handle INSERT INTO, UPDATE, DELETE
    if (['insert', 'update', 'delete'].includes(node.type) && node.table) {
      if (Array.isArray(node.table)) {
        node.table.forEach((t: any) => addTable(t));
      } else {
        addTable(node.table);
      }
    }

    // Handle simple table property (for SELECT and other cases)
    // Only add if it's a string to avoid duplicates from complex nodes
    if (typeof node.table === 'string') {
      tables.add(node.table);
    }

    // Recursively process all object properties
    for (const key of Object.keys(node)) {
      if (key !== 'table') {
        traverse(node[key]);
      }
    }
  }

  function extractFromClause(from: any): void {
    if (!from) return;

    if (Array.isArray(from)) {
      from.forEach((item) => {
        addTable(item);
        // Handle subqueries
        if (item.expr) {
          traverse(item.expr);
        }
      });
    } else {
      addTable(from);
    }
  }

  traverse(ast);
  return Array.from(tables);
}
