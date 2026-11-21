/**
 * Local (no-API-key) AI using Transformers.js.
 * Models download once and run entirely in the browser via WebGPU / WASM.
 */
import { pipeline, env, type TextGenerationPipeline } from "@huggingface/transformers";

// Prefer cached models after first load
env.allowLocalModels = true;
env.useBrowserCache = true;

export type LocalModelId =
  | "HuggingFaceTB/SmolLM2-360M-Instruct"
  | "HuggingFaceTB/SmolLM2-135M-Instruct"
  | "onnx-community/Qwen2.5-0.5B-Instruct";

const DEFAULT_MODEL: LocalModelId = "HuggingFaceTB/SmolLM2-360M-Instruct";

let generator: TextGenerationPipeline | null = null;
let currentModel: LocalModelId | null = null;
let loading: Promise<TextGenerationPipeline> | null = null;

export type LoadProgress = {
  status: "initiate" | "download" | "progress" | "done" | "ready";
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

export async function loadLocalModel(
  modelId: LocalModelId = DEFAULT_MODEL,
  onProgress?: (p: LoadProgress) => void,
): Promise<TextGenerationPipeline> {
  if (generator && currentModel === modelId) return generator;
  if (loading) return loading;

  loading = (async () => {
    try {
      onProgress?.({ status: "initiate" });
      const pipe = await pipeline("text-generation", modelId, {
        dtype: "q4",
        progress_callback: (progress) => {
          onProgress?.({
            status: progress.status as LoadProgress["status"],
            file: progress.file,
            progress: progress.progress,
            loaded: progress.loaded,
            total: progress.total,
          });
        },
      });
      generator = pipe;
      currentModel = modelId;
      onProgress?.({ status: "ready" });
      return pipe;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export async function generateLocalText(
  prompt: string,
  options: {
    modelId?: LocalModelId;
    maxNewTokens?: number;
    temperature?: number;
    onProgress?: (p: LoadProgress) => void;
  } = {},
): Promise<string> {
  const modelId = options.modelId ?? DEFAULT_MODEL;
  const pipe = await loadLocalModel(modelId, options.onProgress);

  const result = await pipe(prompt, {
    max_new_tokens: options.maxNewTokens ?? 384,
    temperature: options.temperature ?? 0.7,
    do_sample: true,
    top_p: 0.9,
    repetition_penalty: 1.1,
  });

  const text = Array.isArray(result) ? result[0]?.generated_text ?? "" : String(result);
  // Strip the original prompt if the model echoes it
  if (text.startsWith(prompt)) return text.slice(prompt.length).trim();
  return text.trim();
}

export function isLocalModelLoaded(modelId: LocalModelId = DEFAULT_MODEL): boolean {
  return generator !== null && currentModel === modelId;
}

export function getCurrentLocalModel(): LocalModelId | null {
  return currentModel;
}
