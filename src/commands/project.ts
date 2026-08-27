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
            // Names the way out. "Link one in Workser Orbit" told an agent to
            // go and use a screen it cannot see, which is the same as telling
            // it nothing.
            line(
              pc.dim(
                `  no code on this computer yet — run \`workser project sync ${merged.id ?? id}\``,
              ),
            );
          }
        });
      }),
    );

  /**
   * BRING AN APP'S CODE DOWN TO THIS COMPUTER.
   *
   * ─── WHY AN AGENT NEEDS THIS ────────────────────────────────────────────
   *
   * App creation makes a real repository from a starter template, and a
   * separate step clones it into the app's folder. That second step can fail —
   * offline, a slow template race, the app quitting between the two — and
   * until now nothing could redo it from here. `project app <id>` would print
   * "link one in Workser Orbit", telling an agent to go and use a screen it
   * has no way to see.
   *
   * So the agent is now the one that can fix it: same two daemon calls the
   * desktop app makes, in the same order.
   *
   * ─── IDEMPOTENT, AND IT REFUSES RATHER THAN OVERWRITES ──────────────────
   *
   * `prepare` reuses a folder that is already ours and writes the marker; the
   * seed refuses a directory with its own history (`diverged`) rather than
   * checking out over somebody's work. Running this on a healthy app is a
   * no-op that reports the path.
   */
  project
    .command("sync [id]")
    .description(
      "Bring an app's code down to this computer — safe to run again; never overwrites local work",
    )
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const appId = (args[0] as string | undefined) ?? ctx.appId;
        if (!appId) {
          throw new Error(
            "Which app? Pass its id, or run this from inside the app's folder.",
          );
        }

        const prepared = await api<{ localPath?: string }>(
          ctx,
          `/v1/app-folders/prepare`,
          {
            method: "POST",
            body: { projectId, webAppId: appId, requireSource: true },
          },
        );
        const localPath = prepared?.localPath;
        if (!localPath) {
          throw new Error(
            "Couldn't make a folder for this app on this computer.",
          );
        }

        const seeded = await api<{ ok?: boolean; ready?: boolean; message?: string }>(
          ctx,
          `/v1/app-folders/seed`,
          {
            method: "POST",
            body: {
              projectId,
              webAppId: appId,
              localPath,
              requireSource: true,
            },
          },
        );

        ok({ appId, localPath, ...seeded }, () => {
          if (seeded?.ok === false) {
            // The daemon's own sentence. "diverged" and "the template is not
            // ready yet" need different responses from whoever reads this.
            line(pc.yellow(seeded.message ?? "The code did not arrive."));
            line(pc.dim(`  folder  ${localPath}`));
            return;
          }
          line(`${pc.green("synced")}  ${localPath}`);
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
