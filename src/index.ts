import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig, type AppConfig, type TokenScope } from './config.js';
import { authenticate } from './auth.js';
import { closePool, getPool } from './db.js';
import { appendAudit, initAudit, type ToolContext } from './audit.js';
import { registerListTables } from './tools/listTables.js';
import { registerDescribeTable } from './tools/describeTable.js';
import { registerRunReadQuery } from './tools/runReadQuery.js';
import { registerProposeWrite, takePendingWrite } from './tools/proposeWrite.js';
import { registerGetAuditLog } from './tools/getAuditLog.js';
import { ensureDemoData } from './bootstrapDb.js';

interface AuthedRequest extends Request {
  scope?: TokenScope;
}

/** Build an McpServer whose five tools are bound to a single token's scope. */
function buildMcpServer(config: AppConfig, scope: TokenScope, pool: Pool): McpServer {
  const server = new McpServer({ name: config.server.name, version: config.server.version });
  const ctx: ToolContext = { config, pool, scope };
  registerListTables(server, ctx);
  registerDescribeTable(server, ctx);
  registerRunReadQuery(server, ctx);
  registerProposeWrite(server, ctx);
  registerGetAuditLog(server, ctx);
  return server;
}

/** Express middleware: resolve the bearer token to a scope or reject with 401. */
function requireAuth(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const scope = authenticate(req.headers.authorization, config.tokens);
    if (!scope) {
      res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid bearer token.' });
      return;
    }
    (req as AuthedRequest).scope = scope;
    next();
  };
}

function main(): void {
  const config = loadConfig();
  initAudit(config.audit.file);
  const pool = getPool(config);

  // Managed hosts (Render/Fly/Railway) inject the port to bind.
  const port = Number(process.env.PORT) || config.server.port;

  // Seed the demo dataset on first boot when running against a fresh database.
  if (process.env.AUTO_INIT_DB === 'true') {
    void ensureDemoData(pool).catch((err) => {
      console.error('[bootstrap] failed:', err instanceof Error ? err.message : err);
    });
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', server: config.server.name, version: config.server.version });
  });

  // Remote MCP endpoint (Streamable HTTP). Stateless: one server + transport per
  // request, so each call is bound to the authenticated token's scope.
  app.post('/mcp', requireAuth(config), async (req, res) => {
    const scope = (req as AuthedRequest).scope!;
    const server = buildMcpServer(config, scope, pool);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request failed:', err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal_error', message: 'Failed to handle MCP request.' });
      }
    }
  });

  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      error: 'method_not_allowed',
      message: 'This server runs in stateless mode; send MCP requests with POST /mcp.',
    });
  });

  // Admin-only approval route: executes a previously proposed write.
  app.post('/admin/writes/:id/approve', requireAuth(config), async (req, res) => {
    const scope = (req as AuthedRequest).scope!;
    if (!scope.isAdmin && !scope.allowAuditRead) {
      res.status(403).json({ error: 'forbidden', message: 'This token may not approve writes.' });
      return;
    }

    const id = String(req.params.id);
    const pending = takePendingWrite(id);
    if (!pending) {
      res.status(404).json({ error: 'not_found', message: `No pending write with id ${id}.` });
      return;
    }

    const started = Date.now();
    const argsSummary = JSON.stringify({ approvalId: id, sql: pending.sql.slice(0, 300) });
    try {
      const result = await pool.query(pending.sql);
      const rowCount = result.rowCount ?? 0;
      appendAudit({
        ts: new Date().toISOString(),
        requestId: randomUUID(),
        tokenId: scope.id,
        tool: 'approve_write',
        argsSummary,
        status: 'ok',
        durationMs: Date.now() - started,
        rowCount,
      });
      res.json({ approvalId: id, status: 'executed', command: result.command, rowCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendAudit({
        ts: new Date().toISOString(),
        requestId: randomUUID(),
        tokenId: scope.id,
        tool: 'approve_write',
        argsSummary,
        status: 'error',
        durationMs: Date.now() - started,
        rowCount: null,
        error: message,
      });
      res.status(500).json({ error: 'execution_failed', message });
    }
  });

  const httpServer = app.listen(port, () => {
    console.log(`[guardsql-mcp] listening on http://localhost:${port}`);
    console.log(`[guardsql-mcp] MCP endpoint:  POST /mcp`);
    console.log(`[guardsql-mcp] approval route: POST /admin/writes/:id/approve`);
    console.log(`[guardsql-mcp] audit log:      ${config.audit.file}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[guardsql-mcp] received ${signal}, shutting down...`);
    httpServer.close(() => {
      void closePool().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
