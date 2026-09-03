import type { Command } from "commander";
import pc from "picocolors";
import { action } from "../run.js";
import { api } from "../client.js";
import { ok, line, warn } from "../output.js";

/**
 * `workser agent-cloud` — agents that run on Workser's infrastructure and can
 * be called from the apps in this project.
 *
 * ===========================================================================
 * THREE THINGS ARE NAMED "AGENT". THIS IS THE THIRD.
 * ===========================================================================
 * `workser agent` delegates a subtask to a coding agent on THIS machine —
 * Claude Code, Codex, Kimi, opencode. A teammate helping you build.
 *
 * **Cloud Agent** is reserved for that same coding agent running in the cloud
 * instead of on the laptop. Also a thing that helps you BUILD.
 *
 * `workser agent-cloud` — THIS — is the hosted service that runs the agents a
 * customer SHIPS inside their own application: an order desk, a support
 * replier, an invoice reconciler. It keeps its own memory, tools and machine,
 * and is reached from the deployed web, mobile, API or Python app. It is a
 * thing the project SELLS, not a thing that helps build the project.
 *
 * The command is `agent-cloud` and never `cloud-agent`, deliberately. That
 * phrase belongs to the second one, and a CLI that borrowed it would make the
 * collision permanent on the day that ships. The same care is why the daemon
 * mounts this at `/v1/agent-cloud` rather than next to its own `/v1/agents`,
 * which means "which local CLI backs which role".
 *
 *   GET    /v1/agent-cloud                     list
 *   POST   /v1/agent-cloud                     create
 *   GET    /v1/agent-cloud/:id                 show
 *   POST   /v1/agent-cloud/:id/runs            run
 *   GET    /v1/agent-cloud/:id/runs            recent runs
 *   GET    /v1/agent-cloud/runs/:runId         one run, with what it cost
 *
 * ...and the whole SET-UP surface, which is what makes an agent good at a job
 * rather than merely existing:
 *
 *   GET/POST/DELETE /v1/agent-cloud/:id/<what>[/:itemId]
 *      where <what> is skills | tools | mcp-servers | resources | secrets
 *                     | subagents | workflows
 *   PATCH  /v1/agent-cloud/:id                 brief, model, capabilities
 *   POST   /v1/agent-cloud/:id/publish         put the setup live
 *   POST   /v1/agent-cloud/:id/test-runs       try it without publishing
 *   GET    /v1/agent-cloud/catalog/models/live | /capabilities | /machines
 *
 * WHY THE AGENT NEEDS ALL OF IT, not just create-and-run. A coding agent asked
 * to "build me an order desk" cannot stop at an empty agent with a sentence of
 * instructions — the job is to teach it the business's own rules, give it the
 * actions it needs, and put it live. Without these commands the only surface
 * that could do that was the desktop UI, so an agent working in a terminal
 * could create something it had no way to finish.
 *
 * Every call is scoped to the project pinned to the working directory, by the
 * daemon rather than by anything passed here — so an agent running in one
 * project's folder cannot reach another project's agents even if it tries.
 */
