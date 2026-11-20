import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { AppShell, useDesk } from "@/components/shell";
import { buttonClass, Field, fieldClass, Panel } from "@/components/bits";
import { deleteAssessmentRecord, getAssessmentSummary, listAssessments, saveAssessmentRecord } from "@/lib/cbe.functions";
import { CBA_LEVELS, cbaLevel, percentageOf } from "@/lib/question-plan";
import { LEVELS, TERMS, bandBadge, subjectsFor } from "@/lib/curriculum";
import type { AssessmentKind, AssessmentRecord, AssessmentScore, CbaLevel } from "@/lib/cbe-types";

export const Route = createFileRoute("/marks")({ component: MarksPage });

type SummaryRow = {
  subject: string;
  records: number;
  learners: number;
  assessed: number;
  average: number;
  top: number;
  levels: { exceeding: number; meeting: number; approaching: number; below: number };
};

type Draft = {
  id?: number;
  title: string;
  grade: string;
  stream: string;
  subject: string;
  term: string;
  year: number;
  assessmentKind: AssessmentKind;
  totalMarks: number;
  taughtOn: string;
  note: string;
  learners: AssessmentScore[];
};

const KINDS: { value: AssessmentKind; label: string }[] = [
  { value: "written", label: "Written" },
  { value: "oral", label: "Oral" },
  { value: "practical", label: "Practical" },
  { value: "project", label: "Project" },
  { value: "observation", label: "Observation" },
  { value: "midterm", label: "Midterm" },
  { value: "endterm", label: "End of term" },
];

const grades = LEVELS.find((level) => level.id === "primary")?.grades ?? [];
const today = new Date().toISOString().slice(0, 10);
const years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index);

function blankLearner(rollNo = ""): AssessmentScore {
  return { rollNo, learnerName: "", marks: null, note: "" };
}

function emptyDraft(grade: string = String(grades[0] ?? "Grade 1"), term: string = TERMS[0] ?? "Term 1", year = new Date().getFullYear()): Draft {
  return {
    title: "",
    grade,
    stream: "",
    subject: subjectsFor("primary", grade)[0] ?? "",
    term,
    year,
    assessmentKind: "written",
    totalMarks: 100,
    taughtOn: today,
    note: "",
    learners: [blankLearner("1")],
  };
}

function MarksPage() {
  return <AppShell><MarksBody /></AppShell>;
}

