import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject } from "../context.js";
import { ok, line } from "../output.js";

/**
 * The chat services a project connects to — LINE, Telegram, Discord, Slack.
 *
 * ===========================================================================
 * FOUR TOP-LEVEL COMMANDS, ONE BUILDER
 * ===========================================================================
 * `workser line send …`, `workser telegram send …` — named the way a person
 * says it, not `workser channel <provider> send`, which puts an abstraction
 * nobody asked for between the user and the thing they mean. Every one of them
 * is this file with a different id, so the four cannot drift.
 *
 * ===========================================================================
 * WHY THIS IS NOT UNDER `workser connection`
 * ===========================================================================
 * That command is Composio: OAuth, a toolkit catalogue, a generic `execute`.
 * None of these reach it — the Messaging APIs are not Composio toolkits, the
 * credential is a token pasted from the vendor's own console rather than an
 * OAuth grant, and the operations are the vendor's, not a normalised action
 * list. Filing them there would mean explaining why half that command's
 * subcommands do nothing.
 *
 * ===========================================================================
 * `call` IS THE WHOLE API; THE REST ARE SHORTCUTS
 * ===========================================================================
 * `ops` prints every operation the server knows and `call <op> --params` runs
 * any of them. The shortcuts below exist because
 * `call push --params '{"to":"U1","messages":[{"type":"text","text":"hi"}]}'`
 * is a lot of JSON to hand-write for "send a message" — not because the
 * generic door is insufficient.
 *
 * A new operation appears in `ops` and in `call` the moment the server knows
 * it, with no CLI release.
 */

interface ProviderShape {
  /** The command name, and the provider id. */
  id: "line" | "telegram" | "discord" | "slack";
  label: string;
  description: string;
  /** `--token` maps to this credential field. */
  tokenField: string;
  tokenHelp: string;
  /** An optional second credential, when the provider has one. */
  extra?: { flag: string; field: string; help: string };
  /** The operation each shortcut maps to, when the provider has it. */
  send?: { operation: string; build: (to: string, text: string) => any };
  reply?: { operation: string; build: (token: string, text: string) => any };
}

const SHAPES: ProviderShape[] = [
  {
    id: "line",
    label: "LINE",
    description: "Connect a LINE Official Account and use the LINE Messaging API",
    tokenField: "channel_access_token",
    tokenHelp: "Messaging API tab → Channel access token",
    extra: {
      flag: "--secret <channelSecret>",
      field: "channel_secret",
      help: "Basic settings → Channel secret (for webhook signatures)",
    },
    send: {
      operation: "push",
      build: (to, text) => ({ to, messages: [{ type: "text", text }] }),
    },
    reply: {
      operation: "reply",
      build: (replyToken, text) => ({
        replyToken,
        messages: [{ type: "text", text }],
      }),
    },
  },
  {
    id: "telegram",
    label: "Telegram",
    description: "Connect a Telegram bot and message chats, groups and channels",
    tokenField: "bot_token",
    tokenHelp: "The token @BotFather gave you",
    send: {
      operation: "send_message",
      build: (chat_id, text) => ({ chat_id, text }),
    },
  },
  {
    id: "discord",
    label: "Discord",
    description: "Connect a Discord bot and post in servers and DMs",
    tokenField: "bot_token",
    tokenHelp: "Developer Portal → your application → Bot → Reset Token",
    send: {
      operation: "send_message",
      build: (channel_id, content) => ({ channel_id, content }),
    },
  },
  {
    id: "slack",
    label: "Slack",
    description: "Connect a Slack app and post in channels and DMs",
    tokenField: "bot_token",
    tokenHelp: "OAuth & Permissions → Bot User OAuth Token (starts xoxb-)",
    extra: {
      flag: "--signing-secret <secret>",
      field: "signing_secret",
      help: "Basic Information → Signing Secret (for event signatures)",
    },
    send: {
      operation: "send_message",
      build: (channel, text) => ({ channel, text }),
    },
  },
];

export function registerChannels(program: Command): void {
  for (const shape of SHAPES) register(program, shape);
}