export function registerAgentCloud(program: Command): void {
  const cloud = program
    .command("agent-cloud")
    .description(
      "Agents that run in the cloud and can be called from this project's apps (not the local coding agents — that's `workser agent`)",
    );

  cloud
    .command("list")
    .description("List this project's cloud agents")
    .action(
      action(async ({ ctx }) => {
        const res = await api(ctx, "/v1/agent-cloud");
        const agents = res?.agents ?? res ?? [];
        ok(res, () => {
          if (!agents.length) {
            line(pc.dim("No cloud agents yet."));
            line(
              pc.dim("Create one: ") +
                pc.bold('workser agent-cloud create "Order desk" --instructions "..."'),
            );
            return;
          }
          for (const a of agents) {
            line(
              `${pc.bold(a.name ?? a.id)}  ${pc.dim(a.id)}` +
                (a.status ? `  ${pc.dim(a.status)}` : ""),
            );
            if (a.description) line("  " + pc.dim(a.description));
          }
        });
      }),
    );

  cloud
    .command("create <name>")
    .description("Create a cloud agent in this project")
    .option("--description <text>", "What it is for, in the owner's words")
    .option(
      "--instructions <text>",
      "The agent's standing instructions — what it should always do",
    )
    .action(
      action(async ({ ctx, args, opts }) => {
        const res = await api(ctx, "/v1/agent-cloud", {
          method: "POST",
          body: {
            name: args[0],
            description: opts.description,
            instructions: opts.instructions,
          },
        });
        ok(res, () => {
          line(pc.green("Created ") + pc.bold(res?.name ?? args[0]));
          if (res?.id) line(pc.dim(res.id));
          line("");
          line(
            pc.dim("Give it work: ") +
              pc.bold(`workser agent-cloud run ${res?.id ?? "<id>"} "..."`),
          );
        });
      }),
    );

  cloud
    .command("show <agentId>")
    .description("One cloud agent, with its configuration")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(ctx, `/v1/agent-cloud/${encodeURIComponent(args[0])}`);
        ok(res, () => {
          line(pc.bold(res?.name ?? args[0]));
          if (res?.description) line(pc.dim(res.description));
          if (res?.instructions) {
            line("");
            line(pc.bold("instructions:"));
            line(res.instructions);
          }
        });
      }),
    );

  cloud
    .command("run <agentId> <message>")
    .description("Give a cloud agent something to do")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(
          ctx,
          `/v1/agent-cloud/${encodeURIComponent(args[0])}/runs`,
          { method: "POST", body: { input: { message: args[1] } } },
        );
        ok(res, () => {
          line(pc.green("Started run ") + pc.bold(res?.id ?? ""));
          // Runs are asynchronous by design — the agent may work for minutes.
          // Telling the caller how to follow it is the difference between an
          // async API and one that looks broken.
          line(
            pc.dim("Follow it: ") +
              pc.bold(`workser agent-cloud runs ${res?.id ?? "<runId>"}`),
          );
        });
      }),
    );

  cloud
    .command("runs [agentIdOrRunId]")
    .description("Recent runs for an agent, or one run in detail")
    .option("--limit <n>", "How many to list", "10")
    .action(
      action(async ({ ctx, args, opts }) => {
        const id = args[0];
        if (!id) {
          warn("Give an agent id to list its runs, or a run id to inspect one.");
          return;
        }
        // A run id and an agent id are both opaque, so which endpoint to call
        // cannot be decided from the string. Ask for the run first — the
        // narrower answer — and fall back to listing the agent's runs. The
        // alternative, a `--run` flag, makes the common case wordier to spare
        // one request in the uncommon one.
        try {
          const run = await api(
            ctx,
            `/v1/agent-cloud/runs/${encodeURIComponent(id)}`,
          );
          ok(run, () => printRun(run));
          return;
        } catch {
          // Not a run id. Treat it as an agent id.
        }
        const res = await api(
          ctx,
          `/v1/agent-cloud/${encodeURIComponent(id)}/runs`,
          { query: { limit: opts.limit } },
        );
        const runs = res?.runs ?? res ?? [];
        ok(res, () => {
          if (!runs.length) {
            line(pc.dim("No runs yet."));
            return;
          }
          for (const r of runs) printRun(r, true);
        });
      }),
    );
  // =========================================================================
  // SET-UP — one uniform family over the seven collections.
  // =========================================================================

  /**
   * The collections an agent can be given, and what each is called on the wire.
   *
   * A TABLE rather than seven hand-written command blocks: they are the same
   * shape upstream, and seven copies would be seven chances for one of them to
   * forget `--json`, or to print an id the next command cannot take back.
   */
  const COLLECTIONS: Record<
    string,
    { path: string; key: string; label: string; fields: string[]; required: string[] }
  > = {
    skill: {
      path: "skills",
      key: "skills",
      label: "skill",
      fields: ["name", "description", "instructions_md"],
      required: ["name"],
    },
    tool: {
      path: "tools",
      key: "tools",
      label: "action",
      fields: ["display_name", "provider", "provider_tool_id", "description"],
      required: ["display_name"],
    },
    mcp: {
      path: "mcp-servers",
      key: "servers",
      label: "MCP server",
      fields: ["name", "url"],
      required: ["name", "url"],
    },
    knowledge: {
      path: "resources",
      key: "resources",
      label: "reference material",
      fields: ["name", "content_text"],
      required: ["name"],
    },
    secret: {
      path: "secrets",
      key: "secrets",
      label: "stored key",
      fields: ["key", "value", "description"],
      required: ["key", "value"],
    },
    subagent: {
      path: "subagents",
      key: "subagents",
      label: "team member",
      fields: ["subagent_id", "name", "description"],
      required: ["subagent_id", "name"],
    },
    workflow: {
      path: "workflows",
      key: "workflows",
      label: "workflow",
      fields: ["workflow_id", "description"],
      required: ["workflow_id"],
    },
  };

  const kinds = Object.keys(COLLECTIONS).join(" | ");

  cloud
    .command("get <agentId> <kind>")
    .description(`What an agent has been given (${kinds})`)
    .action(
      action(async ({ ctx, args }) => {
        const spec = COLLECTIONS[args[1]];
        if (!spec) throw new Error(`Unknown kind "${args[1]}". One of: ${kinds}`);
        const res = await api(ctx, `/v1/agent-cloud/${encodeURIComponent(args[0])}/${spec.path}`);
        const items = res?.[spec.key] ?? [];
        ok(res, () => {
          if (!items.length) {
            line(pc.dim(`No ${spec.label} yet.`));
            return;
          }
          for (const i of items) {
            const title = i.name ?? i.display_name ?? i.key ?? i.workflow_id ?? i.id;
            line(`${pc.bold(title)}  ${pc.dim(i.id)}`);
            if (i.description) line("  " + pc.dim(i.description));
            if (i.is_enabled === false) line("  " + pc.yellow("turned off"));
          }
        });
      }),
    );

  cloud
    .command("add <agentId> <kind> [pairs...]")
    .description(
      `Give an agent something (${kinds}). Pairs are key=value, e.g. name="Refunds"`,
    )
    .action(
      action(async ({ ctx, args }) => {
        const spec = COLLECTIONS[args[1]];
        if (!spec) throw new Error(`Unknown kind "${args[1]}". One of: ${kinds}`);
        const body = parsePairs((args[2] as unknown as string[]) ?? [], spec.fields);
        const missing = spec.required.filter((f) => !body[f]);
        if (missing.length) {
          throw new Error(
            `A ${spec.label} needs ${missing.join(" and ")}. ` +
              `Accepted: ${spec.fields.join(", ")}`,
          );
        }
        const res = await api(ctx, `/v1/agent-cloud/${encodeURIComponent(args[0])}/${spec.path}`, {
          method: "POST",
          body,
        });
        ok(res, () => {
          line(pc.green(`Added the ${spec.label}.`) + "  " + pc.dim(res?.id ?? ""));
          line(
            pc.dim("Not live yet — run ") +
              pc.bold(`workser agent-cloud publish ${args[0]}`) +
              pc.dim(" when the setup is ready."),
          );
        });
      }),
    );

  cloud
    .command("remove <agentId> <kind> <itemId>")
    .description(`Take something away from an agent (${kinds})`)
    .action(
      action(async ({ ctx, args }) => {
        const spec = COLLECTIONS[args[1]];
        if (!spec) throw new Error(`Unknown kind "${args[1]}". One of: ${kinds}`);
        const res = await api(
          ctx,
          `/v1/agent-cloud/${encodeURIComponent(args[0])}/${spec.path}/${encodeURIComponent(args[2])}`,
          { method: "DELETE" },
        );
        ok(res, () => line(pc.green(`Removed the ${spec.label}.`)));
      }),
    );

  cloud
    .command("set <agentId> [pairs...]")
    .description(
      "Change the brief or the model. Pairs: name, description, system_prompt, handle, default_provider, default_model",
    )
    .action(
      action(async ({ ctx, args }) => {
        const body = parsePairs((args[1] as unknown as string[]) ?? [], [
          "name",
          "description",
          "system_prompt",
          "handle",
          "default_provider",
          "default_model",
        ]);
        if (!Object.keys(body).length) {
          throw new Error(
            'Nothing to change. Example: workser agent-cloud set <id> system_prompt="Always check stock first"',
          );
        }
        const res = await api(ctx, `/v1/agent-cloud/${encodeURIComponent(args[0])}`, {
          method: "PATCH",
          body,
        });
        ok(res, () => {
          line(pc.green("Saved."));
          line(
            pc.dim("Not live yet — run ") +
              pc.bold(`workser agent-cloud publish ${args[0]}`) +
              pc.dim("."),
          );
        });
      }),
    );

  /**
   * Put the setup live.
   *
   * The single most important command in this file, and the easiest to leave
   * out. The runtime resolves the PUBLISHED version of an agent and never the
   * draft, so every `set` and `add` above is inert until this runs — an agent
   * that skips it has done a lot of careful work that changes nothing.
   */
  cloud
    .command("publish <agentId>")
    .description("Put the current setup live — nothing takes effect until this runs")
    .option("--note <text>", "What changed, for the version history")
    .action(
      action(async ({ ctx, args, opts }) => {
        const res = await api(ctx, `/v1/agent-cloud/${encodeURIComponent(args[0])}/publish`, {
          method: "POST",
          body: { changelog: opts.note },
        });
        ok(res, () =>
          line(pc.green(`Live${res?.version ? ` — version ${res.version}` : ""}.`)),
        );
      }),
    );

  cloud
    .command("try <agentId> <message>")
    .description("Run the current setup WITHOUT publishing it")
    .action(
      action(async ({ ctx, args }) => {
        const res = await api(ctx, `/v1/agent-cloud/${encodeURIComponent(args[0])}/test-runs`, {
          method: "POST",
          body: { input: { message: args[1] } },
        });
        ok(res, () => {
          line(pc.green("Trying it — nothing has gone live."));
          if (res?.run_id) {
            line(
              pc.dim("Watch it: ") +
                pc.bold(`workser agent-cloud runs ${res.run_id}`),
            );
          }
        });
      }),
    );

  cloud
    .command("machines")
    .description("The pre-built machines an agent can run on")
    .action(
      action(async ({ ctx }) => {
        const res = await api(ctx, "/v1/agent-cloud/catalog/machines");
        ok(res, () => {
          for (const m of res?.machines ?? []) {
            line(`${pc.bold(m.label)}  ${pc.dim(m.alias)}`);
            line("  " + pc.dim(m.description));
          }
        });
      }),
    );

  cloud
    .command("models")
    .description("Models this organisation can run an agent on, cheapest first")
    .option("--all", "Include models that need your own provider key")
    // WHAT THE MODEL MAKES. Without this the list is chat models and nothing
    // else — not by choice, but because the catalogue used to throw away every
    // image, video, speech and transcription row before anyone could ask for
    // one. An agent that needs to draw a picture needs to be told which models
    // can, and this is the local agent's only way to find out.
    .option(
      "--kind <kind>",
      "text | image | video | speech | transcription | embedding (comma-separated)",
    )
    .option("--accepts <inputs>", "Only models that can read this: image, audio, video, file")
    .action(
      action(async ({ ctx, opts }) => {
        const q = new URLSearchParams();
        if (opts.kind) q.set("kind", String(opts.kind));
        if (opts.accepts) q.set("accepts", String(opts.accepts));
        // `tools_only=false` whenever a non-text kind is asked for: image and
        // speech models do not call tools and never will, so the server's
        // sensible default for a CHAT picker would answer "there are none".
        if (opts.kind && !String(opts.kind).split(",").includes("text")) {
          q.set("tools_only", "false");
        }
        const suffix = q.toString() ? `?${q.toString()}` : "";
        const res = await api(
          ctx,
          `/v1/agent-cloud/catalog/models/gateways${suffix}`,
        );
        const models = (res?.models ?? []).filter(
          (m: any) => opts.all || m.credit_tier === "PLATFORM_CREDITS",
        );
        ok(res, () => {
          if (!models.length) {
            warn(
              opts.kind
                ? `No ${opts.kind} models are available on your credits. Try --all.`
                : "The live model list could not be read.",
            );
            return;
          }
          for (const m of models.slice(0, 40)) {
            // A per-generation model priced "per million" is out by six orders
            // of magnitude — see `PriceInfo.unit` in core-api.
            const price =
              m.price_unit === "each"
                ? typeof m.credits_each === "number"
                  ? `${m.credits_each} credits each`
                  : "price unknown"
                : typeof m.input_price_per_million_usd === "number"
                  ? `$${m.input_price_per_million_usd.toFixed(2)}/M in`
                  : "price unknown";
            const byok =
              m.credit_tier === "PLATFORM_CREDITS" ? "" : pc.yellow("  needs your own key");
            const kind = m.kind && m.kind !== "text" ? pc.dim(`  [${m.kind}]`) : "";
            line(`${pc.bold(m.model ?? m.id)}${kind}  ${pc.dim(price)}${byok}`);
          }
        });
      }),
    );
}

