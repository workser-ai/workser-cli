import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { writeSession, clearSession } from "../config.js";
import { ok, success, line, info, isJson } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * Inside Workser Orbit, login is automatic — the app writes ~/.workser/session.json
 * pointing at the local daemon. `workser login` is for STANDALONE / CI use:
 * authenticate against the cloud API with a token (from the Workser dashboard).
 */
export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Authenticate for standalone/CI use (Orbit does this automatically)")
    .option("--token <token>", "API token (otherwise you'll be prompted)")
    .option("--endpoint <url>", "API base url (defaults to cloud)")
    .action(
      action(async ({ ctx, opts }) => {
        let token: string | undefined = opts.token;
        if (!token) {
          if (isJson() || !process.stdin.isTTY) {
            throw new WorkserError("Provide --token (no interactive prompt available).", {
              code: "unauthorized",
            });
          }
          info("Create a token at https://workser.ai/settings/tokens");
          const rl = createInterface({ input: process.stdin, output: process.stdout });
          token = (await rl.question("Paste your Workser API token: ")).trim();
          rl.close();
        }
        if (!token) throw new WorkserError("No token provided.", { code: "unauthorized" });

        const endpoint = (opts.endpoint || ctx.endpoint).replace(/\/+$/, "");
        // Verify the token before persisting it.
        const who = await api({ ...ctx, endpoint, token }, "/v1/whoami");
        writeSession({
          endpoint,
          token,
          workspaceId: who.workspace?.id,
          workspaceName: who.workspace?.name,
          defaultProjectId: who.workspace?.defaultProjectId,
        });

        ok({ user: who.email ?? who.id, workspace: who.workspace?.name }, () => {
          success(`Logged in as ${who.email ?? who.id}`);
          if (who.workspace?.name) line(`workspace: ${who.workspace.name}`);
        });
      }),
    );

  program
    .command("logout")
    .description("Clear the saved standalone session")
    .action(
      action(async () => {
        clearSession();
        ok({ loggedOut: true }, () => success("Logged out."));
      }),
    );
}
