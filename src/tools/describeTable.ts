import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { tableInScope } from '../config.js';
import { SqlGuardError } from '../sqlGuard.js';
import { toolResult, withAudit, type ToolContext } from '../audit.js';

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

/**
 * Register the `describe_table` tool: columns, data types, primary key and
 * foreign keys for a single table.
 */
export function registerDescribeTable(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'describe_table',
    {
      description:
        'Describe one table: columns with data types, the primary key, and foreign keys.',
      inputSchema: {
        table: z.string().min(1).describe('Name of the table to describe.'),
      },
    },
    async ({ table }) =>
      withAudit(
        { tokenId: ctx.scope.id, tool: 'describe_table', argsSummary: JSON.stringify({ table }) },
        async () => {
          if (!tableInScope(table, ctx.scope)) {
            throw new SqlGuardError(
              'TABLE_FORBIDDEN',
              `Access to table "${table}" is not permitted for this token.`,
            );
          }

          const columns = await ctx.pool.query<ColumnRow>(
            `SELECT column_name, data_type, is_nullable, column_default
               FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = $1
              ORDER BY ordinal_position`,
            [table],
          );

          if (columns.rowCount === 0) {
            throw new SqlGuardError('TABLE_NOT_FOUND', `Table "${table}" does not exist.`);
          }

          const primaryKey = await ctx.pool.query<{ column_name: string }>(
            `SELECT kcu.column_name
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
              WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_schema = 'public' AND tc.table_name = $1
              ORDER BY kcu.ordinal_position`,
            [table],
          );

          const foreignKeys = await ctx.pool.query<{
            column_name: string;
            foreign_table: string;
            foreign_column: string;
          }>(
            `SELECT kcu.column_name,
                    ccu.table_name  AS foreign_table,
                    ccu.column_name AS foreign_column
               FROM information_schema.table_constraints tc
               JOIN information_schema.key_column_usage kcu
                 ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
               JOIN information_schema.constraint_column_usage ccu
                 ON tc.constraint_name = ccu.constraint_name
                AND tc.table_schema = ccu.table_schema
              WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = 'public' AND tc.table_name = $1
              ORDER BY kcu.column_name`,
            [table],
          );

          return {
            result: toolResult({
              table,
              columns: columns.rows.map((c) => ({
                name: c.column_name,
                type: c.data_type,
                nullable: c.is_nullable === 'YES',
                default: c.column_default,
              })),
              primaryKey: primaryKey.rows.map((r) => r.column_name),
              foreignKeys: foreignKeys.rows.map((r) => ({
                column: r.column_name,
                referencesTable: r.foreign_table,
                referencesColumn: r.foreign_column,
              })),
            }),
            rowCount: columns.rows.length,
          };
        },
      ),
  );
}
