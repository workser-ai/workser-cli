/**
 * `workser scan` — the check nobody remembers to run.
 *
 * Three questions, asked of the code as it is right now:
 *
 *   deps        Is anything we depend on known to be broken?
 *   secrets     Did we just write a password into the repository?
 *   permissions Can this app reach further than it should?
 *
 * WHY THIS IS PART OF THE PRODUCT AND NOT A LINTER. The person shipping this
 * software is not going to read a vulnerability database, and the agents
 * writing it will happily paste a key into a config file when that is the
 * shortest path to a working feature. The one moment either of those is
 * catchable is before the code goes out, from something that runs on its own.
 *
 * THE RULES THIS FILE HOLDS ITSELF TO
 *
 *  1. **Zero findings is a result, not silence.** A scan that prints nothing is
 *     indistinguishable from a scan that did not run, and the second one is the
 *     one that gets shipped. Every check reports whether it RAN.
 *
 *  2. **A check that could not run says so.** No network, no lockfile, no git —
 *     each of those makes an answer impossible, and reporting "no problems
 *     found" for a check that never happened is the worst output this could
 *     produce. It is a `skipped` entry with a reason, never a pass.
 *
 *  3. **Only added lines.** Secrets are matched against what a diff ADDS. The
 *     alternative — scanning the whole tree — fires on every example file and
 *     every fixture forever, and a finding people scroll past is not a finding.
 *
 * All of it is pure: text in, findings out. The command wrapper does the git
 * and the npm.
 */

export type Severity = "high" | "medium" | "low";
export type CheckName = "deps" | "secrets" | "permissions";

export interface Finding {
  check: CheckName;
  severity: Severity;
  /** One line, in the terms of what goes wrong — not the pattern that matched. */
  title: string;
  /** Where, when there is a where. */
  file?: string;
  line?: number;
  /** What to do about it. A finding with no fix is a complaint. */
  fix: string;
}

export interface Skipped {
  check: CheckName;
  /** Why no answer was possible. Never "no problems found". */
  reason: string;
}

export interface ScanReport {
  findings: Finding[];
  /** The checks that actually ran. */
  checked: CheckName[];
  skipped: Skipped[];
  counts: Record<Severity, number>;
  /** False when anything high-severity was found. */
  ok: boolean;
}

/* ─────────────────────────────── secrets ─────────────────────────────── */

interface SecretPattern {
  name: string;
  re: RegExp;
  severity: Severity;
}

/**
 * What a leaked credential actually looks like.
 *
 * Ordered most specific first, and every one of them anchored to a shape that
 * is hard to produce by accident. A generic "any 32-character string" rule was
 * tried and removed: it fires on hashes, on lockfile integrity fields, and on
 * base64 images, and one week of that teaches everyone to pass `--no-verify`.
 */
