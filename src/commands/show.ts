import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireLocalApp, runTarget } from "../context.js";
import { ok, success } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * `workser show app <id> [preview|code|cloud]` — open one of the person's apps
 * beside the chat on this computer.
 *
 * With a plan, an AI agent opens tabs in the web chat through its own tool. On
 * the person's computer (their own agents and teammates, no plan needed) this
 * is the same thing: the Workser app opens the app's tab next to the chat,
 * on the section asked for — the running app, its files, or its cloud
 * (database, sign-in, storage, keys, domains, logs).
 *
 * Only an app of this computer's business. An id that isn't one comes back as
 * a plain error that lists the apps there are, so the agent can try again.
 */
export const SHOW_KINDS = ["app"] as const;
export const SHOW_SECTIONS = ["preview", "code", "cloud"] as const;
export type ShowSection = (typeof SHOW_SECTIONS)[number];

/** The words an agent may type for a section, as the section they mean. */
const SECTION_WORDS: Record<string, ShowSection> = {
  preview: "preview",
  run: "preview",
  live: "preview",
  phone: "preview",
  code: "code",
  files: "code",
  cloud: "cloud",
  settings: "cloud",
  database: "cloud",
  logs: "cloud",
};

const SAFE_ID = /^[\w-]{1,80}$/;

/** Check what was typed. Throws the plain error the agent reads. */
export function readShowArgs(
  kind: string | undefined,
  id: string | undefined,
  section: string | undefined,
): { kind: "app"; id: string; section: ShowSection } {
  const k = (kind ?? "").trim().toLowerCase();
  if (k !== "app") {
    throw new WorkserError(
      "Workser can show an app: `workser show app <app id> [preview|code|cloud]`.",
      { code: "bad_request" },
    );
  }
  const appId = (id ?? "").trim();
  if (!appId) {
    throw new WorkserError(
      "Say which app: `workser show app <app id>`. `workser project apps` lists them.",
      { code: "bad_request" },
    );
  }
  if (!SAFE_ID.test(appId)) {
    throw new WorkserError(
      `"${appId.slice(0, 80)}" isn't an app id. \`workser project apps\` lists the apps and their ids.`,
      { code: "bad_request" },
    );
  }
  const word = (section ?? "").trim().toLowerCase();
  const picked = word ? SECTION_WORDS[word] : "preview";
  if (!picked) {
    throw new WorkserError(
      `Unknown section "${word.slice(0, 40)}". Use one of: ${SHOW_SECTIONS.join(", ")}.`,
      { code: "bad_request" },
    );
  }
  return { kind: "app", id: appId, section: picked };
}

export function registerShow(program: Command): void {
  program
    .command("show <kind> <id> [section]")
    .description(
      "Open one of the person's apps beside the chat on this computer: `show app <id> [preview|code|cloud]`",
    )
    .action(
      action(async ({ ctx, args }) => {
        requireLocalApp(ctx, "show");
        const wanted = readShowArgs(
          args[0] as string | undefined,
          args[1] as string | undefined,
          args[2] as string | undefined,
        );
        const res = await api(ctx, `/v1/runs/${runTarget(ctx)}/show`, {
          body: wanted,
        });
        ok(res, () => success(res?.message ?? "Opened it beside the chat."));
      }),
    );
}
