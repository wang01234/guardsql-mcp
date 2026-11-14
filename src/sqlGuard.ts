import { tableInScope, type TokenScope } from './config.js';

/**
 * Error thrown whenever a statement fails a guard check.
 * `code` is a stable machine-readable reason used in audit logs.
 */
export class SqlGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SqlGuardError';
    this.code = code;
  }
}

interface Token {
  type: 'ident' | 'string' | 'number' | 'comma' | 'lparen' | 'rparen' | 'dot' | 'star' | 'semicolon' | 'op';
  value: string;
  upper: string;
  start: number;
  end: number;
  quoted: boolean;
}

/** Keywords that are never acceptable, not even inside a read query. */
const FORBIDDEN_KEYWORDS = new Set([
  'DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE', 'COPY', 'CREATE', 'DELETE', 'UPDATE', 'INSERT',
  'MERGE', 'CALL', 'DO', 'EXECUTE', 'VACUUM', 'ANALYZE', 'REINDEX', 'CLUSTER', 'DISCARD', 'REFRESH',
  'SECURITY', 'LOCK', 'COMMENT', 'SET', 'RESET', 'PREPARE', 'DEALLOCATE', 'LISTEN', 'NOTIFY',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'DECLARE', 'REASSIGN', 'IMPORT', 'ATTACH',
]);

/**
 * Keywords forbidden inside a write statement. Kept small on purpose: words
 * such as SET / DO / VALUES are legitimate parts of INSERT/UPDATE/DELETE.
 */
const WRITE_FORBIDDEN_KEYWORDS = new Set([
  'DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE', 'COPY', 'CREATE', 'MERGE', 'CALL', 'EXECUTE',
  'VACUUM', 'ANALYZE', 'REINDEX', 'CLUSTER', 'DISCARD', 'REFRESH', 'SECURITY', 'LOCK', 'COMMENT',
  'PREPARE', 'DEALLOCATE', 'LISTEN', 'NOTIFY', 'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT',
  'REASSIGN', 'IMPORT', 'ATTACH',
]);

/** Server-side functions that can read files, sleep, or reach the network. */
const DANGEROUS_FUNCTIONS = new Set([
  'pg_sleep', 'pg_sleep_for', 'pg_sleep_until',
  'pg_read_file', 'pg_read_binary_file', 'pg_write_file', 'pg_file_write',
  'pg_ls_dir', 'pg_ls_logdir', 'pg_ls_waldir', 'pg_ls_tmpdir', 'pg_stat_file',
  'dblink', 'dblink_exec', 'dblink_connect', 'dblink_send_query',
  'lo_import', 'lo_export', 'lo_create', 'lo_unlink',
  'pg_terminate_backend', 'pg_cancel_backend', 'pg_reload_conf', 'pg_rotate_logfile',
  'pg_advisory_lock', 'pg_advisory_xact_lock', 'set_config',
  'query_to_xml', 'table_to_xml', 'database_to_xml', 'xp_cmdshell', 'copy_from',
]);

/**
 * Minimal SQL lexer. It is intentionally conservative: string literals are
 * skipped so their contents can never be mistaken for keywords or comments.
 */
function lex(sql: string): { tokens: Token[]; hasComment: boolean } {
  const tokens: Token[] = [];
  let hasComment = false;
  const n = sql.length;
  let i = 0;

  const push = (type: Token['type'], value: string, start: number, end: number, quoted = false): void => {
    tokens.push({ type, value, upper: value.toUpperCase(), start, end, quoted });
  };

  while (i < n) {
    const c = sql[i]!;

    if (/\s/.test(c)) { i++; continue; }

    // -- line comment
    if (c === '-' && sql[i + 1] === '-') {
      hasComment = true;
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? n : nl + 1;
      continue;
    }
    // /* block comment */
    if (c === '/' && sql[i + 1] === '*') {
      hasComment = true;
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }
    // 'string literal'
    if (c === "'") {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      push('string', sql.slice(start, i), start, i, true);
      continue;
    }
    // "quoted identifier"
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      push('ident', sql.slice(start + 1, Math.max(start + 1, i - 1)), start, i, true);
      continue;
    }
    // $tag$ ... $tag$ dollar-quoted string
    if (c === '$') {
      const match = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0];
        const start = i;
        const close = sql.indexOf(tag, i + tag.length);
        i = close === -1 ? n : close + tag.length;
        push('string', sql.slice(start, i), start, i, true);
        continue;
      }
    }
    // identifier / keyword
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      i++;
      while (i < n && /[A-Za-z0-9_$]/.test(sql[i]!)) i++;
      push('ident', sql.slice(start, i), start, i);
      continue;
    }
    // number
    if (/[0-9]/.test(c)) {
      const start = i;
      i++;
      while (i < n && /[0-9._]/.test(sql[i]!)) i++;
      push('number', sql.slice(start, i), start, i);
      continue;
    }

    if (c === ',') { push('comma', c, i, i + 1); i++; continue; }
    if (c === '(') { push('lparen', c, i, i + 1); i++; continue; }
    if (c === ')') { push('rparen', c, i, i + 1); i++; continue; }
    if (c === '.') { push('dot', c, i, i + 1); i++; continue; }
    if (c === '*') { push('star', c, i, i + 1); i++; continue; }
    if (c === ';') { push('semicolon', c, i, i + 1); i++; continue; }

    push('op', c, i, i + 1);
    i++;
  }

  return { tokens, hasComment };
}

