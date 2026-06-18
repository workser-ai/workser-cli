import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";

export function registerDb(program: Command): void {
  const db = program.command("db").description("Provision and inspect the project's Postgres database (Neon)");

  db
    .command("create")
    .description("Provision a Postgres database for the project (idempotent)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/provision/database`, { body: {} });
        ok(res, () =>
          success(
            res.created === false
              ? `Database already provisioned ${pc.dim(`(${res.name ?? "db"})`)}.`
              : `Provisioned database ${pc.bold(res.name ?? "db")}.`,
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
          for (const d of items) line(`${d.name}${pc.dim(`  ${d.region ?? ""} ${d.status ?? ""}`)}`);
        });
      }),
    );

  db
    .command("url")
    .description("Print the database connection string (sensitive)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/databases/connection-string`);
        ok(res, () => line(res.url ?? ""));
      }),
    );
}
