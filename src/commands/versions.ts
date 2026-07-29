import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

export function registerVersions(program: Command): void {
  program
    .command("versions")
    .description("List the Workser-managed versions of the project (deploy history)")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/versions`);
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
  const badge = v.deployed ? "  " + pc.green("deployed") : "";
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
