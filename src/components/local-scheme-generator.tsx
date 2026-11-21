import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Panel, Field, buttonClass, fieldClass } from "@/components/bits";
import {
  generateLocalText,
  type LoadProgress,
  type LocalModelId,
} from "@/lib/local-ai";

const MODELS: { id: LocalModelId; label: string; note: string }[] = [
  { id: "HuggingFaceTB/SmolLM2-360M-Instruct", label: "SmolLM2 360M", note: "Best quality / speed balance (~200 MB)" },
  { id: "HuggingFaceTB/SmolLM2-135M-Instruct", label: "SmolLM2 135M", note: "Faster, smaller download (~80 MB)" },
  { id: "onnx-community/Qwen2.5-0.5B-Instruct", label: "Qwen2.5 0.5B", note: "Stronger reasoning (~300 MB)" },
];

export function LocalSchemeGenerator() {
  const [modelId, setModelId] = useState<LocalModelId>(MODELS[0].id);
  const [grade, setGrade] = useState("Grade 7");
  const [subject, setSubject] = useState("Mathematics");
  const [strand, setStrand] = useState("Measurement");
  const [substrand, setSubstrand] = useState("Area");
  const [term, setTerm] = useState("Term 3");
  const [weeks, setWeeks] = useState("1-4");
  const [extra, setExtra] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  function onProgress(p: LoadProgress) {
    if (p.status === "download" || p.status === "progress") {
      const pct = p.progress != null ? Math.round(p.progress) : "";
      setProgress(`Downloading model${pct ? ` ${pct}%` : ""}…`);
    } else if (p.status === "ready") {
      setProgress("Model ready. Generating…");
    } else if (p.status === "initiate") {
      setProgress("Loading model…");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
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
      const text = await generateLocalText(prompt, {
        modelId,
        maxNewTokens: 512,
        temperature: 0.65,
        onProgress,
      });
      setOutput(text);
      setProgress("");
      toast.success("Local scheme draft ready.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Local generation failed.";
      toast.error(message);
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-4xl leading-tight">Local AI writer</h1>
        <p className="mt-2 max-w-2xl text-ink/80">
          Generate a scheme draft entirely in your browser. No API key, no server, nothing leaves your device.
          The model downloads once (then works offline). Best on Chrome/Edge with a decent connection the first time.
        </p>
      </div>

      <Panel>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Model" hint="Larger models are smarter but take longer to download and run.">
            <select
              className={fieldClass}
              value={modelId}
              disabled={busy}
              onChange={(e) => setModelId(e.target.value as LocalModelId)}
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.note}
                </option>
              ))}
            </select>
          </Field>

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

          <button type="submit" className={buttonClass("leaf")} disabled={busy}>
            {busy ? "Generating…" : "Generate with local AI"}
          </button>

          {progress ? (
            <p className="text-sm font-medium text-leaf">{progress}</p>
          ) : null}
        </form>
      </Panel>

      {output ? (
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl">Draft</h2>
            <button
              type="button"
              className={buttonClass("ghost")}
              onClick={() => {
                navigator.clipboard.writeText(output).then(() => toast.success("Copied."));
              }}
            >
              Copy
            </button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm leading-relaxed text-ink">
            {output}
          </pre>
          <p className="mt-3 text-xs text-ink/65">
            Local models are smaller than cloud writers. Review and edit before teaching or printing.
            For full structured schemes with official columns, use the main Generate page (requires AI keys).
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
