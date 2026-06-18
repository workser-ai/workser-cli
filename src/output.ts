import pc from "picocolors";
import { WorkserError } from "./errors.js";

/**
 * Output is designed to be read by BOTH humans and AI agents.
 * - `--json` → a single stable line: {"ok":true,"data":...} / {"ok":false,"error":...}
 * - default  → terse, colorized human text
 * Agents should always pass `--json`; the schema is stable and easy to parse.
 */
export type OutputMode = "text" | "json";

let mode: OutputMode = "text";
let quiet = false;

export function configureOutput(opts: { json?: boolean; quiet?: boolean }): void {
  mode = opts.json ? "json" : "text";
  quiet = Boolean(opts.quiet);
}

export function isJson(): boolean {
  return mode === "json";
}

/** Emit a successful result. In JSON mode prints the envelope; otherwise runs `human`. */
export function ok(data: unknown, human?: () => void): void {
  if (mode === "json") {
    process.stdout.write(JSON.stringify({ ok: true, data }) + "\n");
    return;
  }
  if (human) {
    human();
  } else {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  }
}

/** A plain human line (suppressed in JSON / quiet mode). */
export function line(msg = ""): void {
  if (mode === "json" || quiet) return;
  process.stdout.write(msg + "\n");
}

export function info(msg: string): void {
  line(pc.dim(msg));
}

export function success(msg: string): void {
  line(pc.green("✓ ") + msg);
}

export function warn(msg: string): void {
  if (mode === "json" || quiet) return;
  process.stderr.write(pc.yellow("! ") + msg + "\n");
}

/** Print an error in the active mode and exit with a meaningful code. */
export function fail(err: unknown): never {
  const e =
    err instanceof WorkserError
      ? err
      : new WorkserError(err instanceof Error ? err.message : String(err));

  if (mode === "json") {
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: { code: e.code, message: e.message, status: e.status, details: e.details },
      }) + "\n",
    );
  } else {
    process.stderr.write(pc.red("✗ ") + e.message + "\n");
    if (e.code === "not_connected") {
      process.stderr.write(pc.dim("  Open Workser Orbit, or run `workser login` for standalone use.\n"));
    } else if (e.status === 401 || e.code === "unauthorized") {
      process.stderr.write(pc.dim("  Run `workser login` to authenticate.\n"));
    } else if (e.code === "no_project") {
      process.stderr.write(pc.dim("  Run `workser project use <id>` or pass --project <id>.\n"));
    } else if (e.code === "awaiting_approval") {
      process.stderr.write(pc.dim("  Approve the action in Workser Orbit, then retry.\n"));
    }
  }
  process.exit(exitCodeFor(e));
}

function exitCodeFor(e: WorkserError): number {
  if (e.code === "not_connected") return 4;
  if (e.status === 401 || e.code === "unauthorized") return 3;
  if (e.code === "awaiting_approval") return 5;
  return 1;
}
