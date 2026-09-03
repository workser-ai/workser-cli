import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY DAEMON PATH STARTS WITH /v1.
 *
 * ─── THE BUG THIS CATCHES ───────────────────────────────────────────────
 *
 * `api()` sends `ctx.endpoint + path` verbatim — it adds no prefix — and the
 * daemon refuses anything outside `/v1/` with a 404 whose message is about
 * routing, not about the command:
 *
 *   {"ok":false,"error":{"code":"bad_request",
 *    "message":"Not a /v1 route.","status":404, …}}
 *
 * Four commands shipped without the prefix — `image generate`, `image
 * understand`, `video understand`, `audio understand`, all added in the same
 * change — so every one of them 404'd on first use. Nothing else in the CLI
 * catches it: the path is a string, the daemon is a different process, and
 * the only feedback is that message, which reads like a broken daemon rather
 * than a typo in the caller.
 *
 * A grep is the right shape of test here. The alternative — a live call per
 * command — needs a daemon, and this bug is entirely visible in the source.
 *
 * A path that OPENS with an interpolation is skipped — `business.ts` builds
 * its base through `businessPath()`, which prefixes /v1 itself, and there is
 * nothing in the literal to read. An interpolation later in the path (an id,
 * a project) is fine: the prefix is still there in plain text.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (entry.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** `api(ctx, "<path>"` / `api<T>(\n ctx as Context,\n `<path>`` — both spellings. */
const CALL = /\bapi\s*(?:<[^>()]*>)?\(\s*ctx[^,]*,\s*(["'`])([^"'`]*)/g;

describe("api() call sites", () => {
  const found: { file: string; path: string }[] = [];
  for (const file of sourceFiles("src")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(CALL)) {
      found.push({ file, path: match[2] });
    }
  }

  it("finds the call sites at all, so a rename cannot make this vacuous", () => {
    expect(found.length).toBeGreaterThan(20);
  });

  it("prefixes every one with /v1 — the only routes the daemon serves", () => {
    const wrong = found.filter(
      (c) => !c.path.startsWith("${") && !c.path.startsWith("/v1/"),
    );
    expect(
      wrong.map((c) => `${c.file}: ${c.path}`),
      "these would 404 with 'Not a /v1 route.'",
    ).toEqual([]);
  });
});
