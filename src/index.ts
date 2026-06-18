import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { configureOutput, fail } from "./output.js";

import { registerStatus } from "./commands/status.js";
import { registerLogin } from "./commands/login.js";
import { registerWhoami } from "./commands/whoami.js";
import { registerProject } from "./commands/project.js";
import { registerDb } from "./commands/db.js";
import { registerAuth } from "./commands/auth.js";
import { registerStorage } from "./commands/storage.js";
import { registerEnv } from "./commands/env.js";
import { registerDeploy } from "./commands/deploy.js";
import { registerLogs } from "./commands/logs.js";
import { registerDomain } from "./commands/domain.js";
import { registerOpen } from "./commands/open.js";

const pkg = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
);

const program = new Command();

program
  .name("workser")
  .description(
    "Workser CLI — give your local AI agent native DevOps & infrastructure.\n" +
      "The agent runs `workser …` to provision databases, deploy, and manage real apps\n" +
      "on Workser — on the user's own tokens, through the Orbit cockpit (auth + approvals).",
  )
  .version(pkg.version, "-v, --version", "print the CLI version")
  .option("--json", "machine-readable JSON output (always use this from agents/scripts)")
  .option("-q, --quiet", "suppress non-essential output")
  .option("-p, --project <id>", "target project id (overrides the linked project)")
  .option("-C, --cwd <dir>", "run as if started in <dir>")
  .option("--endpoint <url>", "override the Workser endpoint (daemon or cloud)")
  .option("--token <token>", "override the auth token")
  .hook("preAction", (thisCommand, actionCommand) => {
    const o = actionCommand.optsWithGlobals();
    configureOutput({ json: o.json, quiet: o.quiet });
  });

// Register command groups.
registerStatus(program);
registerLogin(program);
registerWhoami(program);
registerProject(program);
registerDb(program);
registerAuth(program);
registerStorage(program);
registerEnv(program);
registerDeploy(program);
registerLogs(program);
registerDomain(program);
registerOpen(program);

program.parseAsync(process.argv).catch((e) => fail(e));
