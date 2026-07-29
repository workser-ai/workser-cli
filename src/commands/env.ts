import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ownerOnly } from "../capabilities.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * Environment variables are scoped to a WEB APP, not to the project: 1 app =
 * 1 repo = 1 Vercel project, and a project can hold several. `--app <id>`
 * picks which one. Omitted, the server falls back to the project's primary app
 * — the long-standing behaviour, kept so existing scripts keep working.
 *
 * `env set` prints which app it wrote to when no `--app` was given, so a
 * multi-app project can't be written to invisibly.
 */
function appQuery(opts: Record<string, any>): string {
  const app = typeof opts?.app === "string" ? opts.app : "";
  return app ? `?webAppId=${encodeURIComponent(app)}` : "";
}

const APP_FLAG_HELP =
  "Which web app to target (defaults to the project's primary app)";

export function registerEnv(program: Command): void {
  const env = program.command("env").description("Manage web app environment variables");

  env
    .command("set <pairs...>")
    .description("Set one or more KEY=VALUE variables")
    .option("--app <webAppId>", APP_FLAG_HELP)
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const pairs = (args[0] as string[]).map((p) => {
          const i = p.indexOf("=");
          if (i < 0) throw new WorkserError(`Invalid pair "${p}". Use KEY=VALUE.`, { code: "bad_input" });
          return { key: p.slice(0, i), value: p.slice(i + 1) };
        });
        const res = await api(ctx, `/v1/projects/${projectId}/env${appQuery(opts)}`, {
          body: { vars: pairs },
        });
        const count = typeof res?.count === "number" ? res.count : pairs.length;
        ok(res, () => {
          success(`Set ${count} variable(s): ${pairs.map((p) => p.key).join(", ")}`);
          // Only worth saying when the server picked the app for us.
          if (res?.usedDefault && res?.webAppName) {
            line(pc.dim(`on ${res.webAppName} (primary app) — use --app to target another`));
          }
        });
      }),
    );

  env
    .command("get <key>")
    .description("Print one variable's value (sensitive)")
    .option("--app <webAppId>", APP_FLAG_HELP)
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/env/${encodeURIComponent(args[0])}${appQuery(opts)}`,
        );
        ok(res, () => line(res.value ?? ""));
      }),
    );

  env
    .command("list")
    .description("List variable keys (values masked)")
    .option("--app <webAppId>", APP_FLAG_HELP)
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/env${appQuery(opts)}`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No variables set."));
          for (const v of items) line(`${v.key}${pc.dim(" = " + (v.masked ?? "••••"))}`);
        });
      }),
    );

  env
    .command("rm <key>")
    .description("(owner-only) Remove a variable — do this in Workser Orbit")
    .action(
      action(() =>
        ownerOnly({
          action: "env rm",
          reason: "deleting configuration",
          owner: "remove the variable",
        }),
      ),
    );
}
