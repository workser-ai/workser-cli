import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line } from "../output.js";
import { resolveMediaSource } from "../media-source.js";

/**
 * `workser video understand` — the local agent's fallback for a video it
 * can't natively watch: a text-only model, or a clip it has no other way to
 * reach. Runs server-side via Gemini (see `orbit-media-understanding.service.ts`
 * in core-api); the agent never holds a model key.
 *
 * Same shape as `workser image understand` — see that command for the
 * `--url`/`--file` tradeoff (URL is fetched server-side with no size
 * ceiling; `--file` is read and inlined here, so it's for small clips only).
 */
export function registerVideo(program: Command): void {
  const video = program
    .command("video")
    .description("Understand video (the fallback for a model that can't watch it itself)");

  video
    .command("understand <query>")
    .description("Summarize/describe/answer questions about a video")
    .option("-u, --url <url>", "the video's URL (fetched server-side; also accepts a YouTube URL)")
    .option("-f, --file <path>", "a local video file (read + sent inline; small clips only)")
    .option(
      "-t, --task <task>",
      "summarize | describe | visual_qa | timestamp_analysis | general",
      "general",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const projectId = requireProject(ctx as Context);
        const source = await resolveMediaSource({ url: opts.url, file: opts.file });
        const res = await api(ctx as Context, `/projects/${projectId}/video/understand`, {
          method: "POST",
          body: { source, query: args[0], task: opts.task },
        });
        ok(res, () => line(res?.answer ?? ""));
      }),
    );
}
