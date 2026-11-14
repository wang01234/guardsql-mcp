import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { tableInScope } from '../config.js';
import { quoteIdent } from '../db.js';
import { toolResult, withAudit, type ToolContext } from '../audit.js';

/**
 * Register the `list_tables` tool: base tables visible to the token plus an
 * exact row count for each.
 */
export function registerListTables(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'list_tables',
    {
      description:
        'List base tables this token may access, together with their exact row counts.',
      inputSchema: {},
    },
    async () =>
      withAudit(
        { tokenId: ctx.scope.id, tool: 'list_tables', argsSummary: '{}' },
        async () => {
          const { rows } = await ctx.pool.query<{ table_name: string }>(
            `SELECT table_name
               FROM information_schema.tables
              WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
              ORDER BY table_name`,
          );

          const visible = rows
            .map((row) => row.table_name)
            .filter((name) => tableInScope(name, ctx.scope));

          const tables: { name: string; rowCount: number }[] = [];
          for (const name of visible) {
            const countResult = await ctx.pool.query<{ count: string }>(
              `SELECT count(*)::text AS count FROM ${quoteIdent(name)}`,
            );
            tables.push({ name, rowCount: Number(countResult.rows[0]?.count ?? '0') });
          }

          return { result: toolResult({ tables }), rowCount: tables.length };
        },
      ),
  );
}
