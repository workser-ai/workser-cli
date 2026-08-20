import { readFile, writeFile } from "node:fs/promises";
import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ownerOnly } from "../capabilities.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";
import {
  envTargets,
  parseEnvironment,
  targetSummary,
  type Environment,
} from "../environments.js";

/**
 * Environment variables are scoped to a WEB APP, not to the project: 1 app =
 * 1 repo = 1 Vercel project, and a project can hold several. `--app <id>`
 * picks which one. Omitted, the server falls back to the project's primary app
 * — the long-standing behaviour, kept so existing scripts keep working.
 *
 * `env set` prints which app it wrote to when no `--app` was given, so a
 * multi-app project can't be written to invisibly.
 */
function appQuery(opts: Record<string, any>, environment?: Environment): string {
  const params = new URLSearchParams();
  if (typeof opts?.app === "string" && opts.app) params.set("webAppId", opts.app);
  // Sent only when asked for. Absent means the shared value — the answer this
  // command has always given, and the one every existing script depends on.
  if (environment) params.set("environment", environment);
  const query = params.toString();
  return query ? `?${query}` : "";
}

const APP_FLAG_HELP =
  "Which web app to target (defaults to the project's primary app)";

const ENV_FLAG_HELP =
  "Which environment: production, preview or development (default: all three)";

/** `--env`, parsed, or a refusal that names what to type instead. */
function readEnv(opts: Record<string, any>): Environment | undefined {
  const parsed = parseEnvironment(opts?.env);
  if (!parsed.ok) throw new WorkserError(parsed.error!, { code: "bad_input" });
  return parsed.value;
}

