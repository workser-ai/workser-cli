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
  /** Free tags, shared with the project's work items — absent on an older API. */
  labels?: string[];
  /** Which app this document is about, or null. */
  webAppId?: string | null;
  /** Which parts of the infrastructure it concerns. */
  infraRefs?: string[];
  /** architecture | api-spec | flow | tech-spec | plan | note, or null. */
  docKind?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * WHAT KIND OF DOCUMENT THIS IS.
 *
 * A MIRROR of `src/app/orbit/lib/docKinds.pure.ts` and the daemon's
 * `doc-kinds.ts` — three separate build targets, none able to import the
 * others. See the renderer copy for why the vocabulary is what it is.
 *
 * The hints are not decoration. Without them every document an agent writes
 * becomes a `plan`, because that is the one word whose meaning is obvious
 * without being told.
 */
const DOC_KINDS: Record<string, string> = {
  architecture: "how the whole thing fits together — the parts and their edges",
  "api-spec": "the contract between two parts: routes, shapes, errors",
  flow: "a sequence — a user journey, or a path data takes",
  "tech-spec": "the design of ONE change, written before it is built",
  plan: "the steps to do it, and in what order",
  note: "deliberately not a spec — a capture, a scratch page",
};

const KIND_HELP = Object.entries(DOC_KINDS)
  .map(([kind, hint]) => `${kind} (${hint})`)
  .join("; ");

/**
 * The metadata a caller actually set — never a key it left alone.
 *
 * `--label a --label b` arrives as an array from commander's `<name...>`; a
 * single `--label a` arrives as a one-element array. Omitting a flag leaves the
 * field `undefined`, which upstream reads as "do not change", so an update that
 * only sets the title cannot silently clear the labels.
 */
function metaBody(opts: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const labels = toList(opts.label);
  const infra = toList(opts.infra);
  if (labels) body.labels = labels;
  if (infra) body.infraRefs = infra;
  if (typeof opts.app === "string") body.webAppId = opts.app;
  if (typeof opts.kind === "string") {
    // REFUSED, not silently dropped. Everywhere else here a bad value is
    // ignored, because losing a tag is cheaper than losing the document it was
    // on. The kind is different: it is the field that answers "does this
    // project have an architecture document", and a misspelled one produces a
    // confident NO. Better to fail the call and say the six words.
    if (!(opts.kind in DOC_KINDS)) {
      throw new WorkserError(
        `Unknown --kind "${opts.kind}". Use one of: ${Object.keys(DOC_KINDS).join(", ")}.`,
        { code: "bad_request" },
      );
    }
    body.kind = opts.kind;
  }
  return body;
}

function toList(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return undefined;
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
    // Narrowing, so "has anyone written about this already" is one call rather
    // than a list of four hundred to read. Matched on the server, so the answer
    // covers the whole project and not just the first page of it.
    .option("--search <text>", "match the title, case-insensitively")
    .option("--label <name>", "only documents carrying this label")
    .option("--app <id>", "only documents about this app")
    .option("--infra <name>", "only documents touching this part of the infrastructure")
    // `--kind none` is the one that matters most: it answers "what has been
    // written here and never filed", which is the backlog, and "is there an
    // architecture document at all" is `--kind architecture` returning nothing.
    .option("--kind <kind>", `only this kind — ${Object.keys(DOC_KINDS).join(" | ")} | none`)
    .option("--limit <n>", "cap the number returned (most recently updated first)")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const rows =
          (await api<OrbitDocument[]>(ctx, `/v1/projects/${projectId}/documents`, {
            query: {
              workItemId: opts.workItem,
              q: opts.search,
              label: opts.label,
              webAppId: opts.app,
              infra: opts.infra,
              kind: opts.kind,
              limit: opts.limit,
            },
          })) ?? [];
        ok(rows, () => {
          if (!rows.length) {
            line(pc.dim("No documents yet."));
            return;
          }
          for (const r of rows) {
            const link = r.workItemId ? pc.dim(` ↳ ${r.workItemId}`) : "";
            const file = r.filePath ? pc.dim(`  ${r.filePath}`) : "";
            const tags = [...(r.labels ?? []), ...(r.infraRefs ?? [])];
            const meta = tags.length ? pc.dim(`  [${tags.join(", ")}]`) : "";
            // The kind leads, because it is what tells a reader whether this
            // row is worth opening before they read the title.
            const kind = r.docKind ? pc.dim(`${r.docKind}  `) : "";
            line(`${pc.dim(r.id)}  ${kind}${r.title}${meta}${link}${file}`);
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
    // WHAT IT IS ABOUT — the three fields that make a list of four hundred
    // documents searchable instead of scrollable. Agents write most of these,
    // so if the CLI cannot set them the metadata is empty forever and the
    // filters on the Docs screen have nothing to filter.
    .option("--kind <kind>", `what this document IS — ${KIND_HELP}`)
    .option("--label <name...>", "tag it — shares the project's label vocabulary")
    .option("--app <id>", "which app this document is about")
    .option(
      "--infra <name...>",
      "what it touches: database, storage, auth, domains, functions, env, connections, deploy",
    )
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
            ...metaBody(opts),
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
    .command("file <id>")
    .description("File an existing document — its kind, labels, app, infrastructure")
    // The retro-fit. Fourteen documents already exist in a typical project and
    // every one of them is unfiled; without this the only way to classify them
    // is to rewrite them.
    .option("--kind <kind>", `what this document IS — ${KIND_HELP}`)
    .option("--label <name...>", "tag it — shares the project's label vocabulary")
    .option("--app <id>", "which app this document is about")
    .option("--infra <name...>", "what it touches: database, storage, auth, …")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const id = String(args[0] ?? "").trim();
        const body = metaBody(opts);
        if (!id || Object.keys(body).length === 0) {
          throw new WorkserError(
            "Give a document id and at least one of --kind / --label / --app / --infra.",
            { code: "bad_request" },
          );
        }
        const row = await api<OrbitDocument>(
          ctx,
          `/v1/projects/${projectId}/documents/${id}`,
          { method: "PATCH", body },
        );
        ok(row, () => line(`Filed ${pc.bold(row?.title ?? id)}.`));
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
