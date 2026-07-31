import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * Neon Backend — the project's OWN infrastructure on its Neon branch: an
 * S3-compatible object store and Node.js HTTP functions, both branching with
 * the database.
 *
 * Why this is a separate group from `workser storage`: that one is the default
 * Cloudflare R2 bucket every project gets. This is additive and only exists for
 * projects on dedicated infrastructure in a supported region. Collapsing them
 * would leave the agent unable to tell which store a file actually landed in.
 *
 * Run `workser neon status` first — it reports tenancy, per-capability toggles,
 * and the REGION verdict. A project outside the supported regions cannot use
 * these at all (the region is fixed when the project is created), and that is a
 * fact to report to the user, not something to retry around.
 *
 * File bytes never pass through Workser: `put`/`get` ask the daemon for a
 * presigned URL and then transfer directly against Neon.
 */
export function registerNeon(program: Command): void {
  const neon = program
    .command("neon")
    .description(
      "The project's own Neon backend: object storage buckets and functions",
    );

  neon
    .command("status")
    .description(
      "Whether this project can use Neon storage/functions (tenancy, toggles, region)",
    )
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const s = await api(ctx, `/v1/projects/${projectId}/neon-backend/status`);
        ok(s, () => {
          line(
            `Dedicated infrastructure: ${s.dedicated ? pc.green("yes") : pc.yellow("no")}`,
          );
          line(
            `Region: ${s.regionId ? pc.bold(s.regionId) : pc.dim("unknown")}` +
              (s.regionId
                ? s.regionSupportsNeonBackend
                  ? pc.green("  (supported)")
                  : pc.red("  (Neon storage/functions unavailable here)")
                : ""),
          );
          line(`Object storage: ${s.neonBackendStorageEnabled ? "on" : "off"}`);
          line(`Functions:      ${s.neonBackendFunctionsEnabled ? "on" : "off"}`);
          if (s.regionId && !s.regionSupportsNeonBackend) {
            line(
              pc.dim(
                `Supported regions: ${(s.supportedRegions ?? []).join(", ")}. ` +
                  `A project's region is fixed at creation — this cannot be changed here.`,
              ),
            );
          }
        });
      }),
    );

  // ---- object storage -------------------------------------------------------

  const storage = neon
    .command("storage")
    .description("S3-compatible buckets on the project's Neon branch");

  storage
    .command("list")
    .description("List the project's Neon buckets")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const buckets = await api(
          ctx,
          `/v1/projects/${projectId}/neon-storage/buckets`,
        );
        ok(buckets, () => {
          if (!buckets?.length)
            return line(pc.dim("No buckets. `workser neon storage create <name>`."));
          for (const b of buckets)
            line(`${b.bucket_name}${pc.dim(`  (${b.access_level})`)}`);
        });
      }),
    );

  storage
    .command("create <name>")
    .description("Create a bucket on the project's Neon branch")
    .option("--public", "Allow public reads (default: private)")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/neon-storage/buckets`,
          {
            body: {
              name: args[0],
              accessLevel: opts.public ? "public_read" : "private",
            },
          },
        );
        ok(res, () => success(`Created bucket ${pc.bold(res.bucket_name ?? args[0])}.`));
      }),
    );

  storage
    .command("rm <bucket>")
    .description("Delete a bucket AND everything in it (asks for approval)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/neon-storage/buckets/${encodeURIComponent(args[0])}`,
          { method: "DELETE" },
        );
        ok(res, () => success(`Deleted bucket ${args[0]}.`));
      }),
    );

  storage
    .command("ls <bucket> [prefix]")
    .description("List objects in a bucket")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/neon-storage/buckets/${encodeURIComponent(args[0])}/objects`,
          { query: { prefix: args[1] } },
        );
        const objects = res?.objects ?? res ?? [];
        ok(res, () => {
          if (!objects.length) return line(pc.dim("Empty."));
          for (const o of objects)
            line(`${o.key ?? o.name}${o.size ? pc.dim(`  ${o.size} bytes`) : ""}`);
        });
      }),
    );

  storage
    .command("put <bucket> <local> [key]")
    .description("Upload a file (key defaults to the file's name)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const [bucket, local] = args;
        const key = args[2] || basename(local);

        const body = await readFile(local).catch(() => {
          throw new WorkserError(`Can't read ${local}.`, { code: "not_found" });
        });

        const signed = await presign(ctx, projectId, bucket, key, "upload");
        // The bytes go straight to Neon — never through the daemon or core-api,
        // so a large upload is not bounded by a JSON request body.
        const res = await fetch(signed.url, {
          method: "PUT",
          body,
          headers: signed.headers ?? {},
        });
        if (!res.ok) {
          throw new WorkserError(
            `Upload failed (${res.status} ${res.statusText}).`,
            { code: "upload_failed", status: res.status },
          );
        }
        ok({ bucket, key, bytes: body.length }, () =>
          success(`Uploaded ${key} to ${bucket} ${pc.dim(`(${body.length} bytes)`)}.`),
        );
      }),
    );

  storage
    .command("get <bucket> <key> [dest]")
    .description("Download an object (dest defaults to the key's file name)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const [bucket, key] = args;
        const dest = args[2] || basename(key);

        const signed = await presign(ctx, projectId, bucket, key, "download");
        const res = await fetch(signed.url);
        if (!res.ok) {
          throw new WorkserError(
            `Download failed (${res.status} ${res.statusText}).`,
            { code: "download_failed", status: res.status },
          );
        }
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(dest, buf);
        ok({ bucket, key, dest, bytes: buf.length }, () =>
          success(`Saved ${dest} ${pc.dim(`(${buf.length} bytes)`)}.`),
        );
      }),
    );

  storage
    .command("url <bucket> <key>")
    .description("Print a temporary download URL for one object")
    .option("--expires <seconds>", "Lifetime of the URL", "3600")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const signed = await presign(
          ctx,
          projectId,
          args[0],
          args[1],
          "download",
          Number(opts.expires) || 3600,
        );
        ok(signed, () => line(signed.url));
      }),
    );

  storage
    .command("rm-object <bucket> <key>")
    .description("Delete one object from a bucket (asks for approval)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/neon-storage/buckets/${encodeURIComponent(args[0])}/objects`,
          { method: "DELETE", query: { key: args[1] } },
        );
        ok(res, () => success(`Deleted ${args[1]} from ${args[0]}.`));
      }),
    );

  // ---- functions ------------------------------------------------------------

  const functions = neon
    .command("functions")
    .description("Node.js HTTP functions on the project's Neon branch");

  functions
    .command("list")
    .description("List the project's Neon functions")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const fns = await api(ctx, `/v1/projects/${projectId}/neon-functions`);
        ok(fns, () => {
          if (!fns?.length)
            return line(pc.dim("No functions. `workser neon functions deploy`."));
          for (const f of fns)
            line(`${f.slug ?? f.name}${f.url ? pc.dim(`  ${f.url}`) : ""}`);
        });
      }),
    );

  functions
    .command("deploy <slug> <zip>")
    .description("Deploy a function from a zip bundle")
    .option(
      "--env <pairs...>",
      "Environment variables for the function (KEY=VALUE)",
    )
    .option("--runtime <runtime>", "Runtime override")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const [slug, zipPath] = args;

        const zip = await readFile(zipPath).catch(() => {
          throw new WorkserError(`Can't read ${zipPath}.`, { code: "not_found" });
        });

        const environment: Record<string, string> = {};
        for (const pair of opts.env ?? []) {
          const eq = String(pair).indexOf("=");
          if (eq <= 0) {
            throw new WorkserError(
              `--env expects KEY=VALUE, got "${pair}".`,
              { code: "bad_request" },
            );
          }
          environment[String(pair).slice(0, eq)] = String(pair).slice(eq + 1);
        }

        const res = await api(ctx, `/v1/projects/${projectId}/neon-functions`, {
          body: {
            slug,
            // JSON rather than multipart: the caller is an agent shelling out,
            // and base64 in a JSON body is the shape it can produce unaided.
            zipBase64: zip.toString("base64"),
            zipFilename: basename(zipPath),
            runtime: opts.runtime,
            environment: Object.keys(environment).length ? environment : undefined,
          },
        });
        ok(res, () =>
          success(
            `Deployed ${pc.bold(slug)}${res?.url ? pc.dim(`  ${res.url}`) : ""}.`,
          ),
        );
      }),
    );

  functions
    .command("rm <slug>")
    .description("Delete a function (asks for approval)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(
          ctx,
          `/v1/projects/${projectId}/neon-functions/${encodeURIComponent(args[0])}`,
          { method: "DELETE" },
        );
        ok(res, () => success(`Deleted function ${args[0]}.`));
      }),
    );
}

/** Ask the daemon for a presigned URL for one object. */
async function presign(
  ctx: Parameters<typeof api>[0],
  projectId: string,
  bucket: string,
  key: string,
  operation: "upload" | "download",
  expiresInSeconds?: number,
): Promise<{ url: string; headers?: Record<string, string> }> {
  const res = await api(
    ctx,
    `/v1/projects/${projectId}/neon-storage/buckets/${encodeURIComponent(bucket)}/presign`,
    { body: { key, operation, expiresInSeconds } },
  );
  const url = res?.url ?? res?.signedUrl ?? res?.presignedUrl;
  if (!url) {
    throw new WorkserError(
      `The daemon did not return a presigned URL for ${key}.`,
      { code: "unexpected_response", details: res },
    );
  }
  return { url, headers: res?.headers };
}