export function registerEnv(program: Command): void {
  const env = program.command("env").description("Manage web app environment variables");

  env
    .command("set <pairs...>")
    .description("Set one or more KEY=VALUE variables")
    .option("--app <webAppId>", APP_FLAG_HELP)
    .option("--env <environment>", ENV_FLAG_HELP)
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const environment = readEnv(opts);
        const pairs = (args[0] as string[]).map((p) => {
          const i = p.indexOf("=");
          if (i < 0) throw new WorkserError(`Invalid pair "${p}". Use KEY=VALUE.`, { code: "bad_input" });
          return {
            key: p.slice(0, i),
            value: p.slice(i + 1),
            // Sent only when asked for. Omitted means all three, which is what
            // this command has always done — and quietly narrowing that default
            // would have un-set production for every script the day it shipped.
            ...(environment ? { target: envTargets(environment) } : {}),
          };
        });
        const res = await api(ctx, `/v1/projects/${projectId}/env${appQuery(opts)}`, {
          body: { vars: pairs },
        });
        const count = typeof res?.count === "number" ? res.count : pairs.length;
        ok(res, () => {
          success(
            `Set ${count} variable(s) ${targetSummary(environment)}: ` +
              pairs.map((p) => p.key).join(", "),
          );
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
    .option("--env <environment>", ENV_FLAG_HELP)
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const environment = readEnv(opts);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/env/${encodeURIComponent(args[0])}${appQuery(opts, environment)}`,
        );
        // Just the value on stdout, so `$(workser env get KEY)` still works.
        // A key with no value in the environment asked about is a 404 from
        // upstream carrying that exact sentence — not an empty line here,
        // which would be indistinguishable from a variable set to "".
        ok(res, () => line(res.value ?? ""));
      }),
    );

  // `list` and `get` gained `--env` on 2026-08-20, when Workser started
  // STORING a value per environment (migration 125). Before that they could
  // only have lied — one row per key meant the answer would have been the last
  // value written with the word "production" printed over it.
  env
    .command("list")
    .description("List variable keys (values masked)")
    .option("--app <webAppId>", APP_FLAG_HELP)
    .option("--env <environment>", ENV_FLAG_HELP)
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const environment = readEnv(opts);
        const items = await api(
          ctx,
          `/v1/projects/${projectId}/env${appQuery(opts, environment)}`,
        );
        ok(items, () => {
          if (!items?.length) {
            return line(
              pc.dim(
                environment
                  ? `No variables apply in ${environment}.`
                  : "No variables set.",
              ),
            );
          }
          for (const v of items) {
            // WHERE a key differs, without showing anybody a secret. This is
            // the whole reason the un-scoped list is still worth reading: one
            // table, and you can see that production is not the same.
            const differs =
              !environment && v.overriddenIn?.length
                ? pc.yellow(`  (different in ${v.overriddenIn.join(", ")})`)
                : "";
            line(`${v.key}${pc.dim(" = " + (v.masked ?? "••••"))}${differs}`);
          }
          if (environment) {
            line(pc.dim(`\nShowing the values that apply in ${environment}.`));
          }
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
    .option("--env <environment>", ENV_FLAG_HELP)
    .option("--out <file>", "Local file to write", ".env.local")
    .option(
      "--overwrite",
      "replace values this computer already has (default: fill in only what is missing)",
      false,
    )
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        // Pulling WITHOUT `--env` gives the shared values, which is what a
        // local `.env.local` should hold. `--env production` is offered for
        // reproducing a production-only problem locally, and it pulls real
        // production secrets onto a laptop — the approval prompt per key is
        // the same one `env get` raises, deliberately not batched away.
        const environment = readEnv(opts);
        const items: Array<{ key: string }> = await api(
          ctx,
          `/v1/projects/${projectId}/env${appQuery(opts, environment)}`,
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
            `/v1/projects/${projectId}/env/${encodeURIComponent(item.key)}${appQuery(opts, environment)}`,
          );
          pulled.push({ key: item.key, value: res?.value ?? "" });
        }
        // FILL, DO NOT REPLACE — unless asked. A developer's local
        // DATABASE_URL points at their own database on purpose; replacing it
        // because they asked to pull a missing key destroys work this app
        // cannot give back.
        const result = await mergeEnvFile(outPath, pulled, {
          overwrite: !!opts.overwrite,
        });
        ok(
          {
            file: outPath,
            pulled: result.written,
            skipped: result.skipped,
            overwrite: !!opts.overwrite,
          },
          () => {
            success(
              `Pulled ${result.written.length} variable(s) into ${pc.bold(outPath)}.`,
            );
            // Named, not counted. "3 skipped" invites the reader to assume they
            // were unimportant; the names let them check.
            if (result.skipped.length) {
              line(
                pc.dim(
                  `Left alone (this computer already has ${result.skipped.length === 1 ? "it" : "them"}): ${result.skipped.join(", ")}`,
                ),
              );
              line(pc.dim("Use --overwrite to replace them."));
            }
          },
        );
      }),
    );
}

/**
 * Which value lands in the file.
 *
 * Whatever `env get` would print for the environment asked about — so
 * `env pull --env preview` writes the preview values, and a plain `env pull`
 * writes the shared ones. Before migration 125 there was only one value per
 * key and this note said so; that is no longer true.
 *
 * A branch-pinned Vercel preview value (an auth callback URL, typically) still
 * is not reachable from here — Vercel is the only place it exists.
 */
const ENV_KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * Merge `vars` into `path`, preserving every other line — comments, blanks,
 * unrelated keys — and their original order.
 *
 * DEFAULT IS FILL, NOT REPLACE. A key the file already defines is left exactly
 * as it is and reported in `skipped`. Pass `overwrite` to replace it instead.
 * The reason is that this file is the developer's own machine: their local
 * database URL, their own test keys. "Pull the settings I am missing" and
 * "reset my machine to match the cloud" are different requests, and only one of
 * them is what somebody types by reflex.
 */
async function mergeEnvFile(
  path: string,
  vars: Array<{ key: string; value: string }>,
  opts: { overwrite?: boolean } = {},
): Promise<{ written: string[]; skipped: string[] }> {
  const existing = await readFile(path, "utf8").catch(() => "");
  const lines = existing.length ? existing.split(/\r?\n/) : [];
  const remaining = new Map(vars.map((v) => [v.key, v.value]));
  const skipped: string[] = [];
  // Keys REPLACED in place. Counted as written alongside the ones appended at
  // the bottom — otherwise `--overwrite` reports "pulled 0" having just
  // rewritten every line in the file.
  const replaced: string[] = [];

  const merged = lines.map((rawLine) => {
    const match = ENV_KEY_LINE.exec(rawLine);
    if (!match || !remaining.has(match[1])) return rawLine;
    const key = match[1];
    if (!opts.overwrite) {
      // Already here. Leave the line untouched, and take it off the list so it
      // is not appended at the bottom either.
      remaining.delete(key);
      skipped.push(key);
      return rawLine;
    }
    const value = remaining.get(key)!;
    remaining.delete(key);
    replaced.push(key);
    return `${key}=${formatEnvValue(value)}`;
  });

  while (merged.length && merged[merged.length - 1] === "") merged.pop();
  const written: string[] = [...replaced];
  for (const [key, value] of remaining) {
    merged.push(`${key}=${formatEnvValue(value)}`);
    written.push(key);
  }
  await writeFile(path, merged.join("\n") + "\n", "utf8");
  return { written, skipped };
}

/** Quote a value containing whitespace/quotes/`#` so a dotenv reader doesn't
 *  truncate it at the first space or treat the rest of the line as a comment. */
function formatEnvValue(value: string): string {
  return /[\s"'#]/.test(value) ? JSON.stringify(value) : value;
}
