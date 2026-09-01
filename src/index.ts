import { Command } from "commander";
import { configureOutput, fail } from "./output.js";

import { registerHelp } from "./commands/help.js";
import { registerStatus } from "./commands/status.js";
import { registerLogin } from "./commands/login.js";
import { registerWhoami } from "./commands/whoami.js";
import { registerProject } from "./commands/project.js";
import { registerDb } from "./commands/db.js";
import { registerAuth } from "./commands/auth.js";
import { registerStorage } from "./commands/storage.js";
import { registerNeon } from "./commands/neon.js";
import { registerEnv } from "./commands/env.js";
import { registerKey } from "./commands/key.js";
import { registerDeploy } from "./commands/deploy.js";
import { registerVersions } from "./commands/versions.js";
import { registerLogs } from "./commands/logs.js";
import { registerDomain } from "./commands/domain.js";
import { registerOpen } from "./commands/open.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerAgent } from "./commands/agent.js";
import { registerCloudAgent } from "./commands/cloud-agent.js";
import { registerVerify } from "./commands/verify.js";
import { registerCheckpoint } from "./commands/checkpoint.js";
import { registerSync } from "./commands/sync.js";
import { registerWorkflow } from "./commands/workflow.js";
import { registerConnection } from "./commands/connection.js";
import { registerTool } from "./commands/tool.js";
import { registerMemory } from "./commands/memory.js";
import { registerNote } from "./commands/note.js";
import { registerBusiness } from "./commands/business.js";
import { registerArtifact } from "./commands/artifact.js";
import { registerImage } from "./commands/image.js";
import { registerVideo } from "./commands/video.js";
import { registerAudio } from "./commands/audio.js";
import { registerAsk } from "./commands/ask.js";
import { registerSearch } from "./commands/search.js";
import { registerBoard } from "./commands/board.js";
import { registerTask } from "./commands/task.js";
import { registerGoal } from "./commands/goal.js";
import { assertRoleMayRun } from "./role-guard.js";
import { registerDecision } from "./commands/decision.js";
import { registerDoc } from "./commands/doc.js";
import { registerDesign } from "./commands/design.js";
import { registerApi } from "./commands/api.js";
import { registerAnalysis } from "./commands/analysis.js";
import { registerScan } from "./commands/scan.js";
import { registerHealth } from "./commands/health.js";
import { registerUrls } from "./commands/urls.js";
import { registerDeployments } from "./commands/deployments.js";
import { registerUsage } from "./commands/usage.js";

// Version is inlined at build time (see `define` in tsup.config.ts) so the
// single self-contained dist/index.js needs no sibling package.json at runtime.
declare const __WORKSER_VERSION__: string;
const pkg = {
  version:
    typeof __WORKSER_VERSION__ === "string" ? __WORKSER_VERSION__ : "0.0.0-dev",
};

const program = new Command();

program
  .name("workser")
  .description(
    "Workser CLI — give your local AI agent native DevOps & infrastructure.\n" +
      "The agent runs `workser …` to provision databases, deploy, and manage real apps\n" +
      "on Workser — on the user's own tokens, through the Orbit cockpit (auth + approvals).",
  )
  .version(pkg.version, "-v, --version", "print the CLI version")
  .option(
    "--json",
    "machine-readable JSON output (always use this from agents/scripts)",
  )
  .option("-q, --quiet", "suppress non-essential output")
  .option(
    "-p, --project <id>",
    "target project id (overrides the linked project)",
  )
  .option("-C, --cwd <dir>", "run as if started in <dir>")
  .option("--endpoint <url>", "override the Workser endpoint (daemon or cloud)")
  .option("--token <token>", "override the auth token")
  .hook("preAction", (thisCommand, actionCommand) => {
    const o = actionCommand.optsWithGlobals();
    configureOutput({ json: o.json, quiet: o.quiet });
  });

// Register command groups. `help` goes first so it heads the command list — it is
// the entry point an agent that knows nothing else will reach for.
registerHelp(program);
registerStatus(program);
registerLogin(program);
registerWhoami(program);
registerProject(program);
registerDb(program);
registerAuth(program);
registerStorage(program);
registerNeon(program);
registerEnv(program);
registerKey(program);
registerDeploy(program);
registerVersions(program);
registerLogs(program);
registerDomain(program);
registerOpen(program);
registerDoctor(program);
registerAgent(program);
registerCloudAgent(program);
registerVerify(program);
registerApi(program);
registerAnalysis(program);
registerScan(program);
registerHealth(program);
registerUrls(program);
registerDeployments(program);
registerUsage(program);
registerCheckpoint(program);
registerSync(program);
registerWorkflow(program);
registerConnection(program);
registerTool(program);
registerMemory(program);
registerNote(program);
registerBusiness(program);
registerArtifact(program);
registerImage(program);
registerVideo(program);
registerAudio(program);
registerAsk(program);
registerSearch(program);
registerBoard(program);
registerTask(program);
registerGoal(program);
registerDecision(program);
registerDoc(program);
registerDesign(program);

/**
 * The role check runs BEFORE commander dispatches.
 *
 * Not inside `action()`: by the time a command's handler runs it has already
 * been resolved, and a `--help` or a validation error would report the wrong
 * thing first. Here the refusal is the only thing that happens.
 */
// Commander has not run its preAction hook yet, so prime the two output flags
// the guard may need. Without this, `workser --json ...` role refusals print
// human stderr and leave automation with no JSON envelope.
configureOutput({
  json: process.argv.includes("--json"),
  quiet: process.argv.includes("--quiet") || process.argv.includes("-q"),
});
try {
  assertRoleMayRun(process.argv.slice(2));
} catch (e) {
  fail(e);
}

program.parseAsync(process.argv).catch((e) => fail(e));
