import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Panel, Field, buttonClass, fieldClass } from "@/components/bits";
import {
  ENGINES,
  checkChromeAI,
  generateWithEngine,
  unloadCurrentEngine,
  summarizeWithChrome,
  type Engine,
  type LocalModelId,
  type LoadProgress,
} from "@/lib/local-ai";

export function LocalSchemeGenerator() {
  const [engine, setEngine] = useState<Engine>("transformers");
  const [modelId, setModelId] = useState<LocalModelId>(ENGINES[2].models[0].id);
  const [chromeStatus, setChromeStatus] = useState<"available" | "downloadable" | "unavailable" | "checking">("checking");
  const [grade, setGrade] = useState("Grade 7");
  const [subject, setSubject] = useState("Mathematics");
  const [strand, setStrand] = useState("Measurement");
  const [substrand, setSubstrand] = useState("Area");
  const [term, setTerm] = useState("Term 3");
  const [weeks, setWeeks] = useState("1-4");
  const [extra, setExtra] = useState("");
  const [maxTokens, setMaxTokens] = useState(640);
  const [temperature, setTemperature] = useState(0.65);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    checkChromeAI().then(setChromeStatus);
  }, []);

  const engineDef = ENGINES.find((e) => e.id === engine)!;
  const models = engineDef.models;

  function onProgress(p: LoadProgress) {
    if (p.status === "progress" && p.progress != null) {
      const pct = Math.round(p.progress * 100);
      setProgress(`${p.text || "Loading"} ${pct}%`);
    } else if (p.status === "ready") {
      setProgress("Model ready. Generating…");
    } else {
      setProgress(p.text || "Loading…");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStreaming(true);
    setOutput("");
    setProgress("Preparing…");

    const prompt = [
      `You are a Kenyan Junior Secondary School teacher writing a Competency Based Education (CBE / CBC) scheme of work.`,
      ``,
      `Grade: ${grade}`,
      `Learning area: ${subject}`,
      `Strand: ${strand}`,
      `Sub-strand: ${substrand}`,
      `Term: ${term}`,
      `Weeks: ${weeks}`,
      extra.trim() ? `Extra instructions: ${extra.trim()}` : "",
      ``,
      `Write a clear, practical scheme of work covering the weeks requested.`,
      `For each lesson include: specific learning outcomes, learning experiences, key inquiry questions, resources, and assessment.`,
      `Use simple, classroom-ready language suitable for Kenyan JSS.`,
      `Output in plain text with clear headings.`,
    ].filter(Boolean).join("\n");

    try {
      const text = await generateWithEngine(engine, modelId, prompt, {
        maxNewTokens: maxTokens,
        temperature,
        onProgress,
        onToken: (token) => {
          setOutput((prev) => prev + token);
        },
      });
      if (!streaming) setOutput(text);
      setProgress("");
      toast.success("Local scheme draft ready.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Local generation failed.";
      toast.error(message);
      setProgress("");
    } finally {
      setBusy(false);
      setStreaming(false);
    }
  }

  function downloadDraft() {
    if (!output) return;
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scheme-${grade.replace(/\s+/g, "-")}-${subject.replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Draft downloaded.");
  }

  async function summarize() {
    if (!output) return;
    setBusy(true);
    const summary = await summarizeWithChrome(output, "key-points");
    if (summary) {
      setOutput((prev) => `${prev}\n\n--- Key points ---\n${summary}`);
      toast.success("Summary added.");
    } else {
      toast.error("Chrome Summarizer not available.");
    }
    setBusy(false);
  }

  async function unload() {
    await unloadCurrentEngine();
    toast.success("Model unloaded from memory.");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl leading-tight">Local AI writer</h1>
        <p className="mt-2 max-w-2xl text-ink/80">
          Generate a scheme draft entirely on your device. No API key, no server, nothing leaves the browser.
          Streaming is used when the engine supports it.
        </p>
      </div>

      <Panel>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Engine" hint="Chrome built-in is fastest if available. WebLLM is the most powerful. Transformers.js works everywhere.">
            <select
              className={fieldClass}
              value={engine}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value as Engine;
                setEngine(next);
                const def = ENGINES.find((item) => item.id === next)!;
                setModelId(def.models[0].id);
              }}
            >
              {ENGINES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                  {e.id === "chrome" ? ` (${chromeStatus})` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Model" hint={models.find((m) => m.id === modelId)?.note}>
            <select
              className={fieldClass}
              value={modelId}
              disabled={busy}
              onChange={(e) => setModelId(e.target.value as LocalModelId)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.note}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Max tokens: ${maxTokens}`}>
              <input
                type="range"
                min={128}
                max={1024}
                step={64}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                disabled={busy}
                className="w-full"
              />
            </Field>
            <Field label={`Temperature: ${temperature.toFixed(2)}`}>
              <input
                type="range"
                min={0.1}
                max={1.2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={busy}
                className="w-full"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Grade">
              <input className={fieldClass} value={grade} onChange={(e) => setGrade(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Learning area">
              <input className={fieldClass} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Strand">
              <input className={fieldClass} value={strand} onChange={(e) => setStrand(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Sub-strand">
              <input className={fieldClass} value={substrand} onChange={(e) => setSubstrand(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Term">
              <input className={fieldClass} value={term} onChange={(e) => setTerm(e.target.value)} disabled={busy} />
            </Field>
            <Field label="Weeks">
              <input className={fieldClass} value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="e.g. 1-4" disabled={busy} />
            </Field>
          </div>

          <Field label="Extra instructions (optional)">
            <textarea
              className={fieldClass}
              rows={3}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="e.g. Focus on practical activities, include safety notes…"
              disabled={busy}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass("leaf")} disabled={busy || (engine === "chrome" && chromeStatus === "unavailable")}>
              {busy ? (streaming ? "Streaming…" : "Generating…") : "Generate with local AI"}
            </button>
            <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void unload()}>
              Unload model
            </button>
          </div>

          {progress ? <p className="text-sm font-medium text-leaf">{progress}</p> : null}
          {engine === "chrome" && chromeStatus === "unavailable" ? (
            <p className="text-sm text-clay">Chrome built-in AI is not available in this browser. Switch to WebLLM or Transformers.js.</p>
          ) : null}
        </form>
      </Panel>

      {output ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Draft{streaming ? " (streaming)" : ""}</h2>
            <div className="flex gap-2">
              <button type="button" className={buttonClass("ghost")} onClick={() => navigator.clipboard.writeText(output).then(() => toast.success("Copied."))}>
                Copy
              </button>
              <button type="button" className={buttonClass("ghost")} onClick={downloadDraft}>
                Download .txt
              </button>
              <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => void summarize()}>
                Add key points
              </button>
            </div>
          </div>
          <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm leading-relaxed text-ink">{output}</pre>
          <p className="mt-3 text-xs text-ink/65">
            Review and edit before teaching. For full structured schemes with official columns, use the main Generate page (cloud AI).
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
