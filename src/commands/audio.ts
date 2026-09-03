import type { Command } from "commander";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line } from "../output.js";
import { resolveMediaSource } from "../media-source.js";

/**
 * `workser audio understand` — the local agent's fallback for audio it can't
 * natively hear: a text-only model, or a clip it has no other way to reach.
 * Runs server-side via Gemini (see `orbit-media-understanding.service.ts` in
 * core-api); the agent never holds a model key.
 *
 * Same shape as `workser image understand` — see that command for the
 * `--url`/`--file` tradeoff.
 */
export function registerAudio(program: Command): void {
  const audio = program
    .command("audio")
    .description("Understand audio (the fallback for a model that can't hear it itself)");

  audio
    .command("understand <query>")
    .description("Transcribe/describe/answer questions about audio")
    .option("-u, --url <url>", "the audio's URL (fetched server-side; also accepts a YouTube URL)")
    .option("-f, --file <path>", "a local audio file (read + sent inline; small clips only)")
    .option(
      "-t, --task <task>",
      "transcribe | describe | audio_qa | speaker_diarization | emotion_detection | general",
      "general",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const projectId = requireProject(ctx as Context);
        const source = await resolveMediaSource({ url: opts.url, file: opts.file });
        const res = await api(ctx as Context, `/v1/projects/${projectId}/audio/understand`, {
          method: "POST",
          body: { source, query: args[0], task: opts.task },
        });
        ok(res, () => line(res?.answer ?? ""));
      }),
    );
}
