import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { writeProjectLink } from "../config.js";
import { ok, success, line } from "../output.js";

export function registerProject(program: Command): void {
  const project = program.command("project").description("Create, list, and select projects");

  project
    .command("create <name>")
    .description("Create a project and link it to the current directory")
    .action(
      action(async ({ ctx, args }) => {
        const p = await api(ctx, "/v1/projects", { body: { name: args[0] } });
        writeProjectLink(ctx.cwd, { projectId: p.id, name: p.name });
        ok(p, () => success(`Created project ${pc.bold(p.name)} ${pc.dim(`(${p.id})`)} and linked it here.`));
      }),
    );

  project
    .command("list")
    .description("List projects in the workspace")
    .action(
      action(async ({ ctx }) => {
        const items = await api(ctx, "/v1/projects");
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No projects yet. `workser project create <name>`."));
          for (const p of items) {
            const mark = p.id === ctx.projectId ? pc.green("● ") : "  ";
            line(`${mark}${p.name}${pc.dim(`  (${p.id})`)}`);
          }
        });
      }),
    );

  project
    .command("use <id>")
    .description("Link a project to the current directory")
    .action(
      action(async ({ ctx, args }) => {
        const p = await api(ctx, `/v1/projects/${encodeURIComponent(args[0])}`);
        writeProjectLink(ctx.cwd, { projectId: p.id, name: p.name });
        ok(p, () => success(`Using ${pc.bold(p.name)} ${pc.dim(`(${p.id})`)} in this directory.`));
      }),
    );
}
