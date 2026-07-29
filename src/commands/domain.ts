import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ownerOnly } from "../capabilities.js";
import { ok, line } from "../output.js";

export function registerDomain(program: Command): void {
  const domain = program.command("domain").description("Inspect the project's custom domains");

  domain
    .command("set <domain>")
    .description("(owner-only) Attach a custom domain — do this in Workser Orbit")
    .action(
      action(() =>
        ownerOnly({
          action: "domain set",
          reason: "attaching a custom domain",
          owner: "add the domain (and verify DNS)",
        }),
      ),
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
