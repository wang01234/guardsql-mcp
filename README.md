# GuardSQL MCP

**A production-grade MCP server that safely exposes an internal relational database to AI agents (Claude, etc.) over remote Streamable HTTP — read-only by default, writes gated behind a whitelist and human approval, everything audited, and access controlled per token (RBAC).**

---

## Why this exists

The MCP ecosystem is full of demos that expose *public* toys: weather APIs, file systems, public datasets. What is missing — and what real companies actually need — is a **safe way to connect an AI agent to an internal system of record**: a legacy Postgres, an ERP, a billing database. Handing an agent an open `query(sql)` tool is how you get `DROP TABLE` at 3 a.m.

GuardSQL MCP is the missing "guardrail layer":

- **Read-only by default.** Writes never happen implicitly.
- **Writes need two keys.** A per-token write whitelist **and** a human approval step.
- **Full audit.** Every single tool call is recorded as a JSON line.
- **Least privilege per token.** Each bearer token sees only the tables it is allowed to see, with its own row cap.

It is small, honest, and built to be dropped in front of a customer's database by editing one YAML file.

> This repository is a reusable template / portfolio project. The bundled e-commerce schema is a demo dataset; the guardrails are the real product.

---

## Features

| Capability | Detail |
| --- | --- |
| Default read-only | Only `SELECT` / `WITH` statements are accepted on the read path. |
| Dangerous-statement blocking | `DROP`, `TRUNCATE`, `ALTER`, `GRANT`, `REVOKE`, `COPY`, `CREATE`, `DELETE`, `UPDATE`, `INSERT`, multi-statements, SQL comments, and server-side functions (`pg_sleep`, `pg_read_file`, `dblink`, …) are rejected. |
| Table-scope enforcement | Tables referenced after `FROM`/`JOIN` are parsed and checked against the token's scope (`["*"]` = all). CTEs are understood. |
| Forced `LIMIT` | No `LIMIT` → one is appended. `LIMIT` above the cap → clamped down. |
| Per-token RBAC | `{ tables, allowWrite, maxRows, allowAuditRead, isAdmin }`. |
| Human-in-the-loop writes | `propose_write` **never executes**; it queues an approval. A separate admin-only HTTP route executes it. |
| Full audit | Every tool call writes `{ ts, requestId, tokenId, tool, argsSummary, status, durationMs, rowCount, error? }` to a JSON-lines file **and** stdout. |
| Remote transport | MCP **Streamable HTTP** with `Authorization: Bearer` auth and `401` handling. |
| Statement timeout | Enforced by PostgreSQL per statement. |

---

## Architecture

```mermaid
flowchart LR
    A["AI Agent<br/>(Claude Code / Desktop)"] -->|"HTTPS + Bearer token<br/>MCP Streamable HTTP"| B["GuardSQL MCP<br/>(Express + MCP SDK)"]
    B --> C["Auth<br/>token → scope"]
    B --> D["SQL Guard<br/>read validation + LIMIT"]
    B --> E["Audit log<br/>JSON lines"]
    B --> F["Approval queue<br/>(in-memory)"]
    D --> G[("PostgreSQL")]
    F -. "admin approves" .-> H["POST /admin/writes/:id/approve"]
    H --> G
    H --> E
```

```
                          ┌──────────────────────────────┐
  Agent  ──POST /mcp─────▶ │  Bearer auth → scope (RBAC)   │
  (Bearer token)           └───────────────┬──────────────┘
                                           │  per-request McpServer
             ┌─────────────────────────────┼──────────────────────────────┐
             ▼                             ▼                              ▼
      list_tables / describe_table   run_read_query                 propose_write
                                    (sqlGuard + LIMIT)          (queue only, no exec)
             │                             │                              │
             └──────────────┬──────────────┘                              ▼
                            ▼                              POST /admin/writes/:id/approve
                      PostgreSQL  ◀──────────────────────  (admin token only) → execute
                            │
                            ▼
                       audit.log (JSON lines)  ◀── every call, incl. approvals
```

