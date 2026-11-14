import { describe, expect, it } from 'vitest';
import { SqlGuardError, validateReadQuery, validateWriteStatement } from '../src/sqlGuard.js';
import type { TokenScope } from '../src/config.js';

const readScope: TokenScope = {
  id: 'test-readonly',
  token: 'secret',
  tables: ['customers', 'products', 'orders'],
  allowWrite: false,
  maxRows: 100,
  allowAuditRead: false,
  isAdmin: false,
};

const writeScope: TokenScope = { ...readScope, id: 'test-writer', allowWrite: true };
const wildcardScope: TokenScope = { ...readScope, id: 'test-admin', tables: ['*'] };

/** Assert that `fn` throws a SqlGuardError with the expected machine-readable code. */
function expectGuard(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(SqlGuardError);
    expect((err as SqlGuardError).code).toBe(code);
    return;
  }
  throw new Error(`Expected SqlGuardError(${code}) but nothing was thrown`);
}

describe('validateReadQuery - statement shape', () => {
  it('rejects DROP statements', () => {
    expectGuard(() => validateReadQuery('DROP TABLE customers', readScope, 100), 'NOT_READ');
  });

  it('rejects DELETE/UPDATE/INSERT on the read path', () => {
    expectGuard(() => validateReadQuery('DELETE FROM customers', readScope, 100), 'NOT_READ');
    expectGuard(() => validateReadQuery('UPDATE customers SET name = 1', readScope, 100), 'NOT_READ');
    expectGuard(() => validateReadQuery('INSERT INTO orders (id) VALUES (1)', readScope, 100), 'NOT_READ');
  });

  it('rejects a non-SELECT leading keyword such as EXPLAIN', () => {
    expectGuard(() => validateReadQuery('EXPLAIN SELECT 1 FROM customers', readScope, 100), 'NOT_READ');
  });

  it('rejects multiple statements joined by a semicolon', () => {
    expectGuard(
      () => validateReadQuery('SELECT id FROM customers; SELECT id FROM products', readScope, 100),
      'MULTI_STATEMENT',
    );
  });

  it('rejects an injected second statement after a trailing semicolon', () => {
    expectGuard(
      () => validateReadQuery('SELECT id FROM customers; DROP TABLE customers;', readScope, 100),
      'MULTI_STATEMENT',
    );
  });

  it('accepts a single statement with one trailing semicolon', () => {
    const result = validateReadQuery('SELECT id FROM customers;', readScope, 100);
    expect(result.sql).toContain('SELECT id FROM customers');
    expect(result.sql).toContain('LIMIT 100');
  });

  it('rejects SQL comments', () => {
    expectGuard(() => validateReadQuery('SELECT id FROM customers -- comment', readScope, 100), 'COMMENT');
    expectGuard(() => validateReadQuery('SELECT /* x */ id FROM customers', readScope, 100), 'COMMENT');
  });

  it('rejects dangerous functions', () => {
    expectGuard(() => validateReadQuery("SELECT pg_sleep(10)", readScope, 100), 'FORBIDDEN_FUNCTION');
    expectGuard(() => validateReadQuery("SELECT pg_read_file('/etc/passwd')", readScope, 100), 'FORBIDDEN_FUNCTION');
  });

  it('rejects keywords embedded in an otherwise valid SELECT', () => {
    expectGuard(() => validateReadQuery('SELECT * FROM customers WHERE 1=1 UNION INSERT 1', readScope, 100), 'FORBIDDEN_KEYWORD');
  });
});

describe('validateReadQuery - row cap', () => {
  it('appends a LIMIT when none is present', () => {
    const result = validateReadQuery('SELECT id, name FROM customers', readScope, 100);
    expect(result.appliedLimit).toBe(100);
    expect(result.sql.endsWith('LIMIT 100')).toBe(true);
  });

  it('clamps an over-limit LIMIT down to maxRows', () => {
    const result = validateReadQuery('SELECT id FROM customers LIMIT 5000', readScope, 100);
    expect(result.appliedLimit).toBe(100);
    expect(result.sql).toContain('LIMIT 100');
    expect(result.sql).not.toContain('5000');
  });

  it('keeps a LIMIT that is within the cap', () => {
    const result = validateReadQuery('SELECT id FROM customers LIMIT 25', readScope, 100);
    expect(result.appliedLimit).toBe(25);
    expect(result.sql).toContain('LIMIT 25');
  });

  it('rejects a non-numeric LIMIT', () => {
    expectGuard(() => validateReadQuery('SELECT id FROM customers LIMIT ALL', readScope, 100), 'LIMIT_INVALID');
  });
});

describe('validateReadQuery - table scope', () => {
  it('allows a legitimate SELECT against an in-scope table', () => {
    const result = validateReadQuery(
      "SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.country = 'US'",
      readScope,
      100,
    );
    expect(result.tables).toEqual(expect.arrayContaining(['orders', 'customers']));
  });

  it('rejects access to a table outside the scope', () => {
    expectGuard(() => validateReadQuery('SELECT * FROM secrets', readScope, 100), 'TABLE_FORBIDDEN');
  });

  it('rejects an out-of-scope table reached through a JOIN', () => {
    expectGuard(
      () => validateReadQuery('SELECT * FROM orders o JOIN secrets s ON s.id = o.id', readScope, 100),
      'TABLE_FORBIDDEN',
    );
  });

  it('does not treat a CTE name as a base table', () => {
    const result = validateReadQuery(
      'WITH recent AS (SELECT id FROM orders) SELECT * FROM recent',
      readScope,
      100,
    );
    expect(result.tables).toContain('orders');
  });

  it('allows any table for a wildcard scope', () => {
    const result = validateReadQuery('SELECT * FROM anything_at_all', wildcardScope, 100);
    expect(result.sql).toContain('LIMIT 100');
  });
});

describe('validateWriteStatement', () => {
  it('rejects writes for a read-only token', () => {
    expectGuard(
      () => validateWriteStatement("INSERT INTO orders (customer_id) VALUES (1)", readScope),
      'WRITE_DISABLED',
    );
  });

  it('accepts a well-formed INSERT for an in-scope, writable token', () => {
    const result = validateWriteStatement('INSERT INTO orders (customer_id, status) VALUES (1, \'paid\')', writeScope);
    expect(result.kind).toBe('INSERT');
    expect(result.tables).toContain('orders');
  });

  it('rejects writes to an out-of-scope table', () => {
    expectGuard(() => validateWriteStatement('UPDATE payments SET status = \'captured\'', writeScope), 'TABLE_FORBIDDEN');
  });

  it('rejects non-write statements', () => {
    expectGuard(() => validateWriteStatement('SELECT * FROM orders', writeScope), 'NOT_WRITE');
  });

  it('rejects multi-statement writes', () => {
    expectGuard(
      () => validateWriteStatement('DELETE FROM orders; DROP TABLE orders', writeScope),
      'MULTI_STATEMENT',
    );
  });
});
