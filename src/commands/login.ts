import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { clearSession } from "../config.js";
import { ok, success, line } from "../output.js";
import { WorkserError } from "../errors.js";

/**
 * The Workser desktop app signs the CLI in. When it is open and signed in it writes
 * ~/.workser/session.json pointing at its own connection on this computer, and every
 * `workser` call goes through it (its sign-in, its approvals, its live view).
 *
 * There is no token to paste. Workser's API serves the CLI's routes only behind the
 * desktop app's sign-in (core's `/orbit/*`), so a token saved for the cloud API would
 * fail on the first call. `workser login` therefore only checks the connection and says
 * what to do when there is none. It used to send people to workser.ai/settings/tokens,
 * a page that does not exist.
 */
export const OPEN_THE_APP =
  "Open the Workser desktop app on this computer and sign in. It connects the CLI by itself; there is nothing to paste.";

export function registerLogin(program: Command): void {
  program
    .command("login")
    .description("Check that the CLI is connected through the Workser desktop app (open and signed in)")
    .action(
      action(async ({ ctx }) => {
        if (ctx.mode !== "daemon") {
          // The hint under a not_connected error (output.ts) says how to fix it.
          throw new WorkserError("Not connected to the Workser desktop app.", {
            code: "not_connected",
            details: OPEN_THE_APP,
          });
        }
        const who = await api(ctx, "/v1/whoami");
        ok({ user: who.email ?? who.id, workspace: who.workspace?.name, via: "desktop-app" }, () => {
          success(`Signed in as ${who.email ?? who.id}, through the Workser desktop app`);
          if (who.workspace?.name) line(`workspace: ${who.workspace.name}`);
        });
      }),
    );

  program
    .command("logout")
    .description("Forget this computer's saved CLI session (sign out in the desktop app to sign out fully)")
    .action(
      action(async () => {
        clearSession();
        ok({ loggedOut: true }, () =>
          success("Logged out. The desktop app connects the CLI again when it next starts signed in."),
        );
      }),
    );
}