The MCP endpoint is **stateless**: a fresh `McpServer` + transport is created per HTTP request, bound to the authenticated token's scope. That keeps RBAC airtight (no shared session can leak a scope) and makes the server trivial to scale horizontally.

---

## Quick start (Docker)

```bash
cp .env.example .env          # tokens for the three demo scopes
docker compose up --build
```

That is it. On first start the `postgres` container creates the schema and loads seed data automatically (the SQL files are mounted into `/docker-entrypoint-initdb.d/`). The app waits for Postgres to be healthy, then listens on `http://localhost:8787`.

Check it:

```bash
curl http://localhost:8787/healthz
# {"status":"ok","server":"guardsql-mcp","version":"0.1.0"}
```

There are three demo tokens (from `.env` / `config/guardsql.yaml`):

| Token variable | Scope | Can write? |
| --- | --- | --- |
| `DEMO_READONLY_TOKEN` | all 5 e-commerce tables, max 100 rows | no |
| `DEMO_OPS_TOKEN` | `orders`, `order_items`, `payments`, max 500 rows | yes (propose only) |
| `ADMIN_TOKEN` | all tables, audit read, admin | yes (approve) |

### Run locally (no Docker)

```bash
npm install
# point DATABASE_URL at any Postgres and load db/schema.sql + db/seed.sql
cp .env.example .env
npm run dev
```

---

## Connecting an AI client

The server speaks **remote MCP over Streamable HTTP** at `http://localhost:8787/mcp`, authenticated with a bearer token.

### Claude Code

```bash
claude mcp add --transport http guardsql \
  http://localhost:8787/mcp \
  --header "Authorization: Bearer readonly-demo-token-change-me"
```

Then, inside Claude Code, ask things like:

```
> List the database tables you can access.
> How many orders are in each status?
> Show me the 5 most recent orders with the customer name and country.
> Propose cancelling order 8 because the customer asked, and give me the approval id.
```

### Claude Desktop

Recent Claude Desktop builds can add remote MCP servers directly. If your build does not offer that yet, the community `mcp-remote` bridge works everywhere — add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "guardsql": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "http://localhost:8787/mcp",
        "--header", "Authorization: Bearer readonly-demo-token-change-me"
      ]
    }
  }
}
```

Swap in `ops-token` / `admin-token` to try the write and audit tools.

---

## Security model

1. **Read-only by default.** `run_read_query` runs the statement through `sqlGuard`: it must be a single `SELECT`/`WITH`, contain no comments, no dangerous keywords or functions, and reference only tables in the token's scope. A `LIMIT` is always enforced.
2. **Writes are never executed by a tool.** `propose_write` validates (`INSERT`/`UPDATE`/`DELETE` only, target tables in scope, `allowWrite=true`), then stores a pending item and returns an `{ approvalId, preview }`. A human with the admin token calls `POST /admin/writes/:id/approve` to run it.
3. **Everything is audited.** Each tool call and each approval writes one JSON line to `audit.log` (and stdout) with `status` = `ok` | `denied` | `error`.
4. **Least privilege per token.** A read-only token asking for an out-of-scope table — or calling `get_audit_log` — is rejected and the attempt is logged as `denied`.

### Approving a proposed write

```bash
# 1. An agent proposes (ops token) -> returns approvalId
# 2. The operator reviews the preview, then approves (admin token):
curl -X POST http://localhost:8787/admin/writes/<approvalId>/approve \
  -H "Authorization: Bearer admin-demo-token-change-me"