/** Assert the token stream contains at most one statement and no comments. */
function stripSingleStatement(tokens: Token[], hasComment: boolean): Token[] {
  if (hasComment) {
    throw new SqlGuardError('COMMENT', 'SQL comments are not allowed.');
  }
  const semicolons = tokens.filter((t) => t.type === 'semicolon');
  if (semicolons.length > 0) {
    const last = tokens[tokens.length - 1]!;
    if (last.type !== 'semicolon' || semicolons.length > 1) {
      throw new SqlGuardError('MULTI_STATEMENT', 'Multiple SQL statements are not allowed.');
    }
  }
  return tokens.filter((t) => t.type !== 'semicolon');
}

/** Extract table names referenced after FROM/JOIN/INTO/UPDATE plus CTE names. */
function extractTableRefs(tokens: Token[]): { tables: string[]; ctes: Set<string> } {
  const tables: string[] = [];
  const ctes = new Set<string>();

  const skipBalanced = (start: number): number => {
    let depth = 0;
    for (let idx = start; idx < tokens.length; idx++) {
      const t = tokens[idx]!;
      if (t.type === 'lparen') depth++;
      else if (t.type === 'rparen') {
        depth--;
        if (depth === 0) return idx + 1;
      }
    }
    return tokens.length;
  };

  const readQualifiedName = (start: number): { name: string; next: number } | null => {
    let idx = start;
    while (idx < tokens.length && tokens[idx]!.type === 'ident'
      && ['LATERAL', 'ONLY'].includes(tokens[idx]!.upper)) {
      idx++;
    }
    const head = tokens[idx];
    if (!head || head.type !== 'ident') return null;
    let name = head.value;
    idx++;
    while (tokens[idx]?.type === 'dot' && tokens[idx + 1]?.type === 'ident') {
      name = tokens[idx + 1]!.value;
      idx += 2;
    }
    return { name, next: idx };
  };

  // Collect CTE names so "SELECT ... FROM <cte>" is not mistaken for a base table.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'ident' || t.upper !== 'WITH') continue;
    let j = i + 1;
    if (tokens[j]?.type === 'ident' && tokens[j]!.upper === 'RECURSIVE') j++;
    for (;;) {
      const nameTok = tokens[j];
      if (!nameTok || nameTok.type !== 'ident') break;
      ctes.add(nameTok.value.toLowerCase());
      j++;
      if (tokens[j]?.type === 'lparen') j = skipBalanced(j); // optional column list
      if (tokens[j]?.type === 'ident' && tokens[j]!.upper === 'AS') j++;
      if (tokens[j]?.type === 'lparen') j = skipBalanced(j); // CTE body
      if (tokens[j]?.type === 'comma') { j++; continue; }
      break;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type !== 'ident' || !['FROM', 'JOIN', 'INTO', 'UPDATE'].includes(t.upper)) continue;
    let j = i + 1;
    for (;;) {
      const ref = readQualifiedName(j);
      if (!ref) break;
      tables.push(ref.name.toLowerCase());
      j = ref.next;
      if (t.upper === 'FROM' && tokens[j]?.type === 'comma') { j++; continue; }
      break;
    }
  }

  return { tables, ctes };
}

function assertTablesAllowed(tables: string[], ctes: Set<string>, scope: TokenScope): void {
  for (const table of tables) {
    if (ctes.has(table)) continue;
    if (!tableInScope(table, scope)) {
      throw new SqlGuardError(
        'TABLE_FORBIDDEN',
        `Access to table "${table}" is not permitted for this token.`,
      );
    }
  }
}

/** Trim a statement to exclude a trailing semicolon. */
function statementText(sql: string, stmtTokens: Token[]): string {
  const last = stmtTokens[stmtTokens.length - 1];
  if (!last) return sql.trim();
  return sql.slice(0, last.end).trim();
}

export interface ReadValidationResult {
  sql: string;
  appliedLimit: number;
  tables: string[];
}

/**
 * Validate and normalize a read-only statement.
 * Enforces: single statement, SELECT/WITH only, no comments, no dangerous
 * functions/keywords, table scope, and an explicit row cap via LIMIT.
 */
