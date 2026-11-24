/**
 * Multi-engine local AI (no API keys).
 * Engines:
 *  - transformers: Transformers.js (ONNX, WebGPU/WASM)
 *  - webllm: WebLLM (MLC, WebGPU) — best quality
 *  - chrome: Chrome built-in LanguageModel (Gemini Nano)
 */
import { pipeline, env, type TextGenerationPipeline } from "@huggingface/transformers";

env.allowLocalModels = true;
env.useBrowserCache = true;

export type Engine = "transformers" | "webllm" | "chrome";

export type TransformersModel =
  | "HuggingFaceTB/SmolLM2-360M-Instruct"
  | "HuggingFaceTB/SmolLM2-135M-Instruct"
  | "onnx-community/Qwen2.5-0.5B-Instruct"
  | "onnx-community/Phi-3.5-mini-instruct";

export type WebLLMModel =
  | "Llama-3.2-1B-Instruct-q4f16_1-MLC"
  | "Llama-3.2-3B-Instruct-q4f16_1-MLC"
  | "Qwen2.5-1.5B-Instruct-q4f16_1-MLC"
  | "Phi-3.5-mini-instruct-q4f16_1-MLC"
  | "gemma-2-2b-it-q4f16_1-MLC";

export type LocalModelId = TransformersModel | WebLLMModel | "chrome-nano";

export type LoadProgress = {
  status: string;
  progress?: number;
  text?: string;
};

type EngineInstance = {
  engine: Engine;
  model: LocalModelId;
  generate: (prompt: string, opts: { maxNewTokens?: number; temperature?: number }) => Promise<string>;
  stream?: (prompt: string, opts: { maxNewTokens?: number; temperature?: number; onToken: (token: string) => void }) => Promise<string>;
  unload?: () => Promise<void>;
};

let current: EngineInstance | null = null;
let loading: Promise<EngineInstance> | null = null;

