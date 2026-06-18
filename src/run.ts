import type { Command } from "commander";
import { buildContext, type Context, type GlobalOpts } from "./context.js";
import { fail } from "./output.js";

export interface ActionCtx {
  ctx: Context;
  /** Merged global + command options. */
  opts: GlobalOpts & Record<string, any>;
  /** Positional arguments for the command, in order. */
  args: any[];
  cmd: Command;
}

/**
 * Wrap a command handler: resolves the connection context from merged global
 * options, passes positional args, and funnels every throw through `fail`
 * (so errors render correctly in both text and `--json` mode).
 */
export function action(fn: (a: ActionCtx) => Promise<void> | void) {
  return async (...cbArgs: any[]) => {
    const cmd = cbArgs[cbArgs.length - 1] as Command;
    const positionals = cbArgs.slice(0, -2);
    try {
      const opts = cmd.optsWithGlobals() as GlobalOpts & Record<string, any>;
      const ctx = buildContext(opts);
      await fn({ ctx, opts, args: positionals, cmd });
    } catch (e) {
      fail(e);
    }
  };
}
