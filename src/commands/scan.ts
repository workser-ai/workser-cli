import type { Command } from "commander";
import pc from "picocolors";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { action } from "../run.js";
import { ok, line, success } from "../output.js";
import { WorkserError } from "../errors.js";
import {
  buildReport,
  depFindings,
  permissionFindings,
  scanSummary,
  secretFindings,
  type CheckName,
  type Finding,
  type RepoFile,
  type Skipped,
} from "../scan.js";

/**
 * `workser scan` — deps, secrets and permissions, over this folder.
 *
 * ENTIRELY LOCAL. No daemon, no project, no login: it reads files and shells
 * out to git and npm. That is deliberate — the moment this is worth running is
 * before anything has been published, on a machine that may not be linked to
 * anything yet, and a check that needs an account is a check that gets skipped.
 *
 * The security rules it enforces are in `scan.ts`; this file is the plumbing
 * that fetches the three inputs and prints the result. The one judgement it
 * makes on its own is which of them it could not get, and it says so out loud —
 * see rule 2 in `scan.ts`. `--check` exits non-zero on anything serious, so a
 * step can gate on it.
 */
export function registerScan(program: Command): void {
  program
    .command("scan")
    .description("Check this folder for known-bad dependencies, leaked secrets and over-broad permissions")
    .option("--check", "exit non-zero if anything serious is found", false)
    .option(
      "--only <checks>",
      "comma-separated subset: deps, secrets, permissions",
    )
    .option(
      "--staged",
      "look at staged changes only, rather than everything not yet committed",
      false,
    )
    .action(
      action(async ({ ctx, opts }) => {
        const only = parseOnly(opts.only);
        const findings: Finding[] = [];
        const checked: CheckName[] = [];
        const skipped: Skipped[] = [];

        if (only.has("secrets")) runSecrets(ctx.cwd, !!opts.staged, findings, checked, skipped);
        if (only.has("deps")) runDeps(ctx.cwd, findings, checked, skipped);
        if (only.has("permissions")) runPermissions(ctx.cwd, findings, checked, skipped);

        const report = buildReport({ findings, checked, skipped });
        const summary = scanSummary(report);

        ok({ ...report, summary }, () => print(report, summary));

        if (opts.check && !report.ok) {
          throw new WorkserError(summary, { code: "bad_request" });
        }
      }),
    );
}

function parseOnly(raw: unknown): Set<CheckName> {
  const all: CheckName[] = ["deps", "secrets", "permissions"];
  if (typeof raw !== "string" || !raw.trim()) return new Set(all);
  const wanted = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CheckName => (all as string[]).includes(s));
  // An empty result means every name was a typo. Running everything would hide
  // that; running nothing and saying so does not.
  if (!wanted.length) {
    throw new WorkserError(
      `--only takes any of: ${all.join(", ")}.`,
      { code: "bad_request" },
    );
  }
  return new Set(wanted);
}

/* ─────────────────────────────── secrets ─────────────────────────────── */

function runSecrets(
  cwd: string,
  staged: boolean,
  findings: Finding[],
  checked: CheckName[],
  skipped: Skipped[],
): void {
  const args = staged
    ? ["diff", "--cached", "--unified=0"]
    : // Against HEAD, so it covers both staged and unstaged work: the agent
      // that just wrote the key has not staged anything.
      ["diff", "HEAD", "--unified=0"];
  const diff = git(cwd, args);
  if (diff === null) {
    skipped.push({
      check: "secrets",
      reason:
        "This folder isn’t a git repository yet, so there are no changes to look through.",
    });
    return;
  }
  checked.push("secrets");
  findings.push(...secretFindings(diff));
}

/* ──────────────────────────────── deps ───────────────────────────────── */

/**
 * `npm audit --json`.
 *
 * NEEDS THE NETWORK, and that is the interesting case: offline, npm exits
 * non-zero with a message, and the honest report is "could not check" rather
 * than a clean bill of health. It is also why the timeout is generous — a slow
 * registry answer is still an answer, and a 5-second cutoff would turn a normal
 * connection into a permanent skip.
 */
