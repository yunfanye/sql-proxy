import { Parser } from 'node-sql-parser';

const parser = new Parser();

export interface ValidationResult {
  valid: boolean;
  tables: string[];
  error?: string;
  disallowedTables?: string[];
}

export function validateQuery(sql: string, disallowedTables?: string[]): ValidationResult {
  try {
    // Parse the SQL to extract table references
    const ast = parser.astify(sql);
    const tables = extractTables(ast);

    // If no disallowed tables are configured, allow all
    if (!disallowedTables || disallowedTables.length === 0) {
      return { valid: true, tables };
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
        disallowedTables: disallowedFound,
        error: `Access to table(s) denied: ${disallowedFound.join(', ')}`,
      };
    }

    return { valid: true, tables };
  } catch (error: any) {
    return {
      valid: false,
      tables: [],
      error: `SQL parsing error: ${error.message}`,
    };
  }
}

function extractTables(ast: any): string[] {
  const tables: Set<string> = new Set();

  function traverse(node: any): void {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    if (typeof node !== 'object') return;

    // Handle table references in FROM clauses
    if (node.table) {
      tables.add(node.table);
    }

    // Handle table references in various clause types
    if (node.from) {
      extractFromClause(node.from);
    }

    // Handle INSERT INTO
    if (node.type === 'insert' && node.table) {
      if (Array.isArray(node.table)) {
        node.table.forEach((t: any) => {
          if (t.table) tables.add(t.table);
        });
      } else if (node.table.table) {
        tables.add(node.table.table);
      }
    }

    // Handle UPDATE
    if (node.type === 'update' && node.table) {
      if (Array.isArray(node.table)) {
        node.table.forEach((t: any) => {
          if (t.table) tables.add(t.table);
        });
      } else if (node.table.table) {
        tables.add(node.table.table);
      }
    }

    // Handle DELETE FROM
    if (node.type === 'delete' && node.table) {
      if (Array.isArray(node.table)) {
        node.table.forEach((t: any) => {
          if (t.table) tables.add(t.table);
        });
      } else if (node.table.table) {
        tables.add(node.table.table);
      }
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
        if (item.table) {
          tables.add(item.table);
        }
        // Handle subqueries
        if (item.expr) {
          traverse(item.expr);
        }
      });
    } else if (from.table) {
      tables.add(from.table);
    }
  }

  traverse(ast);
  return Array.from(tables);
}
