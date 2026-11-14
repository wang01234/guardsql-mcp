import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { summarizeStatement, validateWriteStatement, type WriteKind } from '../sqlGuard.js';
import { toolResult, withAudit, type ToolContext } from '../audit.js';

export interface PendingWrite {
  id: string;
  kind: WriteKind;
  tables: string[];
  sql: string;
  reason: string;
  requestedBy: string;
  createdAt: string;
}

// In-memory approval queue. Approved/rejected items are removed on resolution.
// A production deployment would back this with Redis or a database table.
const pendingWrites = new Map<string, PendingWrite>();

export function getPendingWrite(id: string): PendingWrite | undefined {
  return pendingWrites.get(id);
}

/** Remove and return a pending write (used when it is approved). */
export function takePendingWrite(id: string): PendingWrite | undefined {
  const entry = pendingWrites.get(id);
  if (entry) pendingWrites.delete(id);
  return entry;
}

/**
 * Register the `propose_write` tool. It never executes anything: it validates
 * the statement, queues it for human approval, and returns the approval id and
 * a preview the operator can review before calling the admin approval route.
 */
export function registerProposeWrite(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'propose_write',
    {
      description:
        'Propose a write (INSERT/UPDATE/DELETE) for human approval. The statement is NOT executed; an operator must approve it via the admin HTTP endpoint.',
      inputSchema: {
        sql: z.string().min(1).describe('A single INSERT, UPDATE or DELETE statement.'),
        reason: z.string().min(1).max(500).describe('Why this change should be applied.'),
      },
    },
    async ({ sql, reason }) =>
      withAudit(
        {
          tokenId: ctx.scope.id,
          tool: 'propose_write',
          argsSummary: JSON.stringify({ sql: sql.slice(0, 300), reason }),
        },
        async () => {
          const validated = validateWriteStatement(sql, ctx.scope);

          const entry: PendingWrite = {
            id: randomUUID(),
            kind: validated.kind,
            tables: validated.tables,
            sql: validated.sql,
            reason,
            requestedBy: ctx.scope.id,
            createdAt: new Date().toISOString(),
          };
          pendingWrites.set(entry.id, entry);

          const preview = {
            statement: entry.kind,
            targetTables: entry.tables,
            sql: summarizeStatement(entry.sql),
            reason: entry.reason,
            requestedBy: entry.requestedBy,
            createdAt: entry.createdAt,
          };

          return {
            result: toolResult({ approvalId: entry.id, status: 'pending_approval', preview }),
            rowCount: null,
          };
        },
      ),
  );
}
