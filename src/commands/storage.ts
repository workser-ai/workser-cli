import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";

export function registerStorage(program: Command): void {
  const storage = program.command("storage").description("Provision object storage (Cloudflare R2)");

  storage
    .command("create [name]")
    .description("Provision a storage bucket for the project (idempotent)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/provision/storage`, {
          body: { name: args[0] },
        });
        ok(res, () =>
          success(res.created === false ? `Bucket already exists ${pc.dim(`(${res.bucket})`)}.` : `Provisioned bucket ${pc.bold(res.bucket)}.`),
        );
      }),
    );

  storage
    .command("list")
    .description("List storage buckets for the project")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/storage`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No buckets yet. `workser storage create`."));
          for (const b of items) line(b.bucket ?? b.name);
        });
      }),
    );
}
