import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "dist", "index.js");

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Parsed first JSON line of stdout (the `--json` envelope), if present. */
  json: any;
}

/**
 * Spawn the BUILT CLI (`dist/index.js`) as a child process, exactly as an agent
 * would invoke it. Returns the exit code + captured stdio + parsed --json envelope.
 *
 * We force a clean env (no inherited WORKSER_* / session) so tests are
 * hermetic and depend only on the flags passed; HOME is redirected to a temp
 * dir so the real ~/.workser session never leaks in.
 */
export function runCli(
  args: string[],
  opts: { endpoint?: string; token?: string; cwd?: string; home?: string; env?: Record<string, string> } = {},
): Promise<CliResult> {
  const fullArgs = [...args];
  if (opts.endpoint) fullArgs.push("--endpoint", opts.endpoint);
  if (opts.token) fullArgs.push("--token", opts.token);

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    // Hermetic: drop any ambient Workser config from the test runner's shell.
    WORKSER_API_URL: undefined,
    WORKSER_DAEMON_URL: undefined,
    WORKSER_TOKEN: undefined,
    WORKSER_ENV: undefined,
    NO_COLOR: "1",
    ...(opts.home ? { HOME: opts.home, USERPROFILE: opts.home } : {}),
    ...opts.env,
  };

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...fullArgs], {
      cwd: opts.cwd ?? process.cwd(),
      env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      let parsed: any;
      const firstLine = stdout.split("\n").find((l) => l.trim().startsWith("{"));
      if (firstLine) {
        try {
          parsed = JSON.parse(firstLine);
        } catch {
          /* not json */
        }
      }
      resolve({ code: code ?? 0, stdout, stderr, json: parsed });
    });
  });
}