# {"approvalId":"…","status":"executed","command":"UPDATE","rowCount":1}
```

Approval is single-use: approving the same id again returns `404`.

---

## Tools reference

| Tool | Args | Behaviour |
| --- | --- | --- |
| `list_tables` | – | Base tables visible to the token + exact row counts. |
| `describe_table` | `table` | Columns/types, primary key, foreign keys. |
| `run_read_query` | `sql` | Validated read query; scope-checked; `LIMIT` enforced; statement timeout. |
| `propose_write` | `sql`, `reason` | Validates and queues a write for approval. **Does not execute.** Returns `{ approvalId, preview }`. |
| `get_audit_log` | `limit?`, `since?` | Recent audit entries. Requires `allowAuditRead`. |

HTTP routes: `POST /mcp` (MCP), `GET /healthz`, `POST /admin/writes/:id/approve` (admin only).

---

## Configuration

All behaviour is driven by `config/guardsql.yaml`. `${ENV_VAR}` placeholders are interpolated from the environment; a missing variable produces a clear startup error.

```yaml
server: { name: guardsql-mcp, version: 0.1.0, port: 8787 }
database:
  maxRows: 500              # global row ceiling
  statementTimeoutMs: 5000
audit: { file: ./audit.log }
tokens:
  - id: demo-readonly
    token: ${DEMO_READONLY_TOKEN}
    tables: [customers, products, orders, order_items, payments]
    allowWrite: false
    maxRows: 100
  - id: admin
    token: ${ADMIN_TOKEN}
    tables: ["*"]
    allowWrite: true
    maxRows: 500
    allowAuditRead: true
    isAdmin: true
```

Environment variables (see `.env.example`): `DATABASE_URL`, `DEMO_READONLY_TOKEN`, `DEMO_OPS_TOKEN`, `ADMIN_TOKEN`, and optionally `GUARDSQL_CONFIG` (path to the YAML).

---

## Adapting it to a customer's database

1. Point `DATABASE_URL` at their Postgres.
2. Edit `config/guardsql.yaml`: list the tables each token may touch, set `allowWrite` where needed, and set row caps.
3. Issue one bearer token per consumer (read-only reporting agent, ops agent, admin).
4. Deploy behind TLS. That's the whole integration.

Because the guard parses SQL rather than trusting the agent, an over-eager model cannot reach a table outside its scope.

---

## Verification

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run  (23 guard tests, no database required)
npm run build       # emits dist/
docker compose config
```

The test suite covers: rejecting `DROP`, multi-statements, and non-`SELECT`/`WITH` statements; rejecting comments and dangerous functions; auto-append and clamping of `LIMIT`; cross-scope table rejection (including via `JOIN`); CTE handling; and the write-path rules.

---

## Roadmap

- **OAuth 2.1** resource-server support (the MCP SDK ships authorization helpers) instead of static bearer tokens.
- **PostgreSQL Row-Level Security**: push the scope down into the database so even a bug in the guard cannot leak rows.
- **SSO / IdP integration** for admin approval (e.g. review approvals in Slack).
- **Persistent approval queue** (Redis/DB) and a small review UI.
- **Per-token rate limiting** and query-cost budgets.

---

## Project layout

```
guardsql-mcp/
├─ config/guardsql.yaml     # scopes, tokens, limits
├─ db/schema.sql            # demo e-commerce schema (5 tables, real FKs)
├─ db/seed.sql              # deterministic seed data
├─ src/
│  ├─ index.ts              # express app, auth middleware, MCP + approval routes
│  ├─ config.ts             # YAML load, ${ENV} interpolation, validation
│  ├─ auth.ts               # bearer token -> scope
│  ├─ db.ts                 # pg pool singleton
│  ├─ audit.ts              # JSON-lines audit + audited tool wrapper
│  ├─ sqlGuard.ts           # SQL lexer, read/write validation, LIMIT enforcement
│  └─ tools/                # the five MCP tools
├─ tests/sqlGuard.test.ts   # guard unit tests
├─ Dockerfile               # multi-stage build (build TS -> run dist)
└─ docker-compose.yml       # postgres:16 + app
```

## License

MIT.
