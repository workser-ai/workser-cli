import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";
import { assertDomainAllowed } from "../reserved-domains.js";

/**
 * Custom domains, for the agent.
 *
 * ## Why this used to refuse everything
 *
 * `domain set` was `ownerOnly` — a categorical refusal telling the agent to ask
 * a human. That was the right default while nothing stopped an agent attaching
 * a hostname the platform itself answers on, and the wrong one afterwards: the
 * team is supposed to run the project's infrastructure, and "ask your owner to
 * do it in another app" is not running anything.
 *
 * ## What replaced it — two gates, not zero
 *
 * 1. **A reserved-domain refusal in code.** `assertDomainAllowed` blocks
 *    `workser.ai` and every subdomain, plus hostnames the hosting provider
 *    assigns. Checked HERE, before the request leaves, so the agent gets a
 *    reason it can act on rather than a 403 it will retry.
 * 2. **The daemon's approval prompt.** `domain.set` and `domain.remove` are
 *    gated actions: unless the run's autonomy allows them outright, the daemon
 *    asks the owner and returns 423 until they answer. That gate already
 *    existed — this command simply stopped being the thing that prevented
 *    anyone reaching it.
 *
 * The order matters. A reserved name is refused without ever bothering the
 * owner, so the approval prompt keeps meaning "a real domain, is this the one
 * you wanted" rather than becoming noise the owner learns to click through.
 */
export function registerDomain(program: Command): void {
  const domain = program
    .command("domain")
    .description("Manage the project's custom domains");

  domain
    .command("add <domain>")
    .description("Attach a custom domain or subdomain (asks the owner to confirm)")
    .option("--app <webAppId>", "Which app to attach it to")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        // Throws with a reason the agent can read and act on. Never a bare 403.
        const host = assertDomainAllowed(String(args[0]));
        const result = await api(
          ctx,
          opts.app
            ? `/v1/projects/${projectId}/web-apps/${opts.app}/domains`
            : `/v1/projects/${projectId}/domains`,
          { method: "POST", body: { domain: host } },
        );
        ok(result, () => {
          line(`${pc.green("Attached")} ${host}`);
          // DNS is the part that is not done when this returns, and the part
          // an agent will otherwise report as finished.
          line(
            pc.dim(
              "It goes live once DNS points at us. Run `workser domain list` to see its status.",
            ),
          );
        });
      }),
    );

  domain
    .command("rm <domain>")
    .description("Detach a custom domain (asks the owner to confirm)")
    .option("--app <webAppId>", "Which app it is attached to")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const host = String(args[0]).trim().toLowerCase();
        const result = await api(
          ctx,
          opts.app
            ? `/v1/projects/${projectId}/web-apps/${opts.app}/domains/${encodeURIComponent(host)}`
            : `/v1/projects/${projectId}/domains/${encodeURIComponent(host)}`,
          { method: "DELETE" },
        );
        ok(result, () => line(`${pc.yellow("Detached")} ${host}`));
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
