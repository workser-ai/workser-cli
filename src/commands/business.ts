import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * Business hub for the local agent — the same project-scoped commerce/CRM
 * data (products, orders, customers, sales, content, marketing, support,
 * analytics) the Orbit desktop app's Business tab and workser-web's Business
 * hub manage. One generic resource-CRUD surface (mirroring the daemon's own
 * `business.ts` route, which forwards these same resource names verbatim)
 * rather than a hand-written command per domain — the 9 domains share an
 * identical `list/get/create/update/delete` shape, so a config table is far
 * less code than 9 near-duplicate command modules (same reasoning as the
 * daemon-side proxy route).
 */
// Most resources are flat (`/v1/projects/:id/<resource>[/:id]`). Sales and
// Support nest sub-resources under their base path (`/sales/deals/:id`, not
// `/sales/:id`) — mapped to a distinct dashed name here so `get`/`create`/
// `update`/`delete`/`action` (which all assume a flat `resource/id` shape)
// still work correctly for them. `list` additionally accepts a raw subpath
// for anything not covered here (e.g. `list sales pipelines/<id>/stages`).
const RESOURCE_PATHS: Record<string, string> = {
  "business-config": "business-config",
  "business-settings": "business-settings",
  products: "products",
  collections: "collections",
  navigations: "navigations",
  orders: "orders",
  customers: "customers",
  "sales-pipelines": "sales/pipelines",
  "sales-deals": "sales/deals",
  pages: "pages",
  "blog-posts": "blog-posts",
  media: "media",
  campaigns: "campaigns",
  "email-templates": "email-templates",
  discounts: "discounts",
  "seo-configs": "seo-configs",
  "social-accounts": "social-accounts",
  "support-conversations": "support/conversations",
  "automation-rules": "support/automation-rules",
  analytics: "analytics",
};
const RESOURCES = Object.keys(RESOURCE_PATHS);

export function registerBusiness(program: Command): void {
  const biz = program
    .command("business")
    .description(
      "Read/write the project's Business hub data (products, orders, customers, " +
        "sales, content, marketing, support, analytics)",
    );

  biz
    .command("resources")
    .description("List the known business resource names")
    .action(
      action(async () => {
        ok(RESOURCES, () => {
          for (const r of RESOURCES) line(r);
        });
      }),
    );

  biz
    .command("list <resource> [subpath]")
    .description(
      "List/read a resource, e.g. `workser business list products` or " +
        "`workser business list sales-pipelines <id>/stages`",
    )
    .option("--query <json>", "query params as a JSON object string")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const [resource, subpath] = args;
        const path = businessPath(projectId, resource, subpath);
        const query = opts.query ? JSON.parse(opts.query) : undefined;
        const res = await api(ctx, path, { query });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );

  biz
    .command("get <resource> <id>")
    .description("Get a single record by id, e.g. `workser business get products <productId>`")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const [resource, id] = args;
        const res = await api(ctx, `${businessPath(projectId, resource)}/${id}`);
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );

  biz
    .command("create <resource>")
    .description("Create a record, e.g. `workser business create products --body '{...}'`")
    .option("--body <json>", "record payload as a JSON object string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const [resource] = args;
        const res = await api(ctx, businessPath(projectId, resource), { body: JSON.parse(opts.body) });
        ok(res, () => line(`Created ${resource} ${pc.bold(res?.id ?? "")}.`));
      }),
    );

  biz
    .command("update <resource> <id>")
    .description("Update a record by id (PATCH/PUT — matches the underlying route)")
    .option("--body <json>", "changed fields as a JSON object string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const [resource, id] = args;
        // business-config/business-settings are PUT singletons (no :id in the
        // route at all); everything else is PATCH on /:resource/:id.
        const isSingleton = resource === "business-config" || resource === "business-settings";
        const path = isSingleton ? businessPath(projectId, resource) : `${businessPath(projectId, resource)}/${id}`;
        const res = await api(ctx, path, { method: isSingleton ? "PUT" : "PATCH", body: JSON.parse(opts.body) });
        ok(res, () => line("Updated."));
      }),
    );

  biz
    .command("delete <resource> <id>")
    .description("Delete a record by id")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const [resource, id] = args;
        const res = await api(ctx, `${businessPath(projectId, resource)}/${id}`, { method: "DELETE" });
        ok(res, () => line("Deleted."));
      }),
    );

  biz
    .command("action <resource> <id> <verb>")
    .description(
      "Call a named action route, e.g. `workser business action orders <id> cancel`, " +
        "`workser business action sales-deals <dealId> win` (POST .../<id>/<verb>)",
    )
    .option("--body <json>", "action payload as a JSON object string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const [resource, id, verb] = args;
        const res = await api(ctx, `${businessPath(projectId, resource)}/${id}/${verb}`, {
          method: "POST",
          body: JSON.parse(opts.body),
        });
        ok(res, () => line(JSON.stringify(res, null, 2)));
      }),
    );
}

function businessPath(projectId: string, resource: string, subpath?: string): string {
  const mapped = RESOURCE_PATHS[resource] ?? resource;
  const base = `/v1/projects/${projectId}/${mapped}`;
  return subpath ? `${base}/${subpath}` : base;
}
