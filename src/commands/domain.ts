import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";

export function registerDomain(program: Command): void {
  const domain = program.command("domain").description("Attach and list custom domains");

  domain
    .command("set <domain>")
    .description("Attach a custom domain to the project (returns DNS instructions)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/domains`, { body: { domain: args[0] } });
        ok(res, () => {
          success(`Attached ${pc.bold(args[0])}.`);
          if (res.dns?.length) {
            line(pc.dim("Add these DNS records:"));
            for (const r of res.dns) line(`  ${r.type}  ${r.name}  →  ${r.value}`);
          }
        });
      }),
    );

  domain
    .command("list")
    .description("List domains attached to the project")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/domains`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No custom domains."));
          for (const d of items) line(`${d.domain}${pc.dim("  " + (d.status ?? ""))}`);
        });
      }),
    );
}
