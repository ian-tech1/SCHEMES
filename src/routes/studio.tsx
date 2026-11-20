import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { Download, Sparkles } from "lucide-react";
import { AppShell } from "@/components/shell";
import { buttonClass, fieldClass, Field, Panel } from "@/components/bits";
import { STUDIO_TOOLS, type StudioDraft } from "@/lib/studio-tools";
import { polishStudioDraft } from "@/lib/studio.functions";

export const Route = createFileRoute("/studio")({ component: StudioPage });

function StudioPage() {
  return (
    <AppShell>
      <StudioBody />
    </AppShell>
  );
}

function fileName(title: string): string {
  const clean = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return clean || "iantech-schemes";
}

async function downloadDocx(draft: StudioDraft) {
  const doc = new Document({
    sections: [
      {
        children: draft.lines.map((line, index) =>
          new Paragraph({
            heading: index === 0 ? HeadingLevel.HEADING_1 : undefined,
            spacing: { after: line ? 120 : 80 },
            children: [new TextRun({ text: line || " ", font: "Calibri", size: index === 0 ? 32 : 22 })],
          }),
        ),
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName(draft.title)}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(draft: StudioDraft) {
  const blob = new Blob([draft.lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName(draft.title)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function StudioBody() {
  const [toolId, setToolId] = useState(STUDIO_TOOLS[0]?.id ?? "observation");
  const tool = useMemo(() => STUDIO_TOOLS.find((item) => item.id === toolId) ?? STUDIO_TOOLS[0]!, [toolId]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function setField(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function build() {
    const next = tool.build(values);
    setDraft(next);
    setNote("Draft ready. Download it here, or ask Grok to tighten the wording.");
  }

  async function polish() {
    if (!draft) return;
    setBusy(true);
    setNote("");
    try {
      const result = await polishStudioDraft({ data: { title: draft.title, text: draft.lines.join("\n") } });
      if (!result.ok) {
        setNote(result.error);
        return;
      }
      setDraft({ title: draft.title, lines: result.text.split("\n") });
      setNote("Grok edited this copy. Read it before you print. Download stays on this page.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Grok could not edit this draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold tracking-wide text-leaf">Teacher studio · {STUDIO_TOOLS.length} documents</p>
        <h1 className="font-display text-4xl text-ink">Documents you can finish and download here</h1>
        <p className="mt-2 max-w-3xl text-ink/80">
          Each document is built on this page and downloaded as Word or plain text. Nothing is sent to another site except an optional Grok edit when you press the button.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {STUDIO_TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setToolId(item.id);
              setDraft(null);
              setNote("");
            }}
            className={`rounded-xl border px-3 py-3 text-left ${item.id === tool.id ? "border-leaf bg-leaf/10" : "border-line bg-card"}`}
          >
            <span className="font-semibold">{item.title}</span>
            <span className="mt-1 block text-sm font-normal text-ink/70">{item.blurb}</span>
          </button>
        ))}
      </div>
      <Panel>
        <h2 className="font-display text-3xl">{tool.title}</h2>
        <p className="mt-1 text-sm text-ink/75">{tool.blurb}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tool.fields.map((field) => (
            <Field key={field.key} label={field.label}>
              {field.multiline ? (
                <textarea className={fieldClass} rows={4} placeholder={field.placeholder} value={values[field.key] ?? ""} onChange={(event) => setField(field.key, event.target.value)} />
              ) : (
                <input className={fieldClass} placeholder={field.placeholder} value={values[field.key] ?? ""} onChange={(event) => setField(field.key, event.target.value)} />
              )}
            </Field>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonClass("leaf")} onClick={build}>Build the document</button>
          <button type="button" className={buttonClass("ink")} disabled={!draft || busy} onClick={() => void polish()}>
            <Sparkles className="size-4" aria-hidden="true" />
            {busy ? "Grok is editing…" : "Ask Grok to raise the quality"}
          </button>
        </div>
        {note ? <p className="mt-3 text-sm text-ink/80">{note}</p> : null}
      </Panel>
      {draft ? (
        <Panel>
          <div className="mb-3 flex flex-wrap gap-2 no-print">
            <button type="button" className={buttonClass("leaf")} onClick={() => void downloadDocx(draft)}>
              <Download className="size-4" aria-hidden="true" />
              Download Word
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={() => downloadText(draft)}>Download text</button>
            <button type="button" className={buttonClass("ghost")} onClick={() => window.print()}>Print</button>
          </div>
          <article className="space-y-2">
            {draft.lines.map((line, index) => (
              <p key={`${index}-${line.slice(0, 12)}`} className={index === 0 ? "font-display text-2xl" : "text-sm whitespace-pre-wrap"}>
                {line || "\u00a0"}
              </p>
            ))}
          </article>
        </Panel>
      ) : null}
    </div>
  );
}