function MarksBody() {
  const { me } = useDesk();
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grade, setGrade] = useState("");
  const [stream, setStream] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("");
  const [year, setYear] = useState(0);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [classList, setClassList] = useState("");

  async function refresh() {
    setRecords(await listAssessments());
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load assessment records."));
  }, []);

  useEffect(() => {
    void getAssessmentSummary({ data: { grade, term, year } }).then(setSummary).catch(() => setSummary([]));
  }, [grade, term, year, records]);

  const visible = useMemo(() => records
    .filter((record) => !grade || record.grade === grade)
    .filter((record) => !stream || record.stream.toLowerCase().includes(stream.toLowerCase()))
    .filter((record) => !subject || record.subject === subject)
    .filter((record) => !term || record.term === term)
    .filter((record) => !year || record.year === year)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [records, grade, stream, subject, term, year]);

  const openRecord = draft.id ? records.find((record) => record.id === draft.id) : undefined;
  const subjects = subjectsFor("primary", grade || draft.grade);
  if (!me) return null;

  function newRecord() {
    setDraft(emptyDraft(grade || String(grades[0] ?? "Grade 1"), term || TERMS[0], year || new Date().getFullYear()));
    setClassList("");
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editRecord(record: AssessmentRecord) {
    setDraft({ ...record, learners: record.learners.map((learner) => ({ ...learner })) });
    setClassList("");
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeLearner(index: number, key: keyof AssessmentScore, value: string) {
    setDraft((current) => ({
      ...current,
      learners: current.learners.map((learner, rowIndex) => rowIndex === index ? {
        ...learner,
        [key]: key === "marks" ? (value === "" ? null : Math.min(Math.max(0, Number(value)), current.totalMarks)) : value,
      } : learner),
    }));
  }

  function changeTotalMarks(value: number) {
    const total = Math.max(1, Math.min(200, Math.round(value || 1)));
    setDraft((current) => ({
      ...current,
      totalMarks: total,
      learners: current.learners.map((learner) => ({ ...learner, marks: learner.marks == null ? null : Math.min(learner.marks, total) })),
    }));
  }

  function handleMarksChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const value = raw === "" ? null : Number(raw);
    if (value != null && value > draft.totalMarks) toast.info(`Marks cannot be above ${draft.totalMarks}. The score was clamped.`);
    changeLearner(index, "marks", raw);
  }

  function handleMarksKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      const next = document.getElementById(`learner-name-${index + 1}`);
      if (next instanceof HTMLInputElement) next.focus();
      else addLearner();
    }
  }

  function addLearner() {
    setDraft((current) => ({ ...current, learners: [...current.learners, blankLearner(String(current.learners.length + 1))] }));
  }

  function addThirty() {
    setDraft((current) => ({ ...current, learners: [...current.learners, ...Array.from({ length: 30 }, (_, index) => blankLearner(String(current.learners.length + index + 1)))] }));
    toast.success("Added 30 blank learner rows.");
  }

  function fillNames() {
    const names = classList.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) return;
    setDraft((current) => ({
      ...current,
      learners: names.map((name, index) => ({ ...(current.learners[index] ?? blankLearner()), rollNo: String(index + 1), learnerName: name })),
    }));
    setClassList("");
    toast.success(`${names.length} learner names added.`);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.subject.trim()) { toast.error("Add a title and learning area first."); return; }
    setBusy(true);
    try {
      const result = await saveAssessmentRecord({ data: draft });
      if (!result.ok) toast.error(result.error);
      else { toast.success(draft.id ? "Assessment record updated." : "Assessment record saved."); setDraft({ ...result.record, learners: result.record.learners.map((learner) => ({ ...learner })) }); await refresh(); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the assessment record."); }
    setBusy(false);
  }

  async function removeRecord(id: number) {
    if (!window.confirm("Delete this assessment record?")) return;
    const result = await deleteAssessmentRecord({ data: id });
    if (!result.ok) toast.error(result.error);
    else { toast.success("Assessment record deleted."); if (draft.id === id) { setEditing(false); setDraft(emptyDraft()); } await refresh(); }
  }

  function downloadCsv() {
    if (!openRecord) { toast.error("Open a saved record before exporting."); return; }
    const rows = [["Roll no", "Learner name", "Marks", "Percentage", "CBC level"], ...openRecord.learners.map((learner) => {
      const percent = percentageOf(learner.marks, openRecord.totalMarks);
      return [learner.rollNo, learner.learnerName, learner.marks == null ? "" : String(learner.marks), percent == null ? "" : `${percent}%`, percent == null ? "" : cbaLevel(percent).label];
    })];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${openRecord.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "assessment"}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("CSV downloaded.");
  }

  async function copySlip(learner: AssessmentScore) {
    if (!openRecord || learner.marks == null) { toast.error("Open a record with a learner score first."); return; }
    const percent = percentageOf(learner.marks, openRecord.totalMarks) ?? 0;
    const text = `${openRecord.subject} · ${openRecord.term} · ${learner.marks}/${openRecord.totalMarks} (${Math.round(percent)}%) · ${cbaLevel(percent).label}`;
    try { await navigator.clipboard.writeText(text); toast.success("Report slip line copied."); } catch { toast.error("Could not copy. Select the line and copy it."); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-leaf">Evidence for the report slip</p><h1 className="font-display text-4xl leading-tight">Assessment records</h1><p className="mt-2 max-w-2xl text-ink/80">Record each learner's score per assessment. The app converts marks to the four CBC levels for the report slip.</p></div>
      <button type="button" className={`${buttonClass("leaf")} no-print`} onClick={newRecord}>New record</button>
    </div>

    <Panel className="no-print"><h2 className="font-display text-2xl">Find your records</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="Grade"><select className={fieldClass} value={grade} onChange={(e) => { setGrade(e.target.value); setSubject(""); }}><option value="">All grades</option>{grades.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Stream"><input className={fieldClass} value={stream} onChange={(e) => setStream(e.target.value)} placeholder="All streams" /></Field>
      <Field label="Learning area"><select className={fieldClass} value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">All areas</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Term"><select className={fieldClass} value={term} onChange={(e) => setTerm(e.target.value)}><option value="">All terms</option>{TERMS.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Year"><select className={fieldClass} value={year} onChange={(e) => setYear(Number(e.target.value))}><option value={0}>All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></Field>
    </div>{grade ? <p className="mt-3 text-sm font-semibold text-leaf">{bandBadge(grade)}</p> : null}</Panel>

    {editing ? <Panel className="print:hidden"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl">{draft.id ? "Edit assessment record" : "New assessment record"}</h2><p className="text-sm text-ink/70">Enter marks quickly. Press Enter in a marks box to move to the next learner.</p></div><button type="button" className="text-sm font-semibold text-leaf" onClick={() => setEditing(false)}>Close editor</button></div>
      <form onSubmit={submit} className="mt-4 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Record title"><input className={fieldClass} value={draft.title} onChange={(e) => updateDraft("title", e.target.value)} placeholder="Term 2 Mathematics test" required /></Field><Field label="Assessment kind"><select className={fieldClass} value={draft.assessmentKind} onChange={(e) => updateDraft("assessmentKind", e.target.value as AssessmentKind)}>{KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></Field><Field label="Total marks"><input className={fieldClass} type="number" min={1} max={200} value={draft.totalMarks} onChange={(e) => changeTotalMarks(Number(e.target.value))} required /></Field><Field label="Date taught"><input className={fieldClass} type="date" value={draft.taughtOn} onChange={(e) => updateDraft("taughtOn", e.target.value)} required /></Field></div>
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Grade"><select className={fieldClass} value={draft.grade} onChange={(e) => { const next = e.target.value; updateDraft("grade", next); updateDraft("subject", subjectsFor("primary", next)[0] ?? ""); }}>{grades.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Stream"><input className={fieldClass} value={draft.stream} onChange={(e) => updateDraft("stream", e.target.value)} placeholder="A" /></Field><Field label="Learning area"><select className={fieldClass} value={draft.subject} onChange={(e) => updateDraft("subject", e.target.value)}>{subjectsFor("primary", draft.grade).map((item) => <option key={item}>{item}</option>)}</select></Field></div>
        <Field label="Note" hint="Optional note about the assessment"><textarea className={`${fieldClass} min-h-20`} value={draft.note} onChange={(e) => updateDraft("note", e.target.value)} placeholder="Topics covered or follow-up…" /></Field>
        <div className="rounded-xl border border-line bg-paper p-3"><div className="flex flex-wrap items-end justify-between gap-3"><Field label="Paste class list" hint="One learner name per line. Roll numbers fill automatically."><textarea className={`${fieldClass} min-h-24`} value={classList} onChange={(e) => setClassList(e.target.value)} placeholder="Amina Wanjiku\nBrian Otieno\n…" /></Field><button type="button" className={buttonClass("ghost")} onClick={fillNames} disabled={!classList.trim()}>Fill names</button></div></div>
        <LearnerTable draft={draft} onMarksChange={handleMarksChange} onMarksKey={handleMarksKey} onChange={changeLearner} onRemove={(index) => setDraft((current) => ({ ...current, learners: current.learners.filter((_, rowIndex) => rowIndex !== index) }))} />
        <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass("ghost")} onClick={addLearner}>Add learner</button><button type="button" className={buttonClass("ghost")} onClick={addThirty}>Add 30 blank names</button><button type="submit" className={buttonClass("leaf")} disabled={busy}>{busy ? "Saving…" : draft.id ? "Update record" : "Save record"}</button>{draft.id ? <button type="button" className={buttonClass("clay")} onClick={() => void removeRecord(draft.id!)}>Delete</button> : null}</div>
      </form>
    </Panel> : null}

    <section className="no-print space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="font-display text-2xl">Saved records</h2><p className="text-sm text-ink/70">{visible.length} record{visible.length === 1 ? "" : "s"} match these filters.</p></div></div>{visible.length ? <div className="grid gap-3">{visible.map((record) => <RecordCard key={record.id} record={record} onOpen={() => { editRecord(record); }} onDelete={() => void removeRecord(record.id)} />)}</div> : <Panel><p className="font-semibold">Your marks book is ready.</p><p className="mt-1 text-sm text-ink/75">Save one assessment, then use the levels and summary to explain who needs support. You can also <Link to="/library" className="font-semibold text-leaf">open a paper you wrote and record the marks</Link>.</p></Panel>}</section>

    <Panel className="no-print"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl">Class analysis</h2><p className="mt-1 text-sm text-ink/70">Open a saved record to export its learner-level evidence.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass("ghost")} onClick={downloadCsv} disabled={!openRecord}>Download CSV</button><button type="button" className={buttonClass("ghost")} onClick={() => window.print()} disabled={!openRecord}>Print view</button></div></div>{openRecord ? <div className="mt-4 space-y-3"><p className="text-sm font-semibold text-leaf">{openRecord.title} · {openRecord.grade} · {openRecord.subject}</p><p className="text-sm text-ink/70">Copy a report slip line from one assessed learner:</p><div className="grid gap-2 sm:grid-cols-2">{openRecord.learners.filter((learner) => learner.marks != null).slice(0, 8).map((learner) => <button type="button" key={`${learner.rollNo}-${learner.learnerName}`} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-left text-sm" onClick={() => void copySlip(learner)}><span className="truncate">{learner.learnerName || `Learner ${learner.rollNo}`}</span><span className="shrink-0 font-semibold text-leaf">Copy line</span></button>)}</div></div> : null}</Panel>

    <Panel className="no-print"><h2 className="font-display text-2xl">Class summary</h2><p className="mt-1 text-sm text-ink/70">This is the evidence an HOD asks for: what was assessed, how many learners were reached, and where support is needed.</p>{summary.length ? <div className="mt-4 space-y-3">{summary.map((row) => <SummaryCard key={row.subject} row={row} />)}</div> : <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink/70">Save a record to see learning-area analysis for these filters.</p>}</Panel>

    {openRecord ? <PrintRecord record={openRecord} /> : null}
  </div>;
}

function LearnerTable({ draft, onChange, onMarksChange, onMarksKey, onRemove }: { draft: Draft; onChange: (index: number, key: keyof AssessmentScore, value: string) => void; onMarksChange: (index: number, event: ChangeEvent<HTMLInputElement>) => void; onMarksKey: (index: number, event: KeyboardEvent<HTMLInputElement>) => void; onRemove: (index: number) => void }) {
  const assessed = draft.learners.map((learner) => ({ learner, percent: percentageOf(learner.marks, draft.totalMarks) })).filter((item): item is { learner: AssessmentScore; percent: number } => item.percent != null);
  const mean = assessed.length ? Math.round(assessed.reduce((sum, item) => sum + item.percent, 0) / assessed.length) : 0;
  const highest = assessed.length ? Math.max(...assessed.map((item) => item.percent)) : 0;
  const lowest = assessed.length ? Math.min(...assessed.map((item) => item.percent)) : 0;
  const distribution = CBA_LEVELS.map((level) => ({ level, count: assessed.filter((item) => cbaLevel(item.percent).key === level.key).length }));
  return <div className="space-y-3"><div className="grid gap-2 rounded-xl bg-paper p-3 text-sm sm:grid-cols-4"><span><b>Mean</b> {mean}%</span><span><b>Highest</b> {highest}%</span><span><b>Lowest</b> {lowest}%</span><span><b>Assessed</b> {assessed.length}/{draft.learners.length}</span><div className="col-span-full flex h-3 overflow-hidden rounded-full bg-ink/10">{distribution.map(({ level, count }) => <span key={level.key} className={level.key === "exceeding" ? "bg-leaf" : level.key === "meeting" ? "bg-gold" : level.key === "approaching" ? "bg-clay" : "bg-ink/40"} style={{ width: `${assessed.length ? (count / assessed.length) * 100 : 0}%` }} title={`${level.short}: ${count}`} />)}</div></div><div className="space-y-2">{draft.learners.map((learner, index) => <div key={`${index}-${learner.rollNo}`} className="grid gap-2 rounded-xl border border-line bg-card p-3 sm:grid-cols-[5rem_minmax(0,1.4fr)_6rem_minmax(0,1fr)_auto] sm:items-end"><Field label="Roll no"><input className={fieldClass} value={learner.rollNo} onChange={(e) => onChange(index, "rollNo", e.target.value)} aria-label={`Learner ${index + 1} roll number`} /></Field><Field label="Learner name"><input id={`learner-name-${index}`} className={fieldClass} value={learner.learnerName} onChange={(e) => onChange(index, "learnerName", e.target.value)} aria-label={`Learner ${index + 1} name`} /></Field><Field label={`Marks / ${draft.totalMarks}`}><input className={fieldClass} type="number" min={0} max={draft.totalMarks} value={learner.marks ?? ""} onChange={(e) => onMarksChange(index, e)} onKeyDown={(e) => onMarksKey(index, e)} inputMode="decimal" aria-label={`Learner ${index + 1} marks`} /></Field><Field label="Note"><input className={fieldClass} value={learner.note} onChange={(e) => onChange(index, "note", e.target.value)} placeholder="Optional" aria-label={`Learner ${index + 1} note`} /></Field><div className="flex items-center justify-between gap-2 sm:block"><span className="rounded-full bg-gold/15 px-2 py-1 text-xs font-semibold text-ink">{percentageOf(learner.marks, draft.totalMarks) == null ? "Not assessed" : `${percentageOf(learner.marks, draft.totalMarks)}% · ${cbaLevel(percentageOf(learner.marks, draft.totalMarks)!).short}`}</span><button type="button" className="ml-2 text-sm font-semibold text-clay" onClick={() => onRemove(index)} aria-label={`Remove learner ${index + 1}`}>Remove</button></div></div>)}</div></div>;
}

function RecordCard({ record, onOpen, onDelete }: { record: AssessmentRecord; onOpen: () => void; onDelete: () => void }) {
  const assessed = record.learners.map((learner) => percentageOf(learner.marks, record.totalMarks)).filter((value): value is number => value != null);
  const average = assessed.length ? Math.round(assessed.reduce((sum, value) => sum + value, 0) / assessed.length) : 0;
  return <Panel><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold">{record.title}</h3><p className="text-sm text-ink/70">{record.grade}{record.stream ? ` · ${record.stream}` : ""} · {record.subject} · {record.term} · {record.year}</p><p className="mt-1 text-sm text-ink/75">{record.learners.length} learners · {assessed.length} assessed · average {average}%</p></div><div className="flex shrink-0 gap-3 text-sm font-semibold"><button type="button" className="text-leaf" onClick={onOpen}>Open</button><button type="button" className="text-clay" onClick={onDelete}>Delete</button></div></div></Panel>;
}

function SummaryCard({ row }: { row: SummaryRow }) {
  const total = Object.values(row.levels).reduce((sum, value) => sum + value, 0);
  return <div className="rounded-xl border border-line bg-paper p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{row.subject}</h3><span className="text-sm text-ink/70">{row.records} records · {row.learners} learners · {row.assessed} assessed</span></div><p className="mt-1 text-sm text-ink/75">Average {row.average}% · top score {row.top}%</p><div className="mt-2 flex h-3 overflow-hidden rounded-full bg-ink/10">{CBA_LEVELS.map((level) => <span key={level.key} className={level.key === "exceeding" ? "bg-leaf" : level.key === "meeting" ? "bg-gold" : level.key === "approaching" ? "bg-clay" : "bg-ink/40"} style={{ width: `${total ? (row.levels[level.key] / total) * 100 : 0}%` }} />)}</div><div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-ink/70">{CBA_LEVELS.map((level) => <span key={level.key}>{level.short}: {row.levels[level.key]}</span>)}</div></div>;
}

function PrintRecord({ record }: { record: AssessmentRecord }) {
  return <section className="print:block hidden" aria-label="Printable assessment record"><h1 className="font-display text-3xl">{record.title}</h1><p>{record.grade} · {record.subject} · {record.term} · {record.year} · Total marks: {record.totalMarks}</p><table className="mt-4 w-full border-collapse text-sm"><thead><tr><th className="border border-line p-2 text-left">Roll no</th><th className="border border-line p-2 text-left">Learner</th><th className="border border-line p-2 text-left">Marks</th><th className="border border-line p-2 text-left">%</th><th className="border border-line p-2 text-left">CBC level</th></tr></thead><tbody>{record.learners.map((learner) => { const percent = percentageOf(learner.marks, record.totalMarks); return <tr key={`${learner.rollNo}-${learner.learnerName}`}><td className="border border-line p-2">{learner.rollNo}</td><td className="border border-line p-2">{learner.learnerName}</td><td className="border border-line p-2">{learner.marks ?? ""}</td><td className="border border-line p-2">{percent == null ? "" : `${percent}%`}</td><td className="border border-line p-2">{percent == null ? "" : cbaLevel(percent).label}</td></tr>; })}</tbody></table></section>;
}
