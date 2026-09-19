import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { WorkserError } from "../errors.js";
import { line, ok } from "../output.js";

const TRIGGER_TYPES = new Set(["schedule", "app_event", "chat_webhook"]);

function parseObject(value: string | undefined, flag: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("not an object");
    }
    return parsed;
  } catch {
    throw new WorkserError(`${flag} must be a JSON object.`, { code: "bad_input" });
  }
}

function printTrigger(trigger: any): void {
  line(
    `${trigger.id}  ${pc.bold(trigger.name ?? trigger.trigger_type ?? "Trigger")}` +
      `  ${pc.dim(trigger.status ?? "")}`,
  );
}

function printRun(task: any): void {
  const runId = task.ai_agent_task_id ?? "";
  const target = task.metadata?.target ?? "";
  line(`${task.id}  ${task.status ?? ""}  ${pc.dim(target)}  ${pc.dim(runId)}`);
}

/**
 * Trigger configuration and run inspection for the AI Automation service.
 *
 * This deliberately reuses the existing Core API. Connections keep their
 * existing `connection` command, workflow graphs keep `workflow`, and this
 * group only fills the trigger-to-run visibility gap needed by an agent.
 */
export function registerAutomation(program: Command): void {
  const automation = program
    .command("automation")
    .description("Configure AI automation triggers and inspect the runs they start");

  automation
    .command("list")
    .description("List this project's AI automations")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const items = await api(ctx, "/v1/ai-automations", {
          query: { project_id: projectId },
        });
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No AI automations yet."));
          for (const item of items) {
            line(
              `${item.id}  ${pc.bold(item.name ?? "Untitled")}` +
                `  ${pc.dim(item.status ?? "")}`,
            );
          }
        });
      }),
    );

  automation
    .command("get <automationId>")
    .description("Show one AI automation")
    .action(
      action(async ({ ctx, args }) => {
        const item = await api(
          ctx,
          `/v1/ai-automations/${encodeURIComponent(args[0])}`,
        );
        ok(item, () => line(JSON.stringify(item, null, 2)));
      }),
    );

  const trigger = automation
    .command("trigger")
    .description("Create and inspect automation trigger configuration");

  trigger
    .command("create <automationId>")
    .description("Create a schedule, app-event, or chat-webhook trigger")
    .requiredOption(
      "--type <type>",
      "schedule, app_event, or chat_webhook",
    )
    .option("--body <payload>", "trigger fields and configuration as a JSON object", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        if (!TRIGGER_TYPES.has(opts.type)) {
          throw new WorkserError(
            `Unknown trigger type "${opts.type}". Use schedule, app_event, or chat_webhook.`,
            { code: "bad_input" },
          );
        }
        const fields = parseObject(opts.body, "--body");
        const created = await api(ctx, "/v1/ai-automations/triggers", {
          body: {
            ...fields,
            ai_automation_id: args[0],
            trigger_type: opts.type,
          },
        });
        ok(created, () => {
          line(`Created trigger ${pc.bold(created.id)}.`);
          printTrigger(created);
        });
      }),
    );

  trigger
    .command("list <automationId>")
    .description("List an automation's trigger configuration")
    .action(
      action(async ({ ctx, args }) => {
        const items = await api(
          ctx,
          `/v1/ai-automations/${encodeURIComponent(args[0])}/triggers`,
        );
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No triggers configured."));
          for (const item of items) printTrigger(item);
        });
      }),
    );

  trigger
    .command("get <triggerId>")
    .description("Show one trigger configuration")
    .action(
      action(async ({ ctx, args }) => {
        const item = await api(
          ctx,
          `/v1/ai-automations/triggers/${encodeURIComponent(args[0])}`,
        );
        ok(item, () => line(JSON.stringify(item, null, 2)));
      }),
    );

  trigger
    .command("events <triggerId>")
    .description("List deliveries received by a trigger")
    .action(
      action(async ({ ctx, args }) => {
        const items = await api(
          ctx,
          `/v1/ai-automations/triggers/${encodeURIComponent(args[0])}/events`,
        );
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No trigger events yet."));
          for (const item of items) {
            line(`${item.id}  ${item.status ?? ""}  ${pc.dim(item.created_at ?? "")}`);
          }
        });
      }),
    );

  automation
    .command("runs <automationId>")
    .description("List the runs started by an automation")
    .action(
      action(async ({ ctx, args }) => {
        const items = await api(
          ctx,
          `/v1/ai-automations/${encodeURIComponent(args[0])}/tasks`,
        );
        ok(items, () => {
          if (!items?.length) return line(pc.dim("No automation runs yet."));
          for (const item of items) printRun(item);
        });
      }),
    );

  automation
    .command("run <automationTaskId>")
    .description("Inspect an automation task and its resulting Workser Computer run")
    .action(
      action(async ({ ctx, args }) => {
        const automationTask = await api(
          ctx,
          `/v1/ai-automations/tasks/${encodeURIComponent(args[0])}`,
        );
        const runId = automationTask?.ai_agent_task_id;
        const target = automationTask?.metadata?.target;
        const workserComputerRun =
          runId && target === "agent_cloud"
            ? await api(
                ctx,
                `/v1/agent-cloud/runs/${encodeURIComponent(runId)}`,
              )
            : undefined;

        const result = {
          automation_task: automationTask,
          ...(workserComputerRun
            ? { workser_computer_run: workserComputerRun }
            : {}),
        };
        ok(result, () => {
          printRun(automationTask);
          if (workserComputerRun) {
            line(
              `Workser Computer run ${pc.bold(workserComputerRun.id ?? runId)}` +
                `  ${workserComputerRun.status ?? ""}`,
            );
          }
        });
      }),
    );
}
