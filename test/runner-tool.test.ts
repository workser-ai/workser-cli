import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runnerToolContext } from "../src/commands/tool.js";

/** Inside a runner, `workser tool` speaks for the run (plan Phase 7). */
describe("runnerToolContext", () => {
  it("is the run when the runner's id, api and token are present", () => {
    expect(
      runnerToolContext({ WORKSER_RUN_ID: "run-1", WORKSER_RUNNER_API: "https://api.workser.ai/", WORKSER_RUNNER_TOKEN: "wsrn_abc" }),
    ).toEqual({ base: "https://api.workser.ai/v1/runner/runs/run-1", auth: "Bearer wsrn_abc", via: "token" });
  });

  it("reads the token from the runner's token file", () => {
    const dir = mkdtempSync(join(tmpdir(), "wt-"));
    const file = join(dir, "t.env");
    writeFileSync(file, "WORKSER_RUNNER_TOKEN=wsrn_file\nWORKSER_RUNNER_TOKEN_EXPIRES_AT=x\n");
    expect(runnerToolContext({ WORKSER_RUN_ID: "run-1", WORKSER_RUNNER_API: "http://core", WORKSER_RUNNER_TOKEN_FILE: file })?.auth).toBe(
      "Bearer wsrn_file",
    );
  });

  it("prefers the runner's broker, which never shows the run token", () => {
    expect(
      runnerToolContext({
        WORKSER_RUNNER_BROKER_URL: "http://127.0.0.1:5123/",
        WORKSER_RUNNER_BROKER_KEY: "wsbrk_local",
        WORKSER_RUN_ID: "run-1",
        WORKSER_RUNNER_API: "http://core",
        WORKSER_RUNNER_TOKEN: "wsrn_abc",
      }),
    ).toEqual({ base: "http://127.0.0.1:5123", auth: "Bearer wsbrk_local", via: "broker" });
  });

  it("ignores a broker address that isn't this machine's loopback", () => {
    expect(
      runnerToolContext({ WORKSER_RUNNER_BROKER_URL: "http://evil.example:80", WORKSER_RUNNER_BROKER_KEY: "wsbrk_local" }),
    ).toBeNull();
  });

  it("is nothing outside a runner, or with a token that is not a run token", () => {
    expect(runnerToolContext({})).toBeNull();
    expect(runnerToolContext({ WORKSER_RUN_ID: "run-1", WORKSER_RUNNER_API: "http://core", WORKSER_RUNNER_TOKEN: "wsr_run_x" })).toBeNull();
  });
});