export const ENGINES: {
  id: Engine;
  label: string;
  models: { id: LocalModelId; label: string; note: string }[];
}[] = [
  {
    id: "chrome",
    label: "Chrome built-in (Gemini Nano)",
    models: [{ id: "chrome-nano", label: "Gemini Nano", note: "Zero download if already in Chrome · fastest start" }],
  },
  {
    id: "webllm",
    label: "WebLLM (powerful WebGPU)",
    models: [
      { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", note: "Fast, good quality (~800 MB)" },
      { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", note: "Strong multilingual (~1 GB)" },
      { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi-3.5 Mini", note: "Excellent reasoning (~2 GB)" },
      { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B", note: "Higher quality (~2 GB)" },
      { id: "gemma-2-2b-it-q4f16_1-MLC", label: "Gemma 2 2B", note: "Google's efficient model (~1.5 GB)" },
    ],
  },
  {
    id: "transformers",
    label: "Transformers.js (compatible)",
    models: [
      { id: "HuggingFaceTB/SmolLM2-360M-Instruct", label: "SmolLM2 360M", note: "Best small balance (~200 MB)" },
      { id: "HuggingFaceTB/SmolLM2-135M-Instruct", label: "SmolLM2 135M", note: "Tiny & fast (~80 MB)" },
      { id: "onnx-community/Qwen2.5-0.5B-Instruct", label: "Qwen2.5 0.5B", note: "Solid reasoning (~300 MB)" },
      { id: "onnx-community/Phi-3.5-mini-instruct", label: "Phi-3.5 Mini (ONNX)", note: "Larger ONNX option" },
    ],
  },
];

export async function checkChromeAI(): Promise<"available" | "downloadable" | "unavailable"> {
  if (typeof window === "undefined" || !("LanguageModel" in window)) return "unavailable";
  try {
    // @ts-expect-error Chrome built-in
    const availability = await window.LanguageModel.availability();
    if (availability === "available") return "available";
    if (availability === "downloadable" || availability === "downloading") return "downloadable";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

async function loadTransformers(modelId: TransformersModel, onProgress?: (p: LoadProgress) => void): Promise<EngineInstance> {
  onProgress?.({ status: "initiate" });
  const pipe = await pipeline("text-generation", modelId, {
    dtype: "q4",
    progress_callback: (progress: any) => {
      onProgress?.({
        status: progress.status,
        progress: progress.progress,
        text: progress.file,
      });
    },
  });
  return {
    engine: "transformers",
    model: modelId,
    generate: async (prompt, opts) => {
      const result = await (pipe as TextGenerationPipeline)(prompt, {
        max_new_tokens: opts.maxNewTokens ?? 512,
        temperature: opts.temperature ?? 0.7,
        do_sample: true,
        top_p: 0.9,
        repetition_penalty: 1.1,
      });
      const text = Array.isArray(result) ? result[0]?.generated_text ?? "" : String(result);
      return text.startsWith(prompt) ? text.slice(prompt.length).trim() : text.trim();
    },
  };
}

async function loadWebLLM(modelId: WebLLMModel, onProgress?: (p: LoadProgress) => void): Promise<EngineInstance> {
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  onProgress?.({ status: "initiate" });
  const engine = await CreateMLCEngine(modelId, {
    initProgressCallback: (report: any) => {
      onProgress?.({
        status: "progress",
        progress: report.progress,
        text: report.text,
      });
    },
  });
  return {
    engine: "webllm",
    model: modelId,
    generate: async (prompt, opts) => {
      const reply = await engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxNewTokens ?? 512,
        temperature: opts.temperature ?? 0.7,
      });
      return reply.choices[0]?.message?.content?.trim() ?? "";
    },
    stream: async (prompt, opts) => {
      let full = "";
      const stream = await engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        max_tokens: opts.maxNewTokens ?? 512,
        temperature: opts.temperature ?? 0.7,
        stream: true,
      });
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? "";
        if (token) {
          full += token;
          opts.onToken(token);
        }
      }
      return full.trim();
    },
    unload: async () => {
      await engine.unload();
    },
  };
}

async function loadChrome(onProgress?: (p: LoadProgress) => void): Promise<EngineInstance> {
  // @ts-expect-error Chrome built-in
  if (typeof window === "undefined" || !window.LanguageModel) {
    throw new Error("Chrome LanguageModel not available. Use Chrome 148+ desktop.");
  }
  onProgress?.({ status: "initiate" });
  // @ts-expect-error
  const session = await window.LanguageModel.create({
    monitor(m: any) {
      m.addEventListener("downloadprogress", (e: any) => {
        onProgress?.({ status: "progress", progress: e.loaded, text: "Downloading Gemini Nano…" });
      });
    },
  });
  return {
    engine: "chrome",
    model: "chrome-nano",
    generate: async (prompt, opts) => {
      // @ts-expect-error
      const text = await session.prompt(prompt, {
        temperature: opts.temperature ?? 0.7,
      });
      return String(text).trim();
    },
    stream: async (prompt, opts) => {
      // @ts-expect-error
      const stream = session.promptStreaming(prompt, {
        temperature: opts.temperature ?? 0.7,
      });
      let full = "";
      for await (const chunk of stream) {
        const token = String(chunk);
        full += token;
        opts.onToken(token);
      }
      return full.trim();
    },
  };
}

export async function loadEngine(
  engine: Engine,
  modelId: LocalModelId,
  onProgress?: (p: LoadProgress) => void,
): Promise<EngineInstance> {
  if (current && current.engine === engine && current.model === modelId) return current;
  if (loading) return loading;

  loading = (async () => {
    try {
      let instance: EngineInstance;
      if (engine === "transformers") instance = await loadTransformers(modelId as TransformersModel, onProgress);
      else if (engine === "webllm") instance = await loadWebLLM(modelId as WebLLMModel, onProgress);
      else instance = await loadChrome(onProgress);
      current = instance;
      onProgress?.({ status: "ready" });
      return instance;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export async function generateWithEngine(
  engine: Engine,
  modelId: LocalModelId,
  prompt: string,
  options: { maxNewTokens?: number; temperature?: number; onProgress?: (p: LoadProgress) => void; onToken?: (token: string) => void } = {},
): Promise<string> {
  const instance = await loadEngine(engine, modelId, options.onProgress);
  if (options.onToken && instance.stream) {
    return instance.stream(prompt, {
      maxNewTokens: options.maxNewTokens,
      temperature: options.temperature,
      onToken: options.onToken,
    });
  }
  return instance.generate(prompt, options);
}

export async function unloadCurrentEngine(): Promise<void> {
  if (current?.unload) {
    await current.unload();
  }
  current = null;
}

export function getCurrentEngine(): { engine: Engine; model: LocalModelId } | null {
  return current ? { engine: current.engine, model: current.model } : null;
}

/** Chrome Summarizer helper (no key). Returns null if unavailable. */
export async function summarizeWithChrome(text: string, type: "key-points" | "tldr" | "teaser" = "key-points"): Promise<string | null> {
  if (typeof window === "undefined" || !("Summarizer" in window)) return null;
  try {
    // @ts-expect-error
    const summarizer = await window.Summarizer.create({ type, format: "plain-text" });
    // @ts-expect-error
    return await summarizer.summarize(text);
  } catch {
    return null;
  }
}
