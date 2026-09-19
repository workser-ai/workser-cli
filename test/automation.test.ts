import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DaemonStub } from "./daemon-stub.js";
import { runCli } from "./run-cli.js";

const stub = new DaemonStub();
let home: string;
let work: string;

function cli(args: string[]) {
  return runCli(["--json", ...args], {
    endpoint: stub.endpoint,
    token: "tok_automation_test",
    home,
    cwd: work,
  });
}

beforeAll(async () => {
  await stub.start();
  home = mkdtempSync(join(tmpdir(), "workser-automation-home-"));
  work = realpathSync(mkdtempSync(join(tmpdir(), "workser-automation-work-")));
});

afterAll(async () => {
  await stub.stop();
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

afterEach(() => stub.reset());

describe("automation trigger and run parity", () => {
  it("keeps connection discovery, authorization, and tool schemas on the existing API", async () => {
    stub.overrides.set("GET /v1/projects/p_1/integrations/apps", {
      body: [{ slug: "gmail", name: "Gmail" }],
    });
    stub.overrides.set("GET /v1/projects/p_1/integrations", {
      body: [{ id: "connection_1", toolkit: "gmail" }],
    });
    stub.overrides.set("POST /v1/projects/p_1/integrations/connect", {
      body: { connection_id: "connection_2", status: "pending", oauth_url: "https://oauth.example/connect/once" },
    });
    stub.overrides.set("GET /v1/projects/p_1/integrations/gmail/tools", {
      body: [{ slug: "GMAIL_FETCH_EMAILS", input_schema: { type: "object" } }],
    });

    const list = await cli(["connection", "list", "--project", "p_1"]);
    const connect = await cli(["connection", "connect", "gmail", "--project", "p_1"]);
    const tools = await cli(["connection", "tools", "gmail", "--project", "p_1"]);

    expect(list.code).toBe(0);
    expect(list.json.data).toMatchObject({
      catalog: [{ slug: "gmail" }],
      connections: [{ id: "connection_1" }],
    });
    expect(connect.code).toBe(0);
    expect(connect.json.data).toMatchObject({
      connection_id: "connection_2",
      oauth_url: "https://oauth.example/connect/once",
    });
    expect(tools.code).toBe(0);
    expect(tools.json.data[0]).toMatchObject({
      slug: "GMAIL_FETCH_EMAILS",
      input_schema: { type: "object" },
    });
  });

  it("lists automations within the selected project", async () => {
    stub.overrides.set("GET /v1/ai-automations", {
      body: [{ id: "auto_1", name: "Inbox triage", status: "active" }],
    });

    const result = await cli(["automation", "list", "--project", "p_1"]);

    expect(result.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "GET",
      path: "/v1/ai-automations",
      query: { project_id: "p_1" },
    });
    expect(result.json.data[0]).toMatchObject({ id: "auto_1" });
  });

  it("creates a typed trigger without allowing --body to replace its owner", async () => {
    stub.overrides.set("POST /v1/ai-automations/triggers", {
      body: { id: "trigger_1", trigger_type: "schedule", status: "active" },
    });

    const result = await cli([
      "automation",
      "trigger",
      "create",
      "auto_1",
      "--type",
      "schedule",
      "--body",
      JSON.stringify({
        ai_automation_id: "other_auto",
        trigger_type: "app_event",
        name: "Morning",
        schedule_config: { cron_expression: "0 9 * * *", timezone: "Asia/Bangkok" },
      }),
    ]);

    expect(result.code).toBe(0);
    expect(stub.lastRequest).toMatchObject({
      method: "POST",
      path: "/v1/ai-automations/triggers",
      body: {
        ai_automation_id: "auto_1",
        trigger_type: "schedule",
        name: "Morning",
        schedule_config: { cron_expression: "0 9 * * *", timezone: "Asia/Bangkok" },
      },
    });
  });

  it("rejects an invented trigger type before any request", async () => {
    const result = await cli([
      "automation",
      "trigger",
      "create",
      "auto_1",
      "--type",
      "made_up",
    ]);

    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe("bad_input");
    expect(stub.requests).toHaveLength(0);
  });

  it("reads trigger configuration and its deliveries", async () => {
    stub.overrides.set("GET /v1/ai-automations/triggers/trigger_1", {
      body: { id: "trigger_1", trigger_type: "app_event", app_event_config: { event_type: "NEW_MESSAGE" } },
    });
    stub.overrides.set("GET /v1/ai-automations/triggers/trigger_1/events", {
      body: [{ id: "event_1", trigger_id: "trigger_1", status: "matched" }],
    });

    const trigger = await cli(["automation", "trigger", "get", "trigger_1"]);
    const events = await cli(["automation", "trigger", "events", "trigger_1"]);

    expect(trigger.code).toBe(0);
    expect(trigger.json.data.app_event_config.event_type).toBe("NEW_MESSAGE");
    expect(events.code).toBe(0);
    expect(events.json.data[0]).toMatchObject({ id: "event_1", status: "matched" });
  });

  it("follows an automation task to its Workser Computer run", async () => {
    stub.overrides.set("GET /v1/ai-automations/tasks/task_1", {
      body: {
        id: "task_1",
        ai_agent_task_id: "run_1",
        status: "in_progress",
        metadata: {
          target: "agent_cloud",
          start_run: { protocol: "workser-computer/v1", project_id: "p_1" },
        },
      },
    });
    stub.overrides.set("GET /v1/agent-cloud/runs/run_1", {
      body: { id: "run_1", status: "running", project_id: "p_1" },
    });

    const result = await cli(["automation", "run", "task_1"]);

    expect(result.code).toBe(0);
    expect(stub.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "GET /v1/ai-automations/tasks/task_1",
      "GET /v1/agent-cloud/runs/run_1",
    ]);
    expect(result.json.data).toMatchObject({
      automation_task: { id: "task_1", ai_agent_task_id: "run_1" },
      workser_computer_run: { id: "run_1", status: "running" },
    });
  });
});
