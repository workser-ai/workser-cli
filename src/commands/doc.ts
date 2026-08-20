import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";
import { WorkserError } from "../errors.js";
import { recordEntityStep } from "./record-step.js";
import { diagramKind, extractDiagrams } from "../mermaid-fences.js";
import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/**
 * `workser doc` — the project's Docs (`daemon/routes/documents.ts`), the same
 * table a human creating a page in Orbit's Docs panel writes to.
 *
 * As with `board`, read came late and matters most: an agent that can only
 * `create` rewrites the same page from scratch every session instead of
 * revising the one already there, and it can never answer "what did we already
 * write down about this?" — which is the entire reason a project keeps docs.
 *
 * A document's body has two representations and they are not interchangeable:
 * `contentJson` is what the Orbit editor renders, and the `.workser/docs/<id>.md`
 * mirror is what an agent (and git) can read as text. `--markdown` writes both;
 * `show --markdown` reads the mirror path back so the agent can open the file
 * with its normal tools rather than trying to reconstruct prose from blocks.
 */
interface OrbitDocument {
  id: string;
  projectId: string;
  workItemId: string | null;
  title: string;
  contentJson: string;
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export function registerDoc(program: Command): void {
  const doc = program.command("doc").description("Read and write project documents");

  doc
    .command("list")
    .description("List the project's documents — check here before writing a new one")
    // A work item has at most ONE linked document, so this narrows to that one
    // (or to nothing). Unfiltered, the list includes linked and unlinked pages
    // alike — Orbit's Docs panel hides the linked ones because it shows them on
    // their card instead, but an agent looking for prior art wants both.
    .option("--work-item <id>", "the document linked to this card, if there is one")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const rows =
          (await api<OrbitDocument[]>(ctx, `/v1/projects/${projectId}/documents`, {
            query: { workItemId: opts.workItem },
          })) ?? [];
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No documents yet."));
            return;
          }
          for (const r of rows) {
            const link = r.workItemId ? pc.dim(` ↳ ${r.workItemId}`) : "";
            const file = r.filePath ? pc.dim(`  ${r.filePath}`) : "";
            line(`${pc.dim(r.id)}  ${r.title}${link}${file}`);
          }
        });
      }),
    );

  doc
    .command("show <id>")
    .description("Show a document — `--markdown` prints the file mirror's path to read")
    .option("--markdown", "report the repo-relative markdown mirror instead of the block content")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const row = await api<OrbitDocument>(
          ctx,
          `/v1/projects/${projectId}/documents/${args[0]}`,
        );
        if (opts.markdown) {
          ok({ id: row.id, title: row.title, filePath: row.filePath }, () => {
            line(`${pc.bold(row.title)}  ${pc.dim(row.id)}`);
            line(
              row.filePath
                ? `Read it at ${pc.bold(row.filePath)} (relative to the project folder).`
                : pc.dim("This document has no markdown mirror on disk yet."),
            );
          });
          return;
        }
        ok(row, () => {
          line(`${pc.bold(row.title)}  ${pc.dim(row.id)}`);
          if (row.workItemId) line(pc.dim(`linked to work item ${row.workItemId}`));
          if (row.filePath) line(pc.dim(`markdown mirror: ${row.filePath}`));
          line("");
          line(row.contentJson);
        });
      }),
    );

  doc
    .command("create <title>")
    .description(
      "workser doc create \"Onboarding\" [--work-item <id>] [--markdown ...] [--content-json ...]",
    )
    .option("--work-item <id>", "link this document to a work item")
    .option("--markdown <text>", "document body as markdown")
    .option("--content-json <json>", "document body as rich-text content JSON")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const title = String(args[0] ?? "").trim();
        if (!title) {
          throw new WorkserError("A document needs a title.", { code: "bad_request" });
        }

        const row = await api(ctx, `/v1/projects/${projectId}/documents`, {
          body: {
            title,
            workItemId: opts.workItem,
            markdown: opts.markdown,
            contentJson: opts.contentJson,
          },
        });

        await recordEntityStep(ctx, {
          title: `Created document: ${title}`,
          refType: "agent_created_document",
          refId: row?.id,
          output: { document: row },
        });

        ok(row, () => line(`Created document ${pc.bold(row?.id ?? "")} — ${title}`));
      }),
    );

  doc
    .command("diagram <id>")
    .description(
      "List the diagrams in a document — `--check` fails when it has none",
    )
    // The gate half. An architecture document with no diagram in it is a
    // document that says it explains how the system fits together and does not;
    // this is the cheapest way for an agent to catch that in its own work
    // before a human reads it and has to say so.
    .option("--check", "exit non-zero when the document contains no diagram")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const row = await api<OrbitDocument>(
          ctx,
          `/v1/projects/${projectId}/documents/${args[0]}`,
        );
        if (!row) {
          throw new WorkserError(`No document with id "${args[0]}" on this project.`, {
            code: "bad_request",
          });
        }

        // Read the MIRROR, not `contentJson`. The mirror is the markdown a
        // human and git both see, and a diagram that is in the block content
        // but missing from the mirror is exactly the failure worth catching.
        const markdown = readMirror(ctx.cwd, row.filePath);
        const diagrams = markdown === null ? [] : extractDiagrams(markdown);

        const payload = {
          id: row.id,
          title: row.title,
          filePath: row.filePath,
          diagrams: diagrams.map((code) => ({ kind: diagramKind(code), code })),
        };

        ok(payload, () => {
          line(`${pc.bold(row.title)}  ${pc.dim(row.id)}`);
          if (markdown === null) {
            line(
              pc.dim(
                row.filePath
                  ? `Could not read ${row.filePath} from this folder.`
                  : "This document has no markdown mirror on disk yet.",
              ),
            );
          } else if (!diagrams.length) {
            line(pc.dim("No diagrams in this document."));
          } else {
            for (const [i, code] of diagrams.entries()) {
              const kind = diagramKind(code) ?? "diagram";
              line(`${pc.dim(String(i + 1))}  ${kind}  ${pc.dim(`${code.split("\n").length} lines`)}`);
            }
          }
        });

        if (opts.check && !diagrams.length) {
          throw new WorkserError(
            markdown === null
              ? `"${row.title}" has no markdown on disk to check. Save it from the Docs panel, or write it with \`workser doc update ${row.id} --markdown ...\`.`
              : `"${row.title}" has no diagram. Add one with a \`\`\`mermaid fence describing how the pieces fit together.`,
            { code: "bad_request" },
          );
        }
      }),
    );

  doc
    .command("update <id>")
    .description("Revise an existing document rather than creating a second copy of it")
    .option("--title <text>", "new title")
    .option("--markdown <text>", "replace the body with this markdown")
    .option("--content-json <json>", "replace the body with this rich-text content JSON")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const body: Record<string, unknown> = {
          title: opts.title,
          markdown: opts.markdown,
          contentJson: opts.contentJson,
        };
        if (Object.values(body).every((v) => v === undefined)) {
          throw new WorkserError(
            "Nothing to update — pass at least one of --title, --markdown, --content-json.",
            { code: "bad_request" },
          );
        }

        const row = await api<OrbitDocument>(
          ctx,
          `/v1/projects/${projectId}/documents/${args[0]}`,
          { method: "PATCH", body },
        );
        if (!row) {
          throw new WorkserError(`No document with id "${args[0]}" on this project.`, {
            code: "bad_request",
          });
        }
        ok(row, () => line(`Updated document ${pc.bold(row.id)} — ${row.title}`));
      }),
    );
}

/**
 * The document's markdown mirror, read from this folder.
 *
 * `filePath` is repo-relative (`.workser/docs/<id>.md`) because it is stored by
 * whichever machine last saved the document, and an absolute path from someone
 * else's computer would be meaningless here. Returns null — never throws — for
 * "no mirror" and "cannot read it", which the caller words differently.
 */
function readMirror(cwd: string, filePath: string | null): string | null {
  if (!filePath) return null;
  try {
    return readFileSync(isAbsolute(filePath) ? filePath : join(cwd, filePath), "utf8");
  } catch {
    return null;
  }
}
