import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * Storage is a Cloudflare R2 bucket, provisioned per project. The agent operates
 * inside its ONE pinned project: provision the bucket (the daemon gates it with
 * an approval prompt), then list / upload / download objects. Uploads go through
 * the daemon (base64), which scopes them to the project's bucket; downloads use
 * the object's own URL returned by the file listing.
 */
export function registerStorage(program: Command): void {
  const storage = program.command("storage").description("Provision and work with the project's object storage (Cloudflare R2)");

  storage
    .command("create [name]")
    .description("Provision a storage bucket for the project (idempotent)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/provision/storage`, {
          body: { name: args[0] },
        });
        ok(res, () =>
          line(
            res.created === false
              ? `Bucket already exists${pc.dim(`  (${res.bucket})`)}.`
              : `Provisioned bucket ${pc.bold(res.bucket || "(pending)")}.`,
          ),
        );
      }),
    );

  storage
    .command("list")
    .description("Show the project's bucket")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, `/v1/projects/${projectId}/storage`);
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No bucket yet. `workser storage create`."));
          for (const b of items) line(b.bucket ?? b.name);
        });
      }),
    );

  storage
    .command("ls [prefix]")
    .description("List objects in the bucket (optionally under a key prefix)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const objects = await listFiles(ctx, projectId, args[0]);
        ok(objects, () => {
          if (!objects.length) return line(pc.dim("No objects."));
          for (const o of objects) {
            line(`${o.key}${pc.dim(`  ${fmtSize(o.size)}${o.lastModified ? "  " + o.lastModified : ""}`)}`);
          }
        });
      }),
    );

  storage
    .command("put <local> <key>")
    .description("Upload a local file to <key> in the bucket")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const [localPath, key] = args as [string, string];
        const bytes = await readFile(localPath).catch(() => {
          throw new WorkserError(`Can't read local file: ${localPath}`, { code: "bad_input" });
        });
        const dir = dirname(key);
        const res = await api(ctx, `/v1/projects/${projectId}/storage/upload-base64`, {
          body: {
            filename: basename(key),
            folder: dir === "." ? undefined : dir,
            dataBase64: bytes.toString("base64"),
          },
        });
        ok(res, () =>
          success(`Uploaded ${pc.bold(res.key ?? key)} ${pc.dim(`(${fmtSize(bytes.length)})`)}.`),
        );
      }),
    );

  storage
    .command("get <key> [dest]")
    .description("Download <key> to [dest] (or print the object's URL)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const [key, dest] = args as [string, string | undefined];
        const matches = await listFiles(ctx, projectId, key);
        const obj = matches.find((o: any) => o.key === key);
        if (!obj?.url) throw new WorkserError(`Object not found: ${key}`, { code: "not_found", status: 404 });
        if (!dest) {
          return ok({ key, url: obj.url }, () => line(obj.url));
        }
        const out = dest.endsWith("/") ? dest + basename(key) : dest;
        const bytes = await downloadFrom(obj.url);
        await writeFile(out, bytes);
        ok({ key, dest: out, bytes: bytes.length }, () =>
          success(`Downloaded ${pc.bold(key)} → ${out} ${pc.dim(`(${fmtSize(bytes.length)})`)}.`),
        );
      }),
    );
}

/** List objects under a prefix. The Orbit surface returns a flat array. */
async function listFiles(ctx: any, projectId: string, prefix?: string): Promise<any[]> {
  const res = await api(ctx, `/v1/projects/${projectId}/storage/files`, { query: { prefix } });
  return Array.isArray(res) ? res : (res?.files ?? res?.objects ?? []);
}

async function downloadFrom(url: string): Promise<Buffer> {
  const res = await rawFetch(url);
  if (!res.ok) throw new WorkserError(`Download failed (${res.status}).`, { code: "http_error", status: res.status });
  return Buffer.from(await res.arrayBuffer());
}

/** Raw fetch to an object-store URL (no auth header, no envelope). */
async function rawFetch(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (e) {
    throw new WorkserError("Can't reach object storage.", {
      code: "not_connected",
      details: e instanceof Error ? e.message : String(e),
    });
  }
}

function fmtSize(n?: number): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
