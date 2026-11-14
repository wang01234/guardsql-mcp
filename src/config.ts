import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/**
 * A scope is the full set of permissions attached to one bearer token (RBAC).
 */
export interface TokenScope {
  id: string;
  token: string;
  /** Table names this token may touch. A single "*" entry means "all tables". */
  tables: string[];
  allowWrite: boolean;
  maxRows: number;
  allowAuditRead: boolean;
  isAdmin: boolean;
}

export interface AppConfig {
  server: { name: string; version: string; port: number };
  database: { maxRows: number; statementTimeoutMs: number; url: string };
  audit: { file: string };
  tokens: TokenScope[];
}

const tokenSchema = z.object({
  id: z.string().min(1),
  token: z.string().min(1),
  tables: z.array(z.string().min(1)).min(1),
  allowWrite: z.boolean().default(false),
  maxRows: z.number().int().positive().optional(),
  allowAuditRead: z.boolean().default(false),
  isAdmin: z.boolean().default(false),
});

const rawConfigSchema = z.object({
  server: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    port: z.number().int().positive(),
  }),
  database: z.object({
    maxRows: z.number().int().positive(),
    statementTimeoutMs: z.number().int().positive(),
  }),
  audit: z.object({ file: z.string().min(1) }),
  tokens: z.array(tokenSchema).min(1),
});

/** True when the scope is allowed to touch the given table ("*" means all tables). */
export function tableInScope(table: string, scope: TokenScope): boolean {
  const target = table.toLowerCase();
  return scope.tables.some((name) => {
    const normalized = name.toLowerCase();
    return normalized === '*' || normalized === target;
  });
}

/**
 * Recursively replace `${ENV_VAR}` placeholders in a parsed YAML value.
 * Throws a descriptive error naming the config path and the missing variable.
 */
export function interpolateEnv(value: unknown, env: NodeJS.ProcessEnv, path = '$'): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
      const resolved = env[name];
      if (resolved === undefined || resolved === '') {
        throw new Error(
          `Config error: environment variable "${name}" referenced at ${path} is not set.`,
        );
      }
      return resolved;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => interpolateEnv(item, env, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = interpolateEnv(val, env, `${path}.${key}`);
    }
    return out;
  }
  return value;
}

/**
 * Load, interpolate and validate the YAML config.
 *
 * @param configPath Path to the YAML file (defaults to $GUARDSQL_CONFIG or config/guardsql.yaml).
 * @param env        Environment used for `${VAR}` interpolation (defaults to process.env).
 */
export function loadConfig(
  configPath?: string,
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const file = resolve(configPath ?? env.GUARDSQL_CONFIG ?? 'config/guardsql.yaml');

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`Config error: unable to read config file at ${file}`);
  }

  const parsedYaml = parseYaml(raw) as unknown;
  const interpolated = interpolateEnv(parsedYaml, env, 'config');

  const result = rawConfigSchema.safeParse(interpolated);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Config error: invalid config in ${file}:\n${details}`);
  }

  const cfg = result.data;

  const tokenIds = new Set<string>();
  const tokenSecrets = new Set<string>();
  for (const t of cfg.tokens) {
    if (tokenIds.has(t.id)) {
      throw new Error(`Config error: duplicate token id "${t.id}" in ${file}`);
    }
    if (tokenSecrets.has(t.token)) {
      throw new Error(`Config error: duplicate token secret for id "${t.id}" in ${file}`);
    }
    tokenIds.add(t.id);
    tokenSecrets.add(t.token);
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Config error: environment variable "DATABASE_URL" is not set.');
  }

  return {
    server: cfg.server,
    database: {
      maxRows: cfg.database.maxRows,
      statementTimeoutMs: cfg.database.statementTimeoutMs,
      url: databaseUrl,
    },
    audit: { file: resolve(cfg.audit.file) },
    tokens: cfg.tokens.map((t) => ({
      id: t.id,
      token: t.token,
      tables: t.tables,
      allowWrite: t.allowWrite,
      maxRows: t.maxRows ?? cfg.database.maxRows,
      allowAuditRead: t.allowAuditRead,
      isAdmin: t.isAdmin,
    })),
  };
}
