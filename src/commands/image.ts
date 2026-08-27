import type { Command } from "commander";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { action } from "../run.js";
import { api } from "../client.js";
import { requireProject, type Context } from "../context.js";
import { ok, line, success, info } from "../output.js";
import { WorkserError } from "../errors.js";
import { resolveMediaSource } from "../media-source.js";

/**
 * `workser image` — generate images from a prompt.
 *
 * This is the local agent's only route to image generation. Until now that
 * capability was locked inside the ai-agent service as a LangGraph tool bound to
 * agent state, so the only way to get one picture was to run a whole agent —
 * far too heavy for "make me a logo", and unreachable from a coding agent
 * working on the user's machine.
 *
 * STANDALONE, by decision: this does not open a design task or a brief in the
 * `v1/design` workspace module. Someone asking for a LINE rich menu or an OG
 * image is not starting a design review.
 *
 * The agent never holds a model key. The daemon attaches the session
 * credential, core-api proxies, and the ai-agent service owns Imagen and the
 * object store. What comes back is a public URL.
 *
 * It costs real money per call, which is why `--count` does not exist: an agent
 * looping "just one more variation" is exactly the failure mode metered
 * generation has. Ask again if you want another.
 */

interface GeneratedImage {
  filename: string;
  publicUrl: string;
  format: string;
}

interface GenerateResponse {
  images?: GeneratedImage[];
  /** The model sometimes narrates instead of drawing — a refusal, a question. */
  texts?: string[];
}

export function registerImage(program: Command): void {
  const image = program
    .command("image")
    .description("Generate images from a text prompt");

  image
    .command("generate <prompt>")
    .alias("gen")
    .description("Generate an image and return its public URL")
    .option(
      "-r, --reference <url...>",
      "condition on existing image URLs (image-to-image); up to 4",
    )
    .option(
      "-o, --output <path>",
      "also download the first image to this local path",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const projectId = requireProject(ctx as Context);
        const prompt = String(args[0] ?? "").trim();
        if (!prompt) {
          throw new WorkserError("A prompt is required.", {
            code: "bad_request",
          });
        }

        const references = (opts.reference as string[] | undefined)?.filter(
          Boolean,
        );

        const res = await api<GenerateResponse>(
          ctx as Context,
          `/projects/${projectId}/images/generate`,
          {
            method: "POST",
            body: {
              prompt,
              ...(references?.length
                ? { referenceImageUrls: references.slice(0, 4) }
                : {}),
            },
          },
        );

        const images = res.images ?? [];

        // The model returning words instead of a picture is a real outcome, not
        // an error — usually a refusal or a request to clarify. Surfacing it is
        // the difference between the agent retrying blindly and it knowing why.
        if (!images.length) {
          const said = res.texts?.join(" ").trim();
          throw new WorkserError(
            said
              ? `No image was generated. The model said: ${said}`
              : "No image was generated.",
            { code: "no_image" },
          );
        }

        let savedTo: string | undefined;
        if (opts.output) {
          savedTo = await download(images[0].publicUrl, String(opts.output));
        }

        ok({ images, texts: res.texts, savedTo }, () => {
          for (const img of images) {
            success(img.publicUrl);
          }
          if (savedTo) info(`Saved to ${savedTo}`);
          // Shown even on success: the model can both draw and comment, and the
          // comment often says what it changed or could not do.
          for (const text of res.texts ?? []) line(text);
        });
      }),
    );

  image
    .command("understand <query>")
    .description(
      "Describe/caption/answer questions about an image — the fallback for a text-only model or an image you have no other way to see",
    )
    .option("-u, --url <url>", "the image's URL (fetched server-side)")
    .option("-f, --file <path>", "a local image file (read + sent inline; small files only)")
    .option(
      "-t, --task <task>",
      "caption | visual_qa | object_detection | segmentation | general",
      "general",
    )
    .action(
      action(async ({ ctx, opts, args }) => {
        const projectId = requireProject(ctx as Context);
        const source = await resolveMediaSource({ url: opts.url, file: opts.file });
        const res = await api(ctx as Context, `/projects/${projectId}/images/understand`, {
          method: "POST",
          body: { source, query: args[0], task: opts.task },
        });
        ok(res, () => line(res?.answer ?? ""));
      }),
    );
}

/**
 * Download the generated image next to the agent's work.
 *
 * The URL is public and from our own object store, so this is a plain fetch. It
 * is opt-in because the useful artifact is usually the URL — an app references
 * it, it does not vendor it — and writing files nobody asked for into someone's
 * repo is how a helpful tool becomes a nuisance.
 */
async function download(url: string, output: string): Promise<string> {
  const target = resolve(output);
  const res = await fetch(url);
  if (!res.ok) {
    throw new WorkserError(
      `The image was generated but could not be downloaded (${res.status}). It is still available at ${url}`,
      { code: "download_failed" },
    );
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await res.arrayBuffer()));
  return target;
}
