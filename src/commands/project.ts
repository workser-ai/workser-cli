import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ownerOnly } from "../capabilities.js";
import { ok, line } from "../output.js";

/**
 * The agent works inside ONE project that Workser Orbit has pinned to this
 * directory. It can `show` the pinned project, `list` the workspace's projects,
 * and inspect the project's own apps (`apps` / `app <id>`) — all read-only.
 * Creating a project or switching which one is pinned is an owner action done
 * in Orbit — so `create` / `use` stay owner-only.
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

  /**
   * The apps inside the project.
   *
   * A project can hold several apps (a web app, an api, a worker), each with
   * its own id, deployment state and — device-locally — its own directory. An
   * agent that has been handed an app id (an `@app` mention carries one) needs
   * a way to turn that id into facts; this is it. Read-only: creating and
   * linking apps stays in Orbit.
   */
  project
    .command("apps")
    .description("List the project's apps (id, type, status, URL, local folder)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const [apps, folders] = await Promise.all([
          api(ctx, `/v1/apps`, { query: { project: projectId } }),
          api(ctx, `/v1/app-folders`, { query: { project: projectId } }).catch(
            () => [],
          ),
        ]);
        const withFolders = (apps ?? []).map((a: any) => ({
          ...a,
          localPath: folderFor(folders, a.id),
        }));
        ok(withFolders, () => {
          if (!withFolders.length) return line(pc.dim("No apps in this project."));
          for (const a of withFolders) printApp(a);
        });
      }),
    );

  project
    .command("app <id>")
    .description("Show one app: type, status, URLs and where its code lives here")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const id = args[0] as string;
        const [app, folders] = await Promise.all([
          api(ctx, `/v1/apps/${encodeURIComponent(id)}`),
          api(ctx, `/v1/app-folders`, { query: { project: projectId } }).catch(
            () => [],
          ),
        ]);
        const merged = { ...app, localPath: folderFor(folders, app?.id ?? id) };
        ok(merged, () => {
          printApp(merged);
          if (merged.previewUrl) line(`  preview     ${pc.cyan(merged.previewUrl)}`);
          if (merged.productionUrl)
            line(`  production  ${pc.cyan(merged.productionUrl)}`);
          if (!merged.localPath) {
            line(
              pc.dim(
                "  no folder linked on this computer — link one in Workser Orbit",
              ),
            );
          }
        });
      }),
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

/** Where an app's code sits on THIS machine, from `/v1/app-folders`. */
function folderFor(folders: any, appId: string): string | undefined {
  if (!Array.isArray(folders)) return undefined;
  const hit = folders.find((f: any) => f?.web_app_id === appId);
  return hit?.local_path || undefined;
}

function printApp(a: any): void {
  const bits = [a.type, a.status].filter(Boolean).join(" · ");
  line(
    `${pc.bold(a.name ?? "—")}${a.id ? pc.dim(`  (${a.id})`) : ""}${
      bits ? "  " + pc.dim(bits) : ""
    }`,
  );
  if (a.localPath) line(pc.dim(`  ${a.localPath}`));
}
