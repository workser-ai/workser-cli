import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * LINE Official Account, connected once to this project and then usable from
 * anywhere — here, from the desktop, and from an Agent Cloud agent.
 *
 * ===========================================================================
 * WHY THIS IS NOT UNDER `workser connection`
 * ===========================================================================
 * That command is Composio: OAuth, a toolkit catalogue, a generic
 * `execute`. LINE reaches none of it — the Messaging API is not a Composio
 * toolkit, the credential is a channel access token pasted from LINE's own
 * console rather than an OAuth grant, and the operations are LINE's, not a
 * normalised action list. Filing it under `connection` would mean explaining
 * why half that command's subcommands do nothing here.
 *
 * ===========================================================================
 * `call` IS THE WHOLE API; THE REST ARE SHORTCUTS
 * ===========================================================================
 * `workser line ops` prints every operation the server knows, and
 * `workser line call <op> --params '{...}'` runs any of them. Everything
 * below that is a shortcut for the four an agent reaches for constantly —
 * added because `call push --params '{"to":"U1","messages":[{"type":"text","text":"hi"}]}'`
 * is a lot of JSON to hand-write for "send a message", not because the
 * generic door is insufficient.
 *
 * New LINE operations appear in `ops` and in `call` the moment the server
 * knows them, with no CLI release.
 */
export function registerLine(program: Command): void {
  const cmd = program
    .command("line")
    .description("Connect a LINE Official Account and use the LINE Messaging API");

  cmd
    .command("status")
    .description("Show this project's LINE connection")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/line`);
        ok(res, () => {
          const c = res?.connection;
          if (!c) return line(pc.dim("No LINE account connected. Run `workser line connect`."));
          const state = c.status === "connected" ? pc.green(c.status) : pc.yellow(c.status);
          line(`${pc.bold(c.display_name ?? "LINE")}  ${state}`);
          if (c.public_config?.basic_id) line(pc.dim(`  ${c.public_config.basic_id}`));
          if (c.last_error) line(pc.red(`  ${c.last_error}`));
        });
      }),
    );

  cmd
    .command("connect")
    .description("Connect a LINE Official Account with its channel access token")
    .requiredOption("--token <channelAccessToken>", "Messaging API → Channel access token")
    .option("--secret <channelSecret>", "Basic settings → Channel secret (for webhook signatures)")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/line/connect`, {
          body: { channel_access_token: opts.token, channel_secret: opts.secret },
        });
        ok(res, () =>
          line(`Connected ${pc.bold(res?.connection?.display_name ?? "LINE")}.`),
        );
      }),
    );

  cmd
    .command("verify")
    .description("Ask LINE whether the stored token still works")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/line/verify`, { body: {} });
        ok(res, () => {
          const c = res?.connection;
          line(
            c?.status === "connected"
              ? pc.green("The token still works.")
              : pc.red(c?.last_error ?? "LINE refused the stored token."),
          );
        });
      }),
    );

  cmd
    .command("disconnect")
    .description("Disconnect LINE from this project")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/line`, { method: "DELETE" });
        ok(res, () => line("Disconnected."));
      }),
    );

  cmd
    .command("ops")
    .description("List every LINE operation, optionally filtered by group")
    .option("--group <name>", "messaging, richmenu, audience, insight, people, group, quota, content, account, validation")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, `/v1/projects/${projectId}/line/operations`);
        const all = res?.operations ?? [];
        const items = opts.group
          ? all.filter((o: any) => o.group === opts.group)
          : all;
        ok(items, () => {
          if (!items.length) return line(pc.dim("No operations matched."));
          let group = "";
          for (const o of items) {
            if (o.group !== group) {
              group = o.group;
              line(pc.dim(`\n${group}`));
            }
            const mark = o.writes ? pc.yellow(" ●") : "  ";
            line(`${mark} ${pc.bold(o.id.padEnd(28))} ${o.summary}`);
          }
          line(pc.dim("\n● sends something, spends quota, or changes the account."));
        });
      }),
    );

  cmd
    .command("call <operation>")
    .description("Run any LINE operation — see `workser line ops`")
    .option("--params <json>", "the operation's parameters as a JSON string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await callLine(ctx, projectId, args[0], parseParams(opts.params));
        ok(res, () => line(JSON.stringify(res?.data ?? res, null, 2)));
      }),
    );

  // -------------------------------------------------------------------------
  // Shortcuts. Each is `call` with the JSON already written.
  // -------------------------------------------------------------------------

  cmd
    .command("send <to> <text>")
    .description("Send a text message to a user, group or room id")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await callLine(ctx, projectId, "push", {
          to: args[0],
          messages: [{ type: "text", text: args[1] }],
        });
        ok(res, () => report(res, "Sent."));
      }),
    );

  cmd
    .command("reply <replyToken> <text>")
    .description("Answer a message using its reply token (free, and single-use)")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await callLine(ctx, projectId, "reply", {
          replyToken: args[0],
          messages: [{ type: "text", text: args[1] }],
        });
        ok(res, () => report(res, "Replied."));
      }),
    );

  cmd
    .command("broadcast <text>")
    .description("Send a text message to EVERY follower — spends one message each")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await callLine(ctx, projectId, "broadcast", {
          messages: [{ type: "text", text: args[0] }],
        });
        ok(res, () => report(res, "Broadcast sent."));
      }),
    );

  cmd
    .command("quota")
    .description("How much of this month's message allowance is left")
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const [quota, used] = await Promise.all([
          callLine(ctx, projectId, "quota", {}),
          callLine(ctx, projectId, "quota_consumption", {}),
        ]);
        ok({ quota: quota?.data, consumption: used?.data }, () => {
          const limit = quota?.data?.value;
          const spent = used?.data?.totalUsage;
          if (limit === undefined) return line(JSON.stringify(quota?.data ?? quota, null, 2));
          line(`${spent ?? "?"} of ${limit} messages used this month.`);
        });
      }),
    );

  cmd
    .command("profile <userId>")
    .description("Look up one follower")
    .action(
      action(async ({ ctx, args }) => {
        const projectId = requireProject(ctx);
        const res = await callLine(ctx, projectId, "profile", { userId: args[0] });
        ok(res, () => line(JSON.stringify(res?.data ?? res, null, 2)));
      }),
    );
}

function parseParams(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // fall through — the message below is more useful than a JSON parse error
  }
  throw new Error(
    "--params must be a JSON object, e.g. --params '{\"to\":\"U123\",\"messages\":[{\"type\":\"text\",\"text\":\"hi\"}]}'",
  );
}

async function callLine(
  ctx: any,
  projectId: string,
  operation: string,
  params: Record<string, unknown>,
) {
  return api(ctx, `/v1/projects/${projectId}/line/call`, {
    body: { operation, params },
  });
}

/**
 * LINE's refusals come back as a 200 carrying `ok: false`, because the CALL
 * succeeded and LINE declined — the two are different failures and collapsing
 * them would report a rejected message as a broken connection.
 */
function report(res: any, success: string): void {
  if (res?.ok === false) {
    line(pc.red(res.message ?? "LINE refused that."));
    return;
  }
  line(success);
}
