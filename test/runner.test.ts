import { describe, expect, it } from "vitest";
import { describeEvent, runnerBin, runnerLaunch } from "../src/commands/runner.js";

describe("workser run / runner", () => {
  it("prints a run's events the way a person reads them", () => {
    expect(describeEvent({ type: "step.started", data: { title: "Run tests" } })).toContain("Run tests");
    expect(describeEvent({ type: "check.result", data: { name: "test", status: "pass" } })).toContain("test");
    expect(describeEvent({ type: "run.completed", data: { summary: "Added GET /health." } })).toContain("Added GET /health.");
    expect(describeEvent({ type: "message.delta", data: { text: "x" } })).toBeNull();
    expect(describeEvent({ type: "step.completed", data: { status: "ok" } })).toBeNull();
  });

  it("never has a token to print: attach output is not formatted anywhere", () => {
    const shown = [
      describeEvent({ type: "run.started", data: { engine: "opencode", place: "desktop" } }),
      describeEvent({ type: "run.failed", data: { message: "the gateway refused the key" } }),
    ].join("\n");
    expect(shown).not.toMatch(/wsrn_/);
  });

  it("finds the runner program on PATH unless told otherwise", () => {
    expect(runnerBin({})).toBe("workser-runner");
    expect(runnerBin({ WORKSER_RUNNER_BIN: "/opt/workser-runner" })).toBe("/opt/workser-runner");
  });
});

describe("starting the runner with nothing installed by hand", () => {
  it("uses WORKSER_RUNNER_BIN, else a runner on PATH, else npm's stable runner through npx", () => {
    expect(runnerLaunch({ WORKSER_RUNNER_BIN: "/opt/r" }, () => true)).toMatchObject({ command: "/opt/r", args: [] });
    expect(runnerLaunch({}, () => true)).toMatchObject({ command: "workser-runner", args: [] });
    const npx = runnerLaunch({}, () => false);
    expect(npx.args).toEqual(["-y", "@workser/runner@stable"]);
    expect(npx.command).toMatch(/^npx(\.cmd)?$/);
  });
});

