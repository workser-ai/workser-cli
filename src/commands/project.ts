import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ownerOnly } from "../capabilities.js";
import { ok, line } from "../output.js";

/**
 * The agent works inside ONE project that Workser Orbit has pinned to this
 * directory. It can `show` the pinned project and `list` the workspace's
 * projects (read-only). Creating a project or switching which one is pinned is
 * an owner action done in Orbit — so `create` / `use` stay owner-only.
 */
export function registerProject(program: Command): void {
  const project = program.command("project").description("Inspect the project linked to this directory");

  project
    .command("show")
    .description("Show the project pinned to this directory")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const p = await api(ctx, `/v1/projects/${encodeURIComponent(projectId)}`);
        ok(p, () => {
          line(`${pc.bold(p.name ?? "—")}${p.id ? pc.dim(`  (${p.id})`) : ""}`);
          if (p.url) line(pc.cyan(p.url));
        });
      }),
    );

  project
    .command("create <name>")
    .description("(owner-only) Create a new project — do this in Workser Orbit")
    .action(
      action(() =>
        ownerOnly({
          action: "project create",
          reason: "creating new projects",
          owner: "create the project (and link this folder to it)",
        }),
      ),
    );

  project
    .command("use <id>")
    .description("(owner-only) Switch the linked project — do this in Workser Orbit")
    .action(
      action(() =>
        ownerOnly({
          action: "project use",
          reason: "switching to a different project",
          owner: "link this folder to a project",
        }),
      ),
    );

  project
    .command("list")
    .description("List the workspace's projects")
    .action(
      action(async ({ ctx }) => {
        const items = await api(ctx, `/v1/projects`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No projects."));
          for (const p of items) {
            const pinned = ctx.projectId && p.id === ctx.projectId ? pc.green("● ") : "  ";
            line(`${pinned}${p.name ?? "—"}${p.id ? pc.dim(`  (${p.id})`) : ""}`);
          }
        });
      }),
    );
}