function runDeps(
  cwd: string,
  findings: Finding[],
  checked: CheckName[],
  skipped: Skipped[],
): void {
  const hasLock = ["package-lock.json", "npm-shrinkwrap.json"].some((f) =>
    existsSync(join(cwd, f)),
  );
  if (!hasLock) {
    skipped.push({
      check: "deps",
      reason: existsSync(join(cwd, "package.json"))
        ? "There’s no package-lock.json, so the exact versions in use aren’t known. Run `npm install` once."
        : "This folder has no npm packages to check.",
    });
    return;
  }

  const res = spawnSync("npm", ["audit", "--json", "--audit-level=high"], {
    cwd,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
    // `npm audit` exits 1 when it FINDS something, which is a successful run.
    // The failures that matter are the ones with no JSON on stdout.
  });

  const out = (res.stdout || "").trim();
  if (!out || res.error) {
    skipped.push({
      check: "deps",
      reason:
        "Couldn’t reach the package registry, so known problems in your dependencies weren’t checked. This needs an internet connection.",
    });
    return;
  }
  checked.push("deps");
  findings.push(...depFindings(out));
}

/* ───────────────────────────── permissions ───────────────────────────── */

function runPermissions(
  cwd: string,
  findings: Finding[],
  checked: CheckName[],
  skipped: Skipped[],
): void {
  const paths = listRepoFiles(cwd).filter(isReadable);
  const files: RepoFile[] = [];
  for (const path of paths.slice(0, 1500)) {
    try {
      const content = readFileSync(join(cwd, path), "utf8");
      // A minified bundle or a data blob is not source anyone wrote, and
      // matching a pattern inside one produces a finding with no fix.
      if (content.length > 400_000) continue;
      files.push({ path, content });
    } catch {
      // Unreadable is the same as absent here.
    }
  }

  const tracked = git(cwd, ["ls-files"]);
  checked.push("permissions");
  findings.push(
    ...permissionFindings(
      files,
      tracked === null ? [] : tracked.split("\n").filter(Boolean),
    ),
  );
  if (tracked === null) {
    // Reported alongside a check that DID run: two of the three permission
    // questions were answered, and the third silently was not.
    skipped.push({
      check: "permissions",
      reason:
        "Not a git repository, so we couldn’t check whether a .env file has been committed.",
    });
  }
}

/* ─────────────────────────────── output ──────────────────────────────── */

function print(report: ReturnType<typeof buildReport>, summary: string): void {
  for (const s of report.skipped) {
    line(`${pc.yellow("not checked")}  ${s.check}${pc.dim(` — ${s.reason}`)}`);
  }
  for (const f of report.findings) {
    const where = f.file ? pc.dim(`  ${f.file}${f.line ? `:${f.line}` : ""}`) : "";
    line(`${severityTag(f.severity)}  ${f.title}${where}`);
    line(`             ${pc.dim(f.fix)}`);
  }
  if (report.findings.length || report.skipped.length) line("");
  if (report.ok && !report.skipped.length) success(summary);
  else if (report.ok) line(pc.yellow(summary));
  else line(pc.red(summary));
}

function severityTag(severity: string): string {
  if (severity === "high") return pc.red("serious    ");
  if (severity === "medium") return pc.yellow("worth fixing");
  return pc.dim("minor      ");
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

/**
 * Run git, or answer null.
 *
 * Null means "could not ask" — no binary, not a repo, no commits yet. Every
 * caller turns that into a `skipped` entry rather than an empty result, because
 * an empty diff and an impossible diff are not the same fact.
 */
function git(cwd: string, args: string[]): string | null {
  try {
    const res = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (res.error || res.status !== 0) return null;
    return res.stdout || "";
  } catch {
    return null;
  }
}

const READABLE = /\.(?:[jt]sx?|mjs|cjs|json|ya?ml|toml|env|py|rb|go|rs|java|php|sh|sql|md|txt|html|css)$/i;

function isReadable(path: string): boolean {
  return READABLE.test(path);
}

function listRepoFiles(root: string, maxDepth = 8): string[] {
  const SKIP = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".vercel",
    "__pycache__",
    ".venv",
    "venv",
  ]);
  const out: string[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || out.length > 5000) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      // Dotfiles are skipped everywhere else in the CLI; here `.env` is
      // precisely what we are looking for, so only the noisy directories go.
      if (SKIP.has(name)) continue;
      if (name.startsWith(".") && !name.startsWith(".env")) continue;
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full, depth + 1);
      else out.push(relative(root, full).split(sep).join("/"));
    }
  };

  walk(root, 0);
  return out;
}
