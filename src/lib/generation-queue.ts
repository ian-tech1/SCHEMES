import type { GenInput } from "@/lib/cbe-types";
import { enqueueGeneration, getGenerationJob, runGenerationJob } from "@/lib/cbe.functions";

export type GenerationProgress = "queued" | "processing" | "saving";

export async function generateDocumentQueued(
  input: GenInput,
  onProgress?: (state: GenerationProgress) => void,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const queued = await enqueueGeneration({ data: input });
  if (!queued.ok) return queued;
  onProgress?.("queued");

  let workerRunning = false;
  let lastKickAt = 0;
  const startWorker = () => {
    if (workerRunning) return;
    workerRunning = true;
    lastKickAt = Date.now();
    void runGenerationJob({ data: queued.jobId })
      .catch(() => undefined)
      .finally(() => { workerRunning = false; });
  };
  startWorker();

  const startedAt = Date.now();
  const timeoutMs = 10 * 60 * 1000;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    let result: Awaited<ReturnType<typeof getGenerationJob>>;
    try {
      result = await getGenerationJob({ data: queued.jobId });
    } catch {
      continue;
    }
    if (!result.ok) return result;
    if (result.job.status === "completed" && result.job.documentId) {
      onProgress?.("saving");
      return { ok: true, id: result.job.documentId };
    }
    if (result.job.status === "failed") {
      return { ok: false, error: result.job.error || "The queued writing could not be completed. Try again." };
    }
    if (result.job.status === "queued") {
      onProgress?.("queued");
      if (!workerRunning && Date.now() - lastKickAt >= 12_000) startWorker();
    } else {
      onProgress?.("processing");
    }
  }
  return {
    ok: false,
    error: "This writing is still in the durable queue. Leave this page open or return to your library shortly; it will not be discarded.",
  };
}