function register(program: Command, shape: ProviderShape): void {
  const cmd = program.command(shape.id).description(shape.description);
  const path = (suffix = "") => (projectId: string) =>
    `/v1/projects/${projectId}/channels/${shape.id}${suffix}`;

  cmd
    .command("status")
    .description(`Show this project's ${shape.label} connection`)
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, path()(projectId));
        ok(res, () => {
          const c = res?.connection;
          if (!c) {
            return line(
              pc.dim(
                `No ${shape.label} account connected. Run \`workser ${shape.id} connect\`.`,
              ),
            );
          }
          const state =
            c.status === "connected" ? pc.green(c.status) : pc.yellow(c.status);
          line(`${pc.bold(c.display_name ?? shape.label)}  ${state}`);
          for (const [k, v] of Object.entries(c.public_config ?? {})) {
            if (v) line(pc.dim(`  ${k}: ${v}`));
          }
          if (c.last_error) line(pc.red(`  ${c.last_error}`));
        });
      }),
    );

  const connect = cmd
    .command("connect")
    .description(`Connect a ${shape.label} account to this project`)
    .requiredOption("--token <token>", shape.tokenHelp);
  if (shape.extra) connect.option(shape.extra.flag, shape.extra.help);
  connect.action(
    action(async ({ ctx, opts }) => {
      const projectId = requireProject(ctx);
      const body: Record<string, string> = {};
      body[shape.tokenField] = String(opts.token);
      if (shape.extra) {
        // commander camel-cases a long flag: `--signing-secret` → signingSecret.
        const key = shape.extra.flag
          .split(" ")[0]
          .replace(/^--/, "")
          .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (opts[key]) body[shape.extra.field] = opts[key];
      }
      const res = await api(ctx, path("/connect")(projectId), { body });
      ok(res, () =>
        line(
          `Connected ${pc.bold(res?.connection?.display_name ?? shape.label)}.`,
        ),
      );
    }),
  );

  cmd
    .command("verify")
    .description(`Ask ${shape.label} whether the stored credential still works`)
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, path("/verify")(projectId), { body: {} });
        ok(res, () => {
          const c = res?.connection;
          line(
            c?.status === "connected"
              ? pc.green("The credential still works.")
              : pc.red(c?.last_error ?? `${shape.label} refused it.`),
          );
        });
      }),
    );

  cmd
    .command("disconnect")
    .description(`Disconnect ${shape.label} from this project`)
    .action(
      action(async ({ ctx }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, path()(projectId), { method: "DELETE" });
        ok(res, () => line("Disconnected."));
      }),
    );

  cmd
    .command("ops")
    .description(`List every ${shape.label} operation`)
    .option("--group <name>", "filter to one group")
    .action(
      action(async ({ ctx, opts }) => {
        const projectId = requireProject(ctx);
        const res = await api(ctx, path("/operations")(projectId));
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
          line(
            pc.dim(
              "\n● sends something, spends quota, or changes the account.",
            ),
          );
          // What this provider deliberately does not carry. Printed here
          // because `ops` is where somebody looks for an operation, and "it is
          // not in the list" is a worse answer than "it is not here, and why".
          for (const note of res?.excludes ?? []) {
            line(pc.dim(`  not included — ${note}`));
          }
        });
      }),
    );

  cmd
    .command("call <operation>")
    .description(`Run any ${shape.label} operation — see \`workser ${shape.id} ops\``)
    .option("--params <json>", "the operation's parameters as a JSON string", "{}")
    .action(
      action(async ({ ctx, args, opts }) => {
        const projectId = requireProject(ctx);
        const res = await call(ctx, projectId, shape, args[0], parseParams(opts.params));
        ok(res, () => line(JSON.stringify(res?.data ?? res, null, 2)));
      }),
    );

  if (shape.send) {
    const send = shape.send;
    cmd
      .command("send <to> <text>")
      .description(
        shape.id === "discord"
          ? "Post a text message in a Discord channel id"
          : shape.id === "slack"
            ? "Post a text message in a Slack channel or DM id"
            : "Send a text message to a chat, user, group or room id",
      )
      .action(
        action(async ({ ctx, args }) => {
          const projectId = requireProject(ctx);
          const res = await call(
            ctx,
            projectId,
            shape,
            send.operation,
            send.build(args[0], args[1]),
          );
          ok(res, () => report(res, "Sent."));
        }),
      );
  }

  if (shape.reply) {
    const reply = shape.reply;
    cmd
      .command("reply <token> <text>")
      .description("Answer a message using its reply token — free, and single-use")
      .action(
        action(async ({ ctx, args }) => {
          const projectId = requireProject(ctx);
          const res = await call(
            ctx,
            projectId,
            shape,
            reply.operation,
            reply.build(args[0], args[1]),
          );
          ok(res, () => report(res, "Replied."));
        }),
      );
  }

  // LINE alone gets these: it is the only provider whose API has a monthly
  // message quota and a follower-profile endpoint worth a shortcut.
  if (shape.id === "line") {
    cmd
      .command("broadcast <text>")
      .description("Send a text message to EVERY follower — spends one message each")
      .action(
        action(async ({ ctx, args }) => {
          const projectId = requireProject(ctx);
          const res = await call(ctx, projectId, shape, "broadcast", {
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
            call(ctx, projectId, shape, "quota", {}),
            call(ctx, projectId, shape, "quota_consumption", {}),
          ]);
          ok({ quota: quota?.data, consumption: used?.data }, () => {
            const limit = quota?.data?.value;
            const spent = used?.data?.totalUsage;
            if (limit === undefined) {
              return line(JSON.stringify(quota?.data ?? quota, null, 2));
            }
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
          const res = await call(ctx, projectId, shape, "profile", {
            userId: args[0],
          });
          ok(res, () => line(JSON.stringify(res?.data ?? res, null, 2)));
        }),
      );
  }
}

function parseParams(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // fall through — the message below is more useful than a parse error
  }
  throw new Error(
    "--params must be a JSON object, e.g. --params '{\"chat_id\":123,\"text\":\"hi\"}'",
  );
}

async function call(
  ctx: any,
  projectId: string,
  shape: ProviderShape,
  operation: string,
  params: Record<string, unknown>,
) {
  return api(ctx, `/v1/projects/${projectId}/channels/${shape.id}/call`, {
    body: { operation, params },
  });
}

/**
 * A refusal comes back as a 200 carrying `ok: false`, because the CALL
 * succeeded and the provider declined — two different failures, and collapsing
 * them would report a rejected message as a broken connection.
 */
function report(res: any, success: string): void {
  if (res?.ok === false) {
    line(pc.red(res.message ?? "That was refused."));
    return;
  }
  line(success);
}