const SECRET_PATTERNS: SecretPattern[] = [
  { name: "a private key", re: /-----BEGIN[A-Z ]*PRIVATE KEY-----/, severity: "high" },
  { name: "an AWS access key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, severity: "high" },
  { name: "a GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, severity: "high" },
  { name: "a Stripe live key", re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/, severity: "high" },
  { name: "an OpenAI key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/, severity: "high" },
  { name: "an Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/, severity: "high" },
  { name: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/, severity: "high" },
  { name: "a Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, severity: "high" },
  {
    name: "a database password in a connection string",
    re: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s:@/]+@/,
    severity: "high",
  },
  {
    // The everyday one: `API_KEY = "…"` with something real on the right.
    name: "a secret written into the code",
    re: /(?:secret|password|passwd|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*["'`][^"'`\s]{12,}["'`]/i,
    severity: "high",
  },
];

/**
 * Values that match a pattern and are not secrets.
 *
 * Every one of these is a real false positive that would otherwise fire on
 * ordinary, correct code. A placeholder is how you are SUPPOSED to write an
 * example, and flagging it punishes the right behaviour.
 */
const PLACEHOLDER = /(?:example|placeholder|changeme|your[_-]?|xxx+|\.\.\.|<[^>]+>|\$\{|process\.env|os\.environ|REPLACE|dummy|sample|test[_-]?key|fake)/i;

/** Files where a credential-shaped string is the point of the file. */
const SECRET_EXEMPT = /(?:\.example$|\.sample$|\.template$|(?:^|\/)(?:fixtures?|__fixtures__|__tests__|test|tests|spec|mocks?)\/|\.(?:test|spec)\.[jt]sx?$|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|(?:^|\/)workser-scan\.md$)/;

/** One added line of a unified diff, with the file it belongs to. */
export interface DiffLine {
  file: string;
  line: number;
  text: string;
}

/**
 * Pull the ADDED lines out of a unified diff, with real line numbers.
 *
 * Line numbers come from the hunk headers rather than being counted from the
 * top of the file: a finding that points at the wrong line is a finding someone
 * dismisses as a false positive.
 */
export function addedLines(diff: string): DiffLine[] {
  const out: DiffLine[] = [];
  let file: string | null = null;
  let lineNo = 0;

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      const path = raw.slice(4).trim();
      // `/dev/null` is a deletion; there is nothing added to look at.
      file = path === "/dev/null" ? null : path.replace(/^b\//, "");
      continue;
    }
    if (raw.startsWith("--- ") || raw.startsWith("diff --git")) continue;
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith("+")) {
      out.push({ file, line: lineNo, text: raw.slice(1) });
      lineNo++;
      continue;
    }
    // Context and removals both advance the new-file cursor only when they
    // exist in the new file — a removal does not.
    if (raw.startsWith(" ")) lineNo++;
  }
  return out;
}

export function secretFindings(diff: string): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const added of addedLines(diff)) {
    if (SECRET_EXEMPT.test(added.file)) continue;
    for (const pattern of SECRET_PATTERNS) {
      if (!pattern.re.test(added.text)) continue;
      if (PLACEHOLDER.test(added.text)) continue;
      // One finding per file per pattern: a config file with six keys in it is
      // one problem to fix, and six identical lines is a wall to scroll past.
      const key = `${added.file}:${pattern.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        check: "secrets",
        severity: pattern.severity,
        title: `This change adds ${pattern.name} to the code`,
        file: added.file,
        line: added.line,
        fix: "Move the value into an environment setting (`workser env set`) and use it from there. If it has already been committed, treat it as leaked and replace it at the source.",
      });
      break;
    }
  }
  return findings;
}

/* ──────────────────────────────── deps ───────────────────────────────── */

/**
 * Read `npm audit --json`.
 *
 * Only `high` and `critical` become findings. npm reports low-severity
 * advisories on transitive dev dependencies by the dozen, and a report whose
 * first twenty lines do not matter is a report nobody reaches the end of.
 */
export function depFindings(auditJson: string | null | undefined): Finding[] {
  if (!auditJson) return [];
  let parsed: any;
  try {
    parsed = JSON.parse(auditJson);
  } catch {
    return [];
  }
  const vulns = parsed?.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return [];

  const findings: Finding[] = [];
  for (const [name, raw] of Object.entries<any>(vulns)) {
    const severity = String(raw?.severity ?? "").toLowerCase();
    if (severity !== "high" && severity !== "critical") continue;
    const direct = raw?.isDirect === true;
    const fixable = raw?.fixAvailable;
    findings.push({
      check: "deps",
      severity: "high",
      title: `${name} has a known ${severity} security problem`,
      fix:
        fixable === true
          ? `Run \`npm audit fix\`${direct ? "" : " — it is pulled in by another package"}.`
          : typeof fixable === "object" && fixable?.name
            ? `Fixing it means moving to ${fixable.name}@${fixable.version}, which is a breaking change. Decide it deliberately.`
            : "There is no published fix yet. Decide whether this package is worth keeping.",
    });
  }
  // Worst first is the wrong sort here — they are all high. Alphabetical is at
  // least stable, so the same scan twice does not look like it changed.
  return findings.sort((a, b) => a.title.localeCompare(b.title));
}

/* ───────────────────────────── permissions ───────────────────────────── */

export interface RepoFile {
  path: string;
  content: string;
}

/**
 * What this app can reach that it probably should not.
 *
 * Three specific, common, real mistakes — not a general audit. Each one has
 * been seen in generated code and each one is invisible until it is exploited.
 */
export function permissionFindings(files: RepoFile[], trackedFiles: string[] = []): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    // 1. A secret handed to the browser. `NEXT_PUBLIC_` is compiled into the
    //    JavaScript every visitor downloads — this is not a leak risk, it is a
    //    leak, and it reads exactly like the safe version one line above.
    for (const match of file.content.matchAll(
      /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE)[A-Z0-9_]*/g,
    )) {
      findings.push({
        check: "permissions",
        severity: "high",
        title: `${match[0]} is sent to every visitor's browser`,
        file: file.path,
        fix: "Anything named NEXT_PUBLIC_ is public by design. Rename it without that prefix and read it on the server only.",
      });
    }

    // 2. A wide-open CORS header: any website can call this API with the
    //    visitor's credentials attached.
    if (
      /["']Access-Control-Allow-Origin["']\s*[:,]\s*["']\*["']/.test(file.content) &&
      /Access-Control-Allow-Credentials/.test(file.content)
    ) {
      findings.push({
        check: "permissions",
        severity: "high",
        title: "This service accepts credentialed requests from any website",
        file: file.path,
        fix: "Name the sites allowed to call it instead of `*`, or stop sending credentials.",
      });
    }
  }

  // 3. A real `.env` committed to the repository. Not the example — the one
  //    with the values in it.
  for (const tracked of trackedFiles) {
    const base = tracked.split("/").pop() ?? tracked;
    if (!/^\.env(\.[a-z0-9-]+)?$/i.test(base)) continue;
    if (/\.(example|sample|template)$/i.test(base)) continue;
    findings.push({
      check: "permissions",
      severity: "high",
      title: `${tracked} is committed to the repository`,
      file: tracked,
      fix: "Add it to .gitignore, remove it from the repo, and treat every value in it as leaked.",
    });
  }

  return findings;
}

/* ─────────────────────────────── report ──────────────────────────────── */

export function buildReport(input: {
  findings: Finding[];
  checked: CheckName[];
  skipped: Skipped[];
}): ScanReport {
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of input.findings) counts[f.severity]++;
  return {
    findings: [...input.findings].sort(
      (a, b) => rank(b.severity) - rank(a.severity) || a.title.localeCompare(b.title),
    ),
    checked: input.checked,
    skipped: input.skipped,
    counts,
    ok: counts.high === 0,
  };
}

function rank(s: Severity): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

/**
 * The one-line result.
 *
 * It names what RAN, always. "Nothing found" on its own is the sentence a
 * broken scanner prints, and the reader cannot tell the difference.
 */
export function scanSummary(report: ScanReport): string {
  const ran = report.checked.length;
  if (!ran) return "Nothing could be checked — see the reasons above.";

  const what = report.checked.join(", ");
  const total = report.findings.length;
  if (!total) {
    return `Checked ${what} — nothing found.`;
  }
  const high = report.counts.high;
  return (
    `Checked ${what} — ${total} ${total === 1 ? "thing" : "things"} to look at` +
    (high ? `, ${high} of them serious.` : ".")
  );
}
