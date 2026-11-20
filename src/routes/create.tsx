import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell, useDesk } from "@/components/shell";
import { AiUsageNotice } from "@/components/ai-usage-notice";
import { TopicSelector } from "@/components/topic-selector";
import { buttonClass, Field, fieldClass, Panel } from "@/components/bits";
import { generateDocumentQueued } from "@/lib/generation-queue";
import { LEVELS, PATHWAYS, PRIMARY_BANDS, bandOf, subjectsFor } from "@/lib/curriculum";
import { DEFAULT_QUESTION_COUNT, allowedCounts } from "@/lib/question-plan";
import { defaultTopicSelections } from "@/lib/curriculum-content";
import { DEFAULT_SCHEME_COLUMNS, TEXTBOOKS } from "@/lib/scheme-format";
import type { DocKind, QuestionType, SchemeTextbook, TopicSelection } from "@/lib/cbe-types";
import { assessmentGuidance, secondarySummary, SECONDARY_QUALITY_UPGRADES, subjectsForPathway, pathwaySubjects } from "@/lib/secondary-quality";

export const Route = createFileRoute("/create")({ component: IndependentCreatePage });

type BookDraft = SchemeTextbook;
const QUESTION_TYPES: { id: QuestionType; label: string }[] = [
  { id: "mcq", label: "Multiple choice" },
  { id: "short", label: "Short answer" },
  { id: "structured", label: "Structured" },
  { id: "true-false", label: "True / false" },
  { id: "fill-blank", label: "Fill in the blank" },
  { id: "practical", label: "Practical / performance" },
];

function IndependentCreatePage() {
  return <AppShell><IndependentCreateBody /></AppShell>;
}

