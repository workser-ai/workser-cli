import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";
import { parseDeployEnvironment } from "../environments.js";
import { WorkserError } from "../errors.js";

export function registerVersions(program: Command): void {
  program
    .command("versions")
    .description("List the Workser-managed versions of the project (deploy history)")
    .option("--app <webAppId>", "which app (defaults to the primary app)")
    .option(
      "--env <environment>",
      "which environment `deployed` should mean: preview or production",
    )
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        // Without `--env`, "deployed" means the newest deployment of ANY
        // environment — which is the old behaviour and is ambiguous in the one
        // case that matters: a commit live in preview and a commit live in
        // production both read as "deployed". Passing an environment makes the
        // badge answer the question people are actually asking.
        const parsed = parseDeployEnvironment(opts.env, "versions");
        if (!parsed.ok) {
          throw new WorkserError(parsed.error!, { code: "bad_input" });
        }
        const items = await api(ctx, `/v1/projects/${projectId}/versions`, {
          query: {
            ...(opts.app ? { webAppId: String(opts.app) } : {}),
            ...(parsed.value ? { environment: parsed.value } : {}),
          },
        });
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No versions yet. `workser deploy` to create one."));
          for (const v of items) {
            line(formatVersion(v));
          }
        });
      }),
    );
}

function formatVersion(v: any): string {
  const ref = pc.yellow(shortRef(v.ref));
  const when = pc.dim(formatTime(v.createdAt));
  const msg = (v.message ?? "").trim() || pc.dim("(no message)");
  // Naming the environment on the badge, when we were told one. "deployed"
  // alone was the ambiguity this flag exists to remove; printing it unqualified
  // beside an `--env production` request would put it straight back.
  const badge = v.deployed
    ? "  " + pc.green(v.deployedEnvironment ? `live in ${v.deployedEnvironment}` : "deployed")
    : "";
  const url = v.url ? "  " + pc.cyan(v.url) : "";
  return `${ref}  ${when}  ${msg}${badge}${url}`;
}

function shortRef(ref?: string): string {
  if (!ref) return "—";
  return ref.length > 7 ? ref.slice(0, 7) : ref;
}

function formatTime(t?: string | number): string {
  if (t === undefined || t === null) return "—";
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? String(t) : d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
}
