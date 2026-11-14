import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { validateReadQuery } from '../sqlGuard.js';
import { toolResult, withAudit, type ToolContext } from '../audit.js';

/**
 * Register the `run_read_query` tool: the only tool that executes SQL.
 * The statement always goes through the guard (single statement, SELECT/WITH
 * only, table scope, forced LIMIT) and runs under a statement timeout.
 */
export function registerRunReadQuery(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'run_read_query',
    {
      description:
        'Run a single read-only SELECT/WITH query. The statement is validated against this token\'s table scope and a LIMIT is enforced automatically.',
      inputSchema: {
        sql: z.string().min(1).describe('A single SELECT or WITH statement.'),
      },
    },
    async ({ sql }) =>
      withAudit(
        {
          tokenId: ctx.scope.id,
          tool: 'run_read_query',
          argsSummary: JSON.stringify({ sql: sql.slice(0, 300) }),
        },
        async () => {
          const { sql: safeSql, appliedLimit } = validateReadQuery(sql, ctx.scope, ctx.scope.maxRows);
          const result = await ctx.pool.query(safeSql);
          return {
            result: toolResult({
              sql: safeSql,
              appliedLimit,
              rowCount: result.rows.length,
              rows: result.rows,
            }),
            rowCount: result.rows.length,
          };
        },
      ),
  );
}