function IndependentCreateBody() {
  const { me } = useDesk();
  const navigate = useNavigate();
  const [kind, setKind] = useState<DocKind>("notes");
  const [level, setLevel] = useState("junior");
  const [grade, setGrade] = useState("Grade 7");
  const [pathway, setPathway] = useState("STEM");
  const [subject, setSubject] = useState("Mathematics");
  const [term, setTerm] = useState("Term 3");
  const [year, setYear] = useState(2026);
  const [topics, setTopics] = useState<TopicSelection[]>(() => defaultTopicSelections("Mathematics", "Grade 7", "3.0 Measurement", "3.3 Area", "Term 3"));
  const [depth, setDepth] = useState<"full" | "summary">("full");
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(["mcq", "short", "structured"]);
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [difficulty, setDifficulty] = useState<"balanced" | "foundation" | "standard" | "stretch">("balanced");
  const [assessmentMode, setAssessmentMode] = useState<"practice" | "cumulative" | "kjsea-format">("practice");
  const [coverageGrades, setCoverageGrades] = useState<string[]>(["Grade 7"]);
  const [activeCoverageGrade, setActiveCoverageGrade] = useState("Grade 7");
  const [topicsByGrade, setTopicsByGrade] = useState<Record<string, TopicSelection[]>>({});
  const [guidance, setGuidance] = useState("");
  const [minutes, setMinutes] = useState<40 | 80>(40);
  const [books, setBooks] = useState<BookDraft[]>([]);
  const [customBook, setCustomBook] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (!me) return;
    setDepth(me.settings.defaultNoteDepth ?? "full");
    setQuestionCount(me.settings.defaultQuestionCount ?? 20);
    setQuestionTypes(me.settings.defaultQuestionTypes?.length ? me.settings.defaultQuestionTypes : ["mcq", "short", "structured"]);
  }, [me]);

  useEffect(() => {
    if (subject.toLowerCase().includes("math") && grade === "Grade 7" && term === "Term 3") {
      setBooks((current) => current.some((book) => book.title === "Smart Minds")
        ? current
        : [...current, { title: "Smart Minds", publisher: "Smart Minds", pagesFrom: "", pagesTo: "", guide: "learner" }]);
    }
  }, [subject, grade, term]);

  if (!me) return null;
  const gradeOptions = LEVELS.find((item) => item.id === level)?.grades ?? [];
  // Lower Primary and Upper Primary are different sets of areas, not the same
  // set at a different depth, so the list follows the grade already chosen.
  const baseSubjectOptions = subjectsFor(level, grade);
  const subjectOptions = level === "senior" ? subjectsForPathway(level, grade, pathway) : baseSubjectOptions;
  const maxQuestions = depth === "summary" ? 20 : 100;
  const coverageOptions = (LEVELS.find((item) => item.id === level)?.grades ?? []).filter((item) => Number(item.replace(/\D/g, "")) <= Number(grade.replace(/\D/g, "")));
  const isKjseaEligible = level === "junior" && grade === "Grade 9" && subject.toLowerCase().includes("math");
  const examTopics = assessmentMode === "practice"
    ? topics
    : coverageGrades.flatMap((sourceGrade) => (topicsByGrade[sourceGrade] ?? []).map((topic) => ({ ...topic, sourceGrade })));
  const topicSelectorGrade = kind === "exam" && assessmentMode !== "practice" ? activeCoverageGrade : grade;
  const topicSelectorValue = kind === "exam" && assessmentMode !== "practice" ? topicsByGrade[activeCoverageGrade] ?? [] : topics;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setProgress("");
    setBusy(true);
    const submittedTopics = kind === "exam" ? examTopics : topics;
    const first = submittedTopics[0] ?? topics[0];
    let result: Awaited<ReturnType<typeof generateDocumentQueued>>;
    try {
      result = await generateDocumentQueued({
        kind,
        level,
        grade,
        subject,
        strand: first?.strand ?? subject,
        substrand: first?.topic ?? subject,
        substrands: submittedTopics.flatMap((topic) => topic.subtopics.map((subtopic) => subtopic.title)),
        selectedTopics: submittedTopics,
        term,
        year,
        weekFrom: 1,
        weekTo: 1,
        lessonsPerWeek: 1,
        pathway,
        startFrom: "",
        endAt: "",
        stream: "",
        questionCount: kind === "revision" || kind === "exam" ? (assessmentMode === "kjsea-format" ? 40 : questionCount) : undefined,
        questionTypes: assessmentMode === "kjsea-format" ? ["mcq", "structured"] : questionTypes,
        questionDifficulty: difficulty,
        assessmentMode: kind === "exam" ? assessmentMode : "practice",
        depth,
        teacherGuidance: guidance,
        columns: DEFAULT_SCHEME_COLUMNS,
        textbooks: books,
        lessonMinutes: minutes,
        termStart: "",
        reflectionMode: "prompt",
        coverNote: "Independent resource created directly from selected topics; no parent scheme required.",
        assessmentMethods: ["Written exercise", "Oral questions", "Observation"],
        showApproval: false,
        safetyNote: false,
        tocPhotos: [],
        rememberColumns: false,
        learners: 0,
        boys: 0,
        girls: 0,
        hodName: "",
        preparedOn: "",
        doubleLesson: 0,
        homeworkDay: "",
        room: "",
      }, (state) => setProgress(state === "queued" ? "Queued — waiting for Grok…" : state === "processing" ? "Grok is writing this resource…" : "Saving your finished resource…"));
    } catch (err) {
      const message = err instanceof Error ? err.message : "The writing could not be queued.";
      setError(message);
      toast.error(message);
      setBusy(false);
      return;
    }
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      setBusy(false);
      return;
    }
    toast.success("Independent resource saved to your library.");
    await navigate({ to: "/library/$id", params: { id: String(result.id) } });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <header>
        <h1 className="font-display text-4xl leading-tight">Create a teaching resource</h1>
        <p className="mt-2 max-w-3xl text-ink/75">Write detailed notes, lesson plans, revision questions or a teacher-created exam paper directly from selected topics. This creates a standalone library file; a scheme is not required.</p>
      </header>
      <AiUsageNotice />
      {busy && progress ? <p role="status" className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold text-leaf">{progress}</p> : null}

      <Panel className="grid gap-3 sm:grid-cols-2">
        <Field label="Resource type">
          <select className={fieldClass} value={kind} onChange={(event) => setKind(event.target.value as DocKind)}>
            <option value="notes">Learner notes</option>
            <option value="lesson">Lesson plan</option>
            <option value="revision">Revision questions / paper</option>
            <option value="exam">Exam paper</option>
          </select>
        </Field>
        <Field label="Level">
          <select className={fieldClass} value={level} onChange={(event) => {
            const next = event.target.value;
            const grades = LEVELS.find((item) => item.id === next)?.grades ?? [];
            const subjects = subjectsFor(next, grades[0] ?? "");
            setLevel(next);
            setGrade(grades[0] ?? grade);
            setPathway(next === "senior" ? "STEM" : "");
            setTopics([]);
            setAssessmentMode("practice");
            setCoverageGrades([grades[0] ?? grade]);
            setActiveCoverageGrade(grades[0] ?? grade);
            if (!subjects.includes(subject)) setSubject(subjects[0] ?? subject);
          }}>
            {LEVELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </Field>
        <Field label="Grade" hint={level === "primary" ? "Primary is grouped the way KICD publishes it: Lower Primary Grade 1 to 3, then Upper Primary Grade 4 to 6." : undefined}>
          <select className={fieldClass} value={grade} onChange={(event) => {
            const next = event.target.value;
            setGrade(next);
            setTopics([]);
            const allowed = subjectsFor(level, next);
            if (!allowed.includes(subject)) setSubject(allowed[0] ?? subject);
            if (assessmentMode !== "practice") {
              setCoverageGrades([next]);
              setActiveCoverageGrade(next);
            }
            if (next !== "Grade 9" || !subject.toLowerCase().includes("math")) setAssessmentMode("practice");
          }}>
            {level === "primary"
              ? PRIMARY_BANDS.map((band) => (
                  <optgroup key={band.id} label={`${band.label} · ${band.range}`}>
                    {band.grades.map((item) => <option key={item}>{item}</option>)}
                  </optgroup>
                ))
              : gradeOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
          {bandOf(grade) ? (
            <p className="mt-1 text-xs text-ink/70">
              {`${bandOf(grade)!.label} · ${bandOf(grade)!.range}`}: {subjectOptions.length} learning areas in this band. {bandOf(grade)!.blurb}
            </p>
          ) : null}
        </Field>
        {level === "senior" ? <Field label="Senior School pathway" hint="This is a planning filter, not an official pathway allocation. Confirm your school's approved subject combination.">
          <select className={fieldClass} value={pathway} onChange={(event) => {
            const next = event.target.value;
            setPathway(next);
            const nextSubjects = subjectsForPathway(level, grade, next);
            if (!nextSubjects.includes(subject)) { setSubject(nextSubjects[0] ?? baseSubjectOptions[0] ?? subject); setTopics([]); }
          }}>
            {PATHWAYS.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field> : null}
        <Field label="Learning area">
          <select className={fieldClass} value={subjectOptions.includes(subject) ? subject : ""} onChange={(event) => { if (event.target.value) { setSubject(event.target.value); setTopics([]); } }}>
            {!subjectOptions.includes(subject) ? <option value="">Custom learning area</option> : null}
            {subjectOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Or type a learning area">
          <input className={fieldClass} value={subject} onChange={(event) => { setSubject(event.target.value); setTopics([]); }} required />
        </Field>
        <Field label="Term">
          <select className={fieldClass} value={term} onChange={(event) => setTerm(event.target.value)}>
            {["Term 1", "Term 2", "Term 3"].map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <input className={fieldClass} type="number" min={2024} max={2035} value={year} onChange={(event) => setYear(Number(event.target.value))} />
        </Field>
        {kind === "exam" ? <Field label="Exam format" hint="Generated papers are practice materials, never official KNEC papers.">
          <select className={fieldClass} value={assessmentMode} onChange={(event) => {
            const next = event.target.value as typeof assessmentMode;
            setAssessmentMode(next);
            if (next === "kjsea-format") {
              setCoverageGrades(["Grade 7", "Grade 8", "Grade 9"]);
              setActiveCoverageGrade("Grade 7");
              setQuestionCount(40);
              setDepth("full");
            } else if (next === "cumulative") {
              setCoverageGrades([grade]);
              setActiveCoverageGrade(grade);
            }
          }}>
            <option value="practice">School practice exam</option>
            {level === "junior" || level === "senior" ? <option value="cumulative">Cumulative / mixed-grade school exam</option> : null}
            {isKjseaEligible ? <option value="kjsea-format">Grade 9 Mathematics · KJSEA-format simulation</option> : null}
          </select>
        </Field> : null}
      </Panel>

        {kind === "exam" && assessmentMode !== "practice" ? <Panel className="space-y-3">
        <div>
          <h2 className="font-display text-2xl">Choose curriculum coverage by source grade</h2>
          <p className="text-sm text-ink/75">Select only the source-grade topics already taught. No national grade or strand percentages are assumed; choose and verify coverage from the current KICD designs.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {coverageOptions.map((item) => <label key={item} className="flex min-h-10 items-center gap-2 rounded-lg bg-paper px-3 text-sm font-semibold">
            <input type="checkbox" checked={coverageGrades.includes(item)} onChange={() => {
              setCoverageGrades((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item].sort());
              setActiveCoverageGrade(item);
            }} />Include {item}
          </label>)}
        </div>
        {coverageGrades.length ? <Field label="Edit topics for grade">
          <select className={fieldClass} value={activeCoverageGrade} onChange={(event) => setActiveCoverageGrade(event.target.value)}>
            {coverageGrades.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field> : <p className="text-sm text-clay">Select at least one grade to continue.</p>}
        <p className="text-xs text-ink/65">The topic bank is editable and is a starting point. Add missing local syllabus topics and check exact outcomes against the KICD design before using the paper.</p>
      </Panel> : null}

      <TopicSelector
        subject={subject}
        grade={topicSelectorGrade}
        term={term}
        value={topicSelectorValue}
        onChange={(next) => kind === "exam" && assessmentMode !== "practice"
          ? setTopicsByGrade((current) => ({ ...current, [activeCoverageGrade]: next }))
          : setTopics(next)}
      />

      <Panel className="space-y-3">
        <h2 className="font-display text-2xl">Books and page references</h2>
        <p className="text-sm text-ink/75">Selected topic pages will be used per section or lesson when available. Add another learner’s book or a teacher’s guide if useful.</p>
        <div className="flex flex-wrap gap-2">{TEXTBOOKS.map((book) => <button key={book.id} type="button" className={buttonClass("ghost")} onClick={() => setBooks((current) => current.some((item) => item.title === book.title) ? current : [...current, { title: book.title, publisher: book.publisher, pagesFrom: "", pagesTo: "", guide: book.id.endsWith("-tg") ? "teacher" : "learner" }])}>{book.title}</button>)}</div>
        <div className="flex flex-wrap gap-2">
          <input className={`${fieldClass} max-w-sm`} value={customBook} onChange={(event) => setCustomBook(event.target.value)} placeholder="Add a missing book or teacher’s guide" />
          <button type="button" className={buttonClass("ink")} onClick={() => {
            if (customBook.trim().length < 2) return;
            setBooks((current) => [...current, { title: customBook.trim(), publisher: "", pagesFrom: "", pagesTo: "", guide: "learner" }]);
            setCustomBook("");
          }}>Add book</button>
        </div>
        {books.map((book, index) => <div key={`${book.title}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper p-3 text-sm"><span className="font-semibold">{book.title}{book.publisher ? ` · ${book.publisher}` : ""}</span><button type="button" className="font-semibold text-clay" onClick={() => setBooks((current) => current.filter((_, position) => position !== index))}>Remove</button></div>)}
      </Panel>

      <Panel className="grid gap-3 sm:grid-cols-2">
        <Field label="Length">
          <select className={fieldClass} value={depth} onChange={(event) => { const next = event.target.value === "summary" ? "summary" : "full"; setDepth(next); if (kind === "revision" || kind === "exam") setQuestionCount(next === "summary" ? 8 : 20); }}>
            <option value="full">Full, detailed teaching material</option>
            <option value="summary">Short summary (only when requested)</option>
          </select>
        </Field>
        {kind === "lesson" ? <Field label="Lesson duration"><select className={fieldClass} value={minutes} onChange={(event) => setMinutes(event.target.value === "80" ? 80 : 40)}><option value={40}>40 minutes</option><option value={80}>80 minutes</option></select></Field> : null}
        {kind === "revision" || kind === "exam" ? (
          <>
            {assessmentMode === "kjsea-format" ? <p className="rounded-xl bg-paper p-3 text-sm"><span className="font-semibold">2026 KJSEA Mathematics layout:</span> 2 hours, 100 marks. Section A is 20 one-mark multiple-choice items. Section B is questions 21–40 in five tasks (20, 10, 23, 19 and 8 marks). This is school practice, not an official paper.</p> : <Field label="Number of questions" hint="A normal end-of-term paper runs 45 or more; a revision booklet goes to 100. Long papers are written in parts and merged, so nothing comes back short."><select className={fieldClass} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{allowedCounts(depth).filter((count) => count <= maxQuestions).map((count) => <option key={count} value={count}>{count} questions{count === DEFAULT_QUESTION_COUNT ? " (typical paper)" : ""}</option>)}</select><p className="mt-1 text-xs text-ink/65">{assessmentGuidance(level, grade, questionCount)}</p></Field>}
            {assessmentMode === "kjsea-format" ? null : <Field label="Difficulty mix"><select className={fieldClass} value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="balanced">Balanced</option><option value="foundation">More foundation practice</option><option value="standard">Standard</option><option value="stretch">More challenging</option></select></Field>}
            {assessmentMode === "kjsea-format" ? null : <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold">Question types (choose several)</legend>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {QUESTION_TYPES.map((item) => <label key={item.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={questionTypes.includes(item.id)} onChange={() => setQuestionTypes((current) => current.includes(item.id) ? current.filter((type) => type !== item.id) : [...current, item.id])} />{item.label}</label>)}
              </div>
            </fieldset>}
          </>
        ) : null}
        <Field label="Teacher guidance" hint="Optional: local examples, learner needs, specific concepts, or a question focus.">
          <textarea className={fieldClass} rows={4} maxLength={500} value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Example: include money examples in Kenyan shillings; scaffold vocabulary; use the local market context." />
        </Field>
      </Panel>
      {level === "junior" || level === "senior" ? <Panel className="border-leaf/30 bg-leaf/5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-leaf">Secondary quality guardrails</p><h2 className="font-display text-2xl">{secondarySummary(level, grade, subject, pathway)}</h2></div><span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold">{level === "senior" ? pathwaySubjects(pathway).length : baseSubjectOptions.length} pathway checks</span></div>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{SECONDARY_QUALITY_UPGRADES.slice(0, 6).map((item) => <li key={item} className="rounded-lg bg-card px-3 py-2">✓ {item}</li>)}</ul>
      </Panel> : null}

      {error ? <p role="alert" className="rounded-xl border border-clay bg-card px-4 py-3 text-sm text-clay">{error}</p> : null}
      <button type="submit" className={buttonClass("leaf")} disabled={busy || ((kind === "revision" || kind === "exam") && questionTypes.length === 0) || (kind === "exam" && assessmentMode !== "practice" && examTopics.length === 0)}>{busy ? "Writing and saving…" : kind === "exam" ? "Generate exam paper" : "Write standalone resource"}</button>
    </form>
  );
}
