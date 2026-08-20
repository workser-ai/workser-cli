import type { Command } from "commander";
import pc from "picocolors";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { action } from "../run.js";
import { api } from "../client.js";
import { requireLocalApp } from "../context.js";
import { ok, line, success } from "../output.js";
import { WorkserError } from "../errors.js";
import {
  SPEC_FILES,
  discoverRoutes,
  specPaths,
  specReport,
  specSummary,
} from "../api-spec.js";

/**
 * `workser api` — call the service, and check that it describes itself.
 *
 * WHY THE AGENT USES THE SAME PATH THE HUMAN DOES. `api call` goes through the
 * daemon's request console (`/v1/apps/:id/api/call`), not through a raw fetch
 * the agent writes itself. That is the whole point: a call the agent made
 * appears in the owner's console, with the same status, the same timing and the
 * same credentials, instead of vanishing into a shell nobody can see. An API
 * with no screen is only inspectable if both sides go through one surface.
 *
 * `api spec --check` is the reliability gate, and it asks exactly one question:
 * is every route this repo serves also written down. See `api-spec.ts` for why
 * it is deliberately not an OpenAPI validator.
 */
interface CallResult {
  ok: boolean;
  status: number | null;
  statusText: string | null;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  url: string;
  error?: string;
}

interface SavedRequest {
  id: string;
  name: string;
  method: string;
  path: string;
  note: string | null;
}

export function registerApi(program: Command): void {
  const cmd = program
    .command("api")
    .description("Call this service and check it describes its own routes");

  cmd
    .command("list")
    .description("The requests saved with this service, in api/requests.json")
    .option("--app <webAppId>", "the service, when this folder holds more than one")
    .action(
      action(async ({ ctx, opts }) => {
        const appId = requireApp(opts.app);
        const res = await api<{
          requests: SavedRequest[];
          notes: string[];
          environments: Record<string, string | null>;
        }>(ctx, `/v1/apps/${encodeURIComponent(appId)}/api/requests`);

        ok(res, () => {
          for (const note of res?.notes ?? []) line(pc.dim(note));
          for (const r of res?.requests ?? []) {
            line(
              `${pc.dim(r.method.padEnd(6))}${r.path}${r.note ? pc.dim(`  ${r.note}`) : ""}`,
            );
          }
        });
      }),
    );

  cmd
    .command("call <path>")
    .description(
      'workser api call /orders --method POST --body \'{"item":1}\' [--env local|preview|production]',
    )
    .option("--app <webAppId>", "the service, when this folder holds more than one")
    .option("--method <verb>", "GET by default")
    .option("--body <text>", "request body, already serialised")
    .option(
      "--header <name:value>",
      "extra header; repeat for more than one",
      collectHeader,
      {} as Record<string, string>,
    )
    .option(
      "--env <name>",
      "local (default), preview or production — the host comes from here, never from the path",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        const appId = requireApp(opts.app);
        const res = await api<CallResult>(
          ctx,
          `/v1/apps/${encodeURIComponent(appId)}/api/call`,
          {
            body: {
              environment: opts.env,
              method: opts.method,
              path: args[0],
              headers: opts.header,
              body: opts.body,
            },
          },
        );

        ok(res, () => {
          if (!res?.ok) {
            line(pc.red(res?.error ?? "The service did not answer."));
            return;
          }
          const code = `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
          const colour =
            res.status && res.status < 300
              ? pc.green
              : res.status && res.status < 500
                ? pc.yellow
                : pc.red;
          line(`${colour(code)}  ${pc.dim(`${res.durationMs}ms  ${res.url}`)}`);
          if (res.body) line(res.body);
          if (res.truncated) line(pc.dim("(answer truncated)"));
        });

        // A call that never completed is a failure of the command. A 4xx/5xx is
        // NOT: the request succeeded and the service gave an informative
        // answer, and exiting non-zero on it would make `api call` unusable for
        // checking that a route correctly rejects something.
        if (!res?.ok) process.exitCode = 1;
      }),
    );

  cmd
    .command("spec")
    .description(
      "Compare the routes this repo serves with the ones it documents — `--check` fails on a gap",
    )
    .option("--check", "exit non-zero when a route has no entry in the spec")
    .action(
      action(async ({ ctx, opts }) => {
        requireLocalApp(ctx, "api spec");

        const files = listRepoFiles(ctx.cwd);
        const routes = discoverRoutes(files);
        const specFile = SPEC_FILES.find((f) => files.includes(f)) ?? null;
        const documented = specFile
          ? specPaths(readIfPresent(join(ctx.cwd, specFile)))
          : [];
        const report = specReport(routes, documented);
        const summary = specSummary(report, specFile);

        ok({ ...report, specFile, summary }, () => {
          for (const r of report.routes) {
            const known = report.missing.some((m) => m.path === r.path);
            line(
              `${known ? pc.yellow("undocumented") : pc.green("documented  ")}  ${r.path}${pc.dim(`  ${r.file}`)}`,
            );
          }
          for (const p of report.stale) {
            line(`${pc.dim("in spec only ")}  ${p}`);
          }
          line("");
          if (report.ok && specFile) success(summary);
          else line(pc.yellow(summary));
        });

        if (opts.check && !report.ok) {
          throw new WorkserError(summary, { code: "bad_request" });
        }
        if (opts.check && !specFile) {
          throw new WorkserError(summary, { code: "bad_request" });
        }
      }),
    );
}

/**
 * `--header 'X-Thing: value'`, repeatable.
 *
 * Split on the FIRST colon only: a value is very often a URL, and splitting on
 * every colon would turn `X-Callback: https://x` into a header with the value
 * `https`.
 */
function collectHeader(
  raw: string,
  previous: Record<string, string>,
): Record<string, string> {
  const at = raw.indexOf(":");
  if (at <= 0) return previous;
  return { ...previous, [raw.slice(0, at).trim()]: raw.slice(at + 1).trim() };
}

function requireApp(app: unknown): string {
  const value = typeof app === "string" ? app.trim() : "";
  if (value) return value;
  throw new WorkserError(
    "Which service? Pass --app <webAppId>; `workser app list` shows them.",
    { code: "bad_request" },
  );
}

function readIfPresent(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Repo-relative file paths, skipping the directories that would dominate the
 * walk and contain no routes of ours.
 *
 * Depth-capped: a route six directories deep is legal and rare, and an
 * uncapped walk of a folder someone has built into is the difference between a
 * check that runs in a moment and one that scans `.next`.
 */
function listRepoFiles(root: string, maxDepth = 8): string[] {
  const SKIP = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".vercel",
    "__pycache__",
    ".venv",
    "venv",
  ]);
  const out: string[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || out.length > 5000) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".") && name !== ".well-known") continue;
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full, depth + 1);
      else out.push(relative(root, full).split(sep).join("/"));
    }
  };

  walk(root, 0);
  return out;
}
