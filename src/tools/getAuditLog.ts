import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SqlGuardError } from '../sqlGuard.js';
import { readAudit, toolResult, withAudit, type ToolContext } from '../audit.js';

/**
 * Register the `get_audit_log` tool. Only tokens with `allowAuditRead` may call
 * it; everyone else is rejected (and the attempt itself is audited).
 */
export function registerGetAuditLog(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'get_audit_log',
    {
      description:
        'Return the most recent audit entries. Requires a token with audit-read permission.',
      inputSchema: {
        limit: z.number().int().positive().max(500).optional().describe('Max entries to return (default 50).'),
        since: z.string().optional().describe('ISO timestamp; only return entries at or after this time.'),
      },
    },
    async ({ limit, since }) =>
      withAudit(
        {
          tokenId: ctx.scope.id,
          tool: 'get_audit_log',
          argsSummary: JSON.stringify({ limit, since }),
        },
        async () => {
          if (!ctx.scope.allowAuditRead) {
            throw new SqlGuardError(
              'AUDIT_FORBIDDEN',
              'This token is not allowed to read the audit log.',
            );
          }

          const entries = readAudit(limit ?? 50, since);
          return {
            result: toolResult({ count: entries.length, entries }),
            rowCount: entries.length,
          };
        },
      ),
  );
}
