import { readFile, writeFile } from "node:fs/promises";
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

  env
    .command("pull")
    .description("Write this app's cloud env vars into a local file (default .env.local)")
    .option("--app <webAppId>", APP_FLAG_HELP)
    .option("--out <file>", "Local file to write", ".env.local")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const items: Array<{ key: string }> = await api(
          ctx,
          `/v1/projects/${projectId}/env${appQuery(opts)}`,
        );
        const outPath = typeof opts?.out === "string" ? opts.out : ".env.local";
        if (!items?.length) {
          return ok({ file: outPath, pulled: [] }, () =>
            line(pc.dim("No cloud variables to pull.")),
          );
        }
        // One reveal call per key — the daemon approval-gates each of these
        // exactly like `env get` does, so pulling N keys is N of the same
        // prompt a human already sees today, not a new bypass.
        const pulled: Array<{ key: string; value: string }> = [];
        for (const item of items) {
          const res = await api(
            ctx,
            `/v1/projects/${projectId}/env/${encodeURIComponent(item.key)}${appQuery(opts)}`,
          );
          pulled.push({ key: item.key, value: res?.value ?? "" });
        }
        await mergeEnvFile(outPath, pulled);
        ok({ file: outPath, pulled: pulled.map((p) => p.key) }, () =>
          success(
            `Pulled ${pulled.length} variable(s) into ${pc.bold(outPath)}.`,
          ),
        );
      }),
    );
}

/**
 * `web_app_envs` stores ONE canonical value per key, not a preview/production
 * split — so this always writes the same value `env get` would print. A rare
 * key with a preview-only Vercel override (e.g. an auth callback URL) won't
 * reflect that override; there is no CLI-reachable endpoint for it yet.
 */
const ENV_KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/** Upsert `vars` into `path`, preserving every other line (comments, blanks,
 *  unrelated keys) and their original order. */
async function mergeEnvFile(
  path: string,
  vars: Array<{ key: string; value: string }>,
): Promise<void> {
  const existing = await readFile(path, "utf8").catch(() => "");
  const lines = existing.length ? existing.split(/\r?\n/) : [];
  const remaining = new Map(vars.map((v) => [v.key, v.value]));

  const merged = lines.map((rawLine) => {
    const match = ENV_KEY_LINE.exec(rawLine);
    if (!match || !remaining.has(match[1])) return rawLine;
    const key = match[1];
    const value = remaining.get(key)!;
    remaining.delete(key);
    return `${key}=${formatEnvValue(value)}`;
  });

  while (merged.length && merged[merged.length - 1] === "") merged.pop();
  for (const [key, value] of remaining) {
    merged.push(`${key}=${formatEnvValue(value)}`);
  }
  await writeFile(path, merged.join("\n") + "\n", "utf8");
}

/** Quote a value containing whitespace/quotes/`#` so a dotenv reader doesn't
 *  truncate it at the first space or treat the rest of the line as a comment. */
function formatEnvValue(value: string): string {
  return /[\s"'#]/.test(value) ? JSON.stringify(value) : value;
}