export function validateReadQuery(rawSql: string, scope: TokenScope, maxRows: number): ReadValidationResult {
  if (typeof rawSql !== 'string' || rawSql.trim() === '') {
    throw new SqlGuardError('EMPTY', 'SQL statement is empty.');
  }

  const { tokens, hasComment } = lex(rawSql);
  if (tokens.length === 0) {
    throw new SqlGuardError('EMPTY', 'SQL statement is empty.');
  }
  const stmtTokens = stripSingleStatement(tokens, hasComment);

  const first = stmtTokens.find((t) => t.type === 'ident');
  if (!first || (first.upper !== 'SELECT' && first.upper !== 'WITH')) {
    throw new SqlGuardError('NOT_READ', 'Only a single SELECT or WITH statement is allowed.');
  }

  for (const t of stmtTokens) {
    if (t.type === 'ident' && !t.quoted && FORBIDDEN_KEYWORDS.has(t.upper)) {
      throw new SqlGuardError('FORBIDDEN_KEYWORD', `Keyword "${t.upper}" is not allowed in read queries.`);
    }
  }
  for (const t of stmtTokens) {
    if (t.type === 'ident' && DANGEROUS_FUNCTIONS.has(t.value.toLowerCase())) {
      throw new SqlGuardError('FORBIDDEN_FUNCTION', `Function "${t.value}" is not allowed.`);
    }
  }

  const { tables, ctes } = extractTableRefs(stmtTokens);
  assertTablesAllowed(tables, ctes, scope);

  const base = statementText(rawSql, stmtTokens);

  // Locate a top-level LIMIT so we can clamp it; otherwise append one.
  let depth = 0;
  let limitIdx = -1;
  for (let i = 0; i < stmtTokens.length; i++) {
    const t = stmtTokens[i]!;
    if (t.type === 'lparen') depth++;
    else if (t.type === 'rparen') depth--;
    else if (depth === 0 && t.type === 'ident' && t.upper === 'LIMIT') { limitIdx = i; break; }
  }

  if (limitIdx === -1) {
    return { sql: `${base}\nLIMIT ${maxRows}`, appliedLimit: maxRows, tables };
  }

  const limitValueTok = stmtTokens[limitIdx + 1];
  if (!limitValueTok || limitValueTok.type !== 'number') {
    throw new SqlGuardError('LIMIT_INVALID', 'LIMIT must be a plain integer literal.');
  }

  const value = Number(limitValueTok.value);
  if (!Number.isFinite(value) || value > maxRows) {
    const clamped = base.slice(0, limitValueTok.start) + String(maxRows) + base.slice(limitValueTok.end);
    return { sql: clamped, appliedLimit: maxRows, tables };
  }

  return { sql: base, appliedLimit: value, tables };
}

export type WriteKind = 'INSERT' | 'UPDATE' | 'DELETE';

export interface WriteValidationResult {
  sql: string;
  kind: WriteKind;
  tables: string[];
}

/**
 * Validate a proposed write statement. It is never executed here; this only
 * checks that the token may write and that the target tables are in scope.
 */
export function validateWriteStatement(rawSql: string, scope: TokenScope): WriteValidationResult {
  if (!scope.allowWrite) {
    throw new SqlGuardError('WRITE_DISABLED', 'This token is not allowed to propose write operations.');
  }
  if (typeof rawSql !== 'string' || rawSql.trim() === '') {
    throw new SqlGuardError('EMPTY', 'SQL statement is empty.');
  }

  const { tokens, hasComment } = lex(rawSql);
  if (tokens.length === 0) {
    throw new SqlGuardError('EMPTY', 'SQL statement is empty.');
  }
  const stmtTokens = stripSingleStatement(tokens, hasComment);

  const first = stmtTokens.find((t) => t.type === 'ident');
  if (!first || !['INSERT', 'UPDATE', 'DELETE'].includes(first.upper)) {
    throw new SqlGuardError('NOT_WRITE', 'Only a single INSERT, UPDATE or DELETE statement can be proposed.');
  }

  for (const t of stmtTokens) {
    if (t.type === 'ident' && !t.quoted && WRITE_FORBIDDEN_KEYWORDS.has(t.upper)) {
      throw new SqlGuardError('FORBIDDEN_KEYWORD', `Keyword "${t.upper}" is not allowed.`);
    }
  }
  for (const t of stmtTokens) {
    if (t.type === 'ident' && DANGEROUS_FUNCTIONS.has(t.value.toLowerCase())) {
      throw new SqlGuardError('FORBIDDEN_FUNCTION', `Function "${t.value}" is not allowed.`);
    }
  }

  const { tables, ctes } = extractTableRefs(stmtTokens);
  if (tables.length === 0) {
    throw new SqlGuardError('NO_TARGET', 'Unable to determine the target table of the statement.');
  }
  assertTablesAllowed(tables, ctes, scope);

  return { sql: statementText(rawSql, stmtTokens), kind: first.upper as WriteKind, tables };
}

/** Count a statement's statements/rows hint used in the write preview. */
export function summarizeStatement(sql: string): string {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 197)}...` : oneLine;
}
