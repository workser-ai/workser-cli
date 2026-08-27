import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * Third-party app connections (Composio, under the hood — named `connection`
 * here rather than after the provider, and distinct from Workser's OWN "app"
 * concept, i.e. the web/mobile apps a project builds) for the project:
 * connect one once, then search/browse/execute its tools. Reference-ID-scoped,
 * the same surface a project's own generated web app calls at runtime with
 * its business API key, so connections stay properly scoped to this project
 * rather than one shared platform credential.
 */
export function registerConnection(program: Command): void {
  const connection = program
    .command("connection")
    .description("Connect and use third-party app connections (Gmail, Slack, Stripe, ...)");

  connection
    .command("list")
    .description("List connectable toolkits and this project's existing connections")
    .option("--toolkit <slug>", "filter connections to one toolkit")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const [catalog, connections] = await Promise.all([
          api(ctx, `/v1/projects/${projectId}/integrations/apps`),
          api(ctx, `/v1/projects/${projectId}/integrations`, { query: { toolkit: opts.toolkit } }),
        ]);
        ok({ catalog, connections }, () => {
          const connected = new Set((connections ?? []).map((c: any) => c.toolkit ?? c.composio_app));
          for (const t of catalog ?? []) {
            const status = connected.has(t.slug) ? pc.green("connected") : pc.dim("not connected");
            line(`${t.slug}  ${pc.bold(t.name ?? t.slug)}  ${status}`);
          }
        });
      }),
    );

  connection
    .command("search <query>")
    .description("Full-text search for actions across every toolkit (or one, with --toolkit) — e.g. \"send email\"")
    .option("--toolkit <slug>", "narrow the search to one toolkit")
    .option("--limit <n>", "max results")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/integrations/search`, {
          query: { q: args[0], toolkit: opts.toolkit, limit: opts.limit },
        });
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No matching actions."));
          for (const t of items) {
            line(`${t.slug}  ${pc.dim(`[${t.toolkit}]`)}  ${t.description ?? ""}`);
          }
        });
      }),
    );

  connection
    .command("connect <toolkit>")
    .description("Start OAuth to connect a toolkit")
    .option("--reference-user-id <id>", "connect on behalf of one of the app's own end-users")
    .option("--redirect-url <url>", "where to send the user after OAuth completes")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/integrations/connect`, {
          body: {
            toolkit: args[0],
            reference_user_id: opts.referenceUserId,
            redirect_url: opts.redirectUrl,
          },
        });
        ok(res, () =>
          res.oauth_url
            ? line(`Open this URL to finish connecting: ${pc.underline(res.oauth_url)}`)
            : line(`Connection ${res.connection_id} is ${res.status}.`),
        );
      }),
    );

  connection
    .command("disconnect <connectionId>")
    .description("Disconnect a connection")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/integrations/${args[0]}`, {
          method: "DELETE",
        });
        ok(res, () => line("Disconnected."));
      }),
    );

  connection
    .command("tools <toolkit>")
    .description("List a connected toolkit's callable tools + their arguments")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/integrations/${args[0]}/tools`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No tools found."));
          for (const t of items) line(`${t.slug}  ${pc.dim(t.description ?? "")}`);
        });
      }),
    );

  connection
    .command("run <toolSlug>")
    .description("Execute one tool action (e.g. GOOGLESHEETS_APPEND_ROW)")
    .option("--body <args>", "the tool's arguments as a JSON string", "{}")
    .option("--reference-user-id <id>", "run on behalf of one of the app's own end-users")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/integrations/${args[0]}/execute`, {
          body: { arguments: JSON.parse(opts.body), reference_user_id: opts.referenceUserId },
        });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );
}
