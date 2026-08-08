import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * `workser design show` — the project's brand, as the agent should see it.
 *
 * READ-ONLY, DELIBERATELY. The brand's single source of truth is the
 * `business_settings` record the owner fills in (Orbit's Design → Brand tab and
 * the Business hub edit the same row), and `design/tokens.json` /
 * `design/tokens.css` are GENERATED from it and overwritten wholesale on every
 * sync — which is why the agent preamble tells the agent never to hand-edit
 * them. A `workser design set-brand` would give an agent a second writer for a
 * record whose whole value is that a human decided it, so the write side stays
 * in the app where the person who owns the brand is.
 *
 * What was missing was the read. The agent was told "read design/tokens.json if
 * it exists" and had no way to answer "does it, and what is in it?" without
 * guessing at a path in a working tree that may not have been synced yet. This
 * asks the server, which derives the tokens from the record directly — so it is
 * correct even before anything has been written to disk.
 */
interface DesignFile {
  path: string;
  contents: string;
}

interface DtcgToken {
  $value?: string;
  $type?: string;
}

export function registerDesign(program: Command): void {
  const design = program
    .command("design")
    .description("Read the project's brand (colours, fonts, logo)");

  design
    .command("show")
    .description("Show this project's brand — read it before writing any UI")
    .option("--raw", "print the generated token files verbatim instead of a summary")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api<{ files?: DesignFile[] }>(
          ctx,
          `/v1/projects/${projectId}/design/files`,
        );
        const files = res?.files ?? [];

        if (opts.raw) {
          ok(files, () => {
            if (!files.length) {
              line(pc.dim("No brand set for this project."));
              return;
            }
            for (const f of files) {
              line(pc.bold(f.path));
              line(f.contents);
              line("");
            }
          });
          return;
        }

        const tokens = parseTokens(files);
        // `files: []` and an unparseable token document mean the same thing to
        // a caller — no brand to follow — and the agent's instruction for that
        // case is already "choose sensible styling", not "ask the user".
        const summary = tokens
          ? {
              hasBrand: true,
              colors: tokens.color,
              fonts: tokens.font,
              brand: tokens.brand,
              files: files.map((f) => f.path),
            }
          : { hasBrand: false, colors: {}, fonts: {}, brand: {}, files: [] };

        ok(summary, () => {
          if (!tokens) {
            line(pc.dim("No brand set for this project — choose sensible styling yourself."));
            return;
          }
          for (const [name, value] of Object.entries(tokens.brand)) {
            line(`${pc.dim(name.padEnd(12))} ${value}`);
          }
          for (const [name, value] of Object.entries(tokens.color)) {
            line(`${pc.dim(`color.${name}`.padEnd(12))} ${value}`);
          }
          for (const [name, value] of Object.entries(tokens.font)) {
            line(`${pc.dim(`font.${name}`.padEnd(12))} ${value}`);
          }
          line("");
          line(
            pc.dim(
              `Generated into the working tree as ${files
                .map((f) => f.path)
                .join(", ")} — wire those in, never edit them.`,
            ),
          );
        });
      }),
    );
}

/**
 * Flatten the DTCG token document into plain name -> value pairs.
 *
 * The server emits `{ color: { primary: { $value, $type } }, font: {...},
 * brand: { name: "..." } }` (the shape `DesignSurface.tsx`'s `readTokens`
 * reads). `$value` is the only field a caller styling an app needs, so the
 * wrapper is unwrapped here rather than pushed onto every consumer.
 */
function parseTokens(
  files: DesignFile[],
): { color: Record<string, string>; font: Record<string, string>; brand: Record<string, string> } | null {
  const doc = files.find((f) => f.path.endsWith("tokens.json"));
  if (!doc) return null;
  try {
    const parsed = JSON.parse(doc.contents);
    return {
      color: unwrap(parsed.color),
      font: unwrap(parsed.font),
      brand: Object.fromEntries(
        Object.entries(parsed.brand ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    };
  } catch {
    return null;
  }
}

function unwrap(group: Record<string, DtcgToken> | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(group ?? {}).map(([k, v]) => [k, v?.$value ?? ""]),
  );
}
