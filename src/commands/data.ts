import type { Command } from "commander";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser data` — paid data endpoints (scrapers, leads, reviews, social,
 * SEO …) through Workser, with no API key: Workser holds it, checks the
 * project, caps the price and charges the project's credits.
 *
 * Four small commands, so an agent carries one line per endpoint instead of
 * hundreds of schemas:
 *
 *   workser data find "<what you need>"        → endpoints, one line each, with price
 *   workser data inspect <provider:/endpoint>  → the inputs it needs
 *   workser data run <provider:/endpoint> --input '{"…":…}'
 *                                              → a short preview; the FULL output
 *                                                goes to a file (--out)
 *   workser data status <runId>                → a long run, later
 *
 *   POST /v1/projects/:id/data/{find,inspect,run}
 *   GET  /v1/projects/:id/data/runs/:runId
 *   POST /v1/projects/:id/data/runs/:runId/stop
 */
export function registerData(program: Command): void {
  const data = program
    .command("data")
    .description("Paid data endpoints (scraping, leads, reviews, social, SEO…) through Workser — no API key needed");

  data
    .command("find <need>")
    .description("Find endpoints that can answer this — one line each, with price")
    .option("-n, --limit <n>", "how many", "5")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx as Context);
        const res = await api(ctx as Context, `/v1/projects/${projectId}/data/find`, {
          method: "POST",
          body: { query: args[0], limit: Number(opts.limit) || 5 },
        });
        ok(res, () => {
          const list = res?.endpoints ?? [];
          if (!list.length) return line(pc.dim("No endpoint fits. Try other words."));
          for (const e of list) line(`${pc.bold(e.id)}  ${pc.dim(e.price)}\n  ${e.what}`);
        });
      }),
    );

  data
    .command("inspect <endpoint>")
    .description("What an endpoint needs: required inputs, optional ones, price")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx as Context);
        const res = await api(ctx as Context, `/v1/projects/${projectId}/data/inspect`, {
          method: "POST",
          body: { endpoint: args[0] },
        });
        ok(res, () => {
          line(`${pc.bold(res?.id ?? args[0])}  ${pc.dim(res?.price ?? "")}`);
          if (res?.what) line(res.what);
          for (const f of res?.required ?? []) {
            line(`  ${pc.bold(f.name)} (${f.type})${f.oneOf ? ` one of ${f.oneOf.join(", ")}` : ""}${f.about ? ` — ${f.about}` : ""}`);
          }
          if (res?.optional?.length) line(pc.dim(`  optional: ${res.optional.join(", ")}`));
          if (res?.notes) line(pc.dim(res.notes));
        });
      }),
    );

  data
    .command("run <endpoint>")
    .description("Run an endpoint (charged to the project's credits). Prints a preview; the full output goes to a file")
    .option("-i, --input <json>", "the inputs, as JSON (see `workser data inspect`)")
    .option("--input-file <path>", "the inputs, from a JSON file")
    .option("-o, --out <path>", "where to write the full output (default ./workser-data/<runId>.json)")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx as Context);
        let input: unknown = {};
        try {
          if (opts.inputFile) input = JSON.parse(await readFile(resolve((ctx as Context).cwd, String(opts.inputFile)), "utf8"));
          else if (opts.input) input = JSON.parse(String(opts.input));
        } catch {
          throw new WorkserError("--input must be valid JSON (see `workser data inspect <endpoint>`).", { code: "bad_request" });
        }
        const res = await api(ctx as Context, `/v1/projects/${projectId}/data/run`, {
          method: "POST",
          body: { endpoint: args[0], input },
        });
        const file = await saveOutput(ctx as Context, res, opts.out);
        ok({ ...res, output: undefined, ...(file ? { file } : {}) }, () => printRun(res, file));
      }),
    );

  data
    .command("status <runId>")
    .description("A long run's state (and its output, once it's done)")
    .option("-o, --out <path>", "where to write the full output once done")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx as Context);
        const res = await api(ctx as Context, `/v1/projects/${projectId}/data/runs/${encodeURIComponent(args[0])}`);
        const file = await saveOutput(ctx as Context, res, opts.out);
        ok({ ...res, output: undefined, ...(file ? { file } : {}) }, () => printRun(res, file));
      }),
    );

  data
    .command("stop <runId>")
    .description("Stop a run that is still going")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx as Context);
        const res = await api(ctx as Context, `/v1/projects/${projectId}/data/runs/${encodeURIComponent(args[0])}/stop`, {
          method: "POST",
          body: {},
        });
        ok(res, () => line("Stopped."));
      }),
    );
}

/** The full output to a file, so the terminal (and the agent's context) gets only the preview. */
async function saveOutput(ctx: Context, res: any, out?: string): Promise<string | undefined> {
  if (res?.output === undefined || res?.output === null) return undefined;
  const file = resolve(ctx.cwd, out ? String(out) : join("workser-data", `${res.runId ?? Date.now()}.json`));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(res.output, null, 2));
  return file;
}

function printRun(res: any, file?: string) {
  const status = String(res?.status ?? "?");
  line(`${pc.bold(status)}${res?.resultCount !== undefined ? `  ${res.resultCount} results` : ""}${res?.runId ? pc.dim(`  run ${res.runId}`) : ""}`);
  if (res?.providerError) line(pc.yellow(`The data source failed: ${res.providerError} (not charged)`));
  if (res?.blocked) line(pc.yellow(`Blocked: ${res.blocked}`));
  if (!["COMPLETED", "FAILED", "BLOCKED", "STOPPED", "TIMED_OUT"].includes(status)) {
    line(pc.dim(`Still running — check with: workser data status ${res?.runId}`));
  }
  if (res?.preview !== undefined) line(JSON.stringify(res.preview, null, 2));
  if (file) line(pc.dim(`Full output: ${file}`));
}
