import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * The project's database is Neon Postgres. The agent operates inside its ONE
 * pinned project: it can provision the database (the daemon gates it with an
 * approval prompt), read its least-privilege connection string, and browse the
 * live schema/data. Switching to a *different* project is the owner action —
 * see `project`.
 */
export function registerDb(program: Command): void {
  const db = program
    .command("db")
    .description("Provision and inspect the project's Neon Postgres database");

  db
    .command("create")
    .description("Provision a Postgres database for the project (idempotent)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/provision/database`, { body: {} });
        ok(res, () =>
          line(
            res.created === false
              ? `Database already provisioned${pc.dim(`  (${res.name ?? "db"})`)}.`
              : `Provisioned database ${pc.bold(res.name ?? "db")}${pc.dim(`  ${res.region ?? ""} ${res.status ?? ""}`.trimEnd())}.`,
          ),
        );
      }),
    );

  db
    .command("list")
    .description("List databases attached to the project")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/databases`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No database yet. `workser db create`."));
          for (const d of items) line(`${d.name}${pc.dim(`  ${d.region ?? ""} ${d.status ?? ""}`.trimEnd())}`);
        });
      }),
    );

  db
    .command("url")
    .description("Print the database connection string (sensitive, least-privilege role)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/databases/connection-string`);
        // The Orbit surface returns { connection_string, role?, scoped }; older
        // daemons returned { url }. Prefer the current field, fall back.
        const url = res?.connection_string ?? res?.url ?? "";
        ok(res, () => line(url));
      }),
    );

  db
    .command("tables")
    .description("List tables in the Neon database")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const rows = await api(ctx, `/v1/projects/${projectId}/db/tables`);
        ok(rows, () => {
          if (!rows?.length) return line(pc.dim("No tables."));
          for (const t of rows) {
            const schema = t.table_schema && t.table_schema !== "public" ? pc.dim(`${t.table_schema}.`) : "";
            const cols = t.column_count != null ? pc.dim(`  ${t.column_count} cols`) : "";
            const count = t.row_count != null ? pc.dim(`  ${t.row_count} rows`) : "";
            const size = t.table_size != null ? pc.dim(`  ${fmtBytes(t.table_size)}`) : "";
            line(`${schema}${t.table_name}${cols}${count}${size}`);
          }
        });
      }),
    );

  db
    .command("schema <table>")
    .description("Show a table's columns")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const table = args[0] as string;
        const cols = await api(ctx, `/v1/projects/${projectId}/db/tables/${encodeURIComponent(table)}/schema`);
        ok(cols, () => {
          if (!cols?.length) return line(pc.dim("No columns (does the table exist?)."));
          for (const c of cols) {
            const nn = c.is_nullable === "NO" || c.is_nullable === false ? pc.dim("  not null") : "";
            const def = c.column_default ? pc.dim(`  default ${c.column_default}`) : "";
            line(`${c.column_name}  ${pc.cyan(c.data_type)}${nn}${def}`);
          }
        });
      }),
    );

  db
    .command("data <table>")
    .description("Read rows from a table")
    .option("-n, --limit <n>", "max rows", "100")
    .option("--offset <n>", "skip rows", "0")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const table = args[0] as string;
        const res = await api(ctx, `/v1/projects/${projectId}/db/tables/${encodeURIComponent(table)}/data`, {
          query: { limit: opts.limit, offset: opts.offset },
        });
        ok(res, () => printRows(res?.rows ?? [], res?.total));
      }),
    );

  db
    .command("query <sql>")
    .description("Run a read/write SQL statement (writes are gated for approval)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/db/query`, { body: { query: args[0] } });
        // Drivers return either an array of rows or a { rows } result shape.
        const rows = Array.isArray(res) ? res : (res?.rows ?? []);
        ok(res, () => printRows(rows));
      }),
    );
}

function printRows(rows: any[], total?: number): void {
  if (!rows?.length) {
    line(pc.dim("(0 rows)"));
    return;
  }
  const cols = Object.keys(rows[0]);
  line(pc.dim(cols.join("  ")));
  for (const r of rows) {
    line(cols.map((c) => fmtCell(r[c])).join("  "));
  }
  const shown = rows.length;
  line(
    pc.dim(
      total != null && total > shown
        ? `(${shown} of ${total} rows)`
        : `(${shown} row${shown === 1 ? "" : "s"})`,
    ),
  );
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return pc.dim("∅");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fmtBytes(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
}