/**
 * One run, with its cost.
 *
 * Cost is printed on purpose and not behind a flag. Agent Cloud is metered per
 * minute, and the fastest way to lose a customer's trust in a meter is to make
 * them go somewhere else to find out what a thing cost.
 */
function printRun(run: any, compact = false): void {
  const status = String(run?.status ?? "").toLowerCase();
  const colour =
    status === "completed" ? pc.green : status === "failed" ? pc.red : pc.yellow;
  line(
    `${colour(status || "unknown")}  ${pc.bold(run?.id ?? "")}` +
      (run?.duration_ms ? `  ${pc.dim(formatDuration(run.duration_ms))}` : ""),
  );
  // The COMPLETE cost when the detail read supplied one. `cost_usd` alone is
  // the model spend; the minutes the run held are metered separately, so
  // printing only that answers "what did this cost" with a number that is
  // always too low. See `RunDetailResponseDto.cost_breakdown`.
  const breakdown = run?.cost_breakdown;
  if (breakdown) {
    if (!breakdown.settled) {
      line("  " + pc.dim("cost: still being worked out"));
    } else {
      line("  " + pc.dim(`cost: $${Number(breakdown.total_usd).toFixed(4)}`));
      line(
        "    " +
          pc.dim(
            `model $${Number(breakdown.model_usd).toFixed(4)} · ` +
              `infrastructure $${Number(breakdown.infrastructure_usd).toFixed(4)}`,
          ),
      );
    }
  } else if (run?.cost_usd !== undefined && run?.cost_usd !== null) {
    // A list row, which carries no breakdown. Labelled for what it is rather
    // than passed off as the total.
    line("  " + pc.dim(`model cost: $${Number(run.cost_usd).toFixed(4)}`));
  }
  if (!compact && run?.output) {
    line("");
    line(typeof run.output === "string" ? run.output : JSON.stringify(run.output, null, 2));
  }
  if (run?.error?.message) line("  " + pc.red(run.error.message));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;

}

/**
 * `name=Refunds` pairs into a body, refusing anything not on the list.
 *
 * An allowlist rather than "send whatever was typed": the upstream DTOs strip
 * unknown fields silently (a global whitelisting ValidationPipe), so a typo
 * like `instructions=` instead of `instructions_md=` would be accepted, sent,
 * dropped, and reported as success — leaving an agent that had been told
 * nothing with nothing anywhere saying so.
 */
function parsePairs(pairs: string[], allowed: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of pairs) {
    const at = raw.indexOf("=");
    if (at < 1) {
      throw new Error(`"${raw}" is not a key=value pair.`);
    }
    const key = raw.slice(0, at).trim();
    const value = raw.slice(at + 1);
    if (!allowed.includes(key)) {
      throw new Error(`"${key}" is not a field here. Accepted: ${allowed.join(", ")}`);
    }
    if (value) out[key] = value;
  }
  return out;
}
