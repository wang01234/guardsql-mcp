import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AppConfig, TokenScope } from './config.js';
import { SqlGuardError } from './sqlGuard.js';

export type AuditStatus = 'ok' | 'denied' | 'error';

export interface AuditEntry {
  ts: string;
  requestId: string;
  tokenId: string;
  tool: string;
  argsSummary: string;
  status: AuditStatus;
  durationMs: number;
  rowCount: number | null;
  error?: string;
}

let auditFile: string | undefined;

/** Point the audit log at a file (called once at startup). */
export function initAudit(file: string): void {
  auditFile = file;
}

/** Append one audit entry as a JSON line to the file and to stdout. */
export function appendAudit(entry: AuditEntry): void {
  const line = JSON.stringify(entry);
  console.log(`[audit] ${line}`);
  if (!auditFile) return;
  try {
    appendFileSync(auditFile, `${line}\n`, 'utf8');
  } catch (err) {
    console.error('[audit] failed to persist audit entry:', err instanceof Error ? err.message : err);
  }
}

/** Read the most recent audit entries (optionally filtered by an ISO timestamp). */
export function readAudit(limit: number, since?: string): AuditEntry[] {
  if (!auditFile || !existsSync(auditFile)) return [];
  const sinceMs = since ? Date.parse(since) : Number.NaN;

  const entries: AuditEntry[] = [];
  for (const rawLine of readFileSync(auditFile, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const entry = JSON.parse(line) as AuditEntry;
      if (!Number.isNaN(sinceMs) && Date.parse(entry.ts) < sinceMs) continue;
      entries.push(entry);
    } catch {
      // Skip malformed lines rather than failing the whole read.
    }
  }
  return entries.slice(-limit);
}

export interface AuditMeta {
  tokenId: string;
  tool: string;
  argsSummary: string;
  requestId?: string;
}

/**
 * Run a tool body, timing it and writing exactly one audit entry regardless of
 * outcome. Guard rejections are recorded as "denied"; other failures as "error".
 * The original error is re-thrown so the MCP layer can turn it into a tool error.
 */
export async function withAudit<T extends CallToolResult>(
  meta: AuditMeta,
  fn: () => Promise<{ result: T; rowCount?: number | null }>,
): Promise<T> {
  const started = Date.now();
  const requestId = meta.requestId ?? randomUUID();

  try {
    const { result, rowCount } = await fn();
    appendAudit({
      ts: new Date().toISOString(),
      requestId,
      tokenId: meta.tokenId,
      tool: meta.tool,
      argsSummary: meta.argsSummary,
      status: 'ok',
      durationMs: Date.now() - started,
      rowCount: rowCount ?? null,
    });
    return result;
  } catch (err) {
    appendAudit({
      ts: new Date().toISOString(),
      requestId,
      tokenId: meta.tokenId,
      tool: meta.tool,
      argsSummary: meta.argsSummary,
      status: err instanceof SqlGuardError ? 'denied' : 'error',
      durationMs: Date.now() - started,
      rowCount: null,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Everything a tool handler needs, captured per authenticated request. */
export interface ToolContext {
  config: AppConfig;
  pool: Pool;
  scope: TokenScope;
}

/** Build a CallToolResult carrying both human-readable text and structured data. */
export function toolResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}
