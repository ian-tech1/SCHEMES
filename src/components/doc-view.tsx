import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { GenerationProvenance, LessonBody, LessonPlanPackBody, NotesBody, RevisionBody, SchemeBody, SchemeLesson } from "@/lib/cbe-types";
import { bookCoverLine, columnLabel, columnsOrDefault, lessonCell, SCHEME_COLUMN_WEIGHTS, strandTrail, termWeekLabel } from "@/lib/scheme-format";
import { useLessonProgress } from "@/lib/progress";
import { answerLabel, letteredOptions, orderByNumber, planSections } from "@/lib/question-plan";

type ViewDoc = {
  kind: string;
  title: string;
  grade: string;
  subject: string;
  strand: string;
  substrand: string;
  term: string;
  year: number;
  stream: string;
  schoolName: string;
  teacherName: string;
  level: string;
  pathway: string;
  startFrom: string;
  endAt: string;
  weekFrom: number;
  weekTo: number;
  lessonsPerWeek?: number;
  phone?: string;
  id?: number;
  body: unknown;
  redacted?: boolean;
  lockedExtra?: number;
};

function asScheme(body: unknown): SchemeBody {
  const value = (body ?? {}) as SchemeBody;
  return {
    overview: value.overview ?? "",
    csl: value.csl ?? "",
    qualityReport: value.qualityReport,
    weeks: value.weeks ?? [],
    lessons: value.lessons ?? [],
    topicSelections: value.topicSelections ?? [],
    columns: columnsOrDefault(value.columns),
    textbooks: value.textbooks ?? [],
    bookLine: value.bookLine ?? "",
    termStart: value.termStart ?? "",
    halfTermStart: value.halfTermStart ?? "",
    halfTermEnd: value.halfTermEnd ?? "",
    lessonMinutes: value.lessonMinutes ?? 40,
    reflectionMode: value.reflectionMode === "prompt" ? "prompt" : "blank",
    coverNote: value.coverNote ?? "",
    safetyNote: value.safetyNote ?? "",
    showApproval: value.showApproval !== false,
    tocPhotos: value.tocPhotos ?? [],
    learners: value.learners ?? 0,
    boys: value.boys ?? 0,
    girls: value.girls ?? 0,
    hodName: value.hodName ?? "",
    preparedOn: value.preparedOn ?? "",
    doubleLesson: value.doubleLesson ?? 0,
    homeworkDay: value.homeworkDay ?? "",
    room: value.room ?? "",
  };
}

function asLesson(body: unknown): LessonBody {
  return (body ?? {}) as LessonBody;
}

function isLessonPlanPack(body: unknown): body is LessonPlanPackBody {
  return Boolean(body && typeof body === "object" && Array.isArray((body as LessonPlanPackBody).lessonPlans));
}

function asNotes(body: unknown): NotesBody {
  return (body ?? {}) as NotesBody;
}

function asPaper(body: unknown): RevisionBody {
  return (body ?? {}) as RevisionBody;
}

function provenance(body: unknown): GenerationProvenance | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as { generationProvenance?: GenerationProvenance }).generationProvenance;
  return value && typeof value === "object" ? value : undefined;
}

export function DocView({ doc }: { doc: ViewDoc }) {
  const [hideMarking, setHideMarking] = useState(false);
  const beyond = doc.level === "primary" ? "Beyond the classroom" : "Community service learning";

  return (
    <article className="space-y-4">
      <header className="border-b border-gold pb-4">
        <p className="text-sm font-semibold tracking-wide text-leaf">
          {doc.schoolName || "School"} · {doc.term} {doc.year}
        </p>
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-ink/80">
          {doc.grade}
          {doc.stream ? ` ${doc.stream}` : ""} · {doc.subject}
          {doc.pathway ? ` · ${doc.pathway}` : ""}
        </p>
        <p className="text-sm text-ink/70">
          {doc.strand} — {doc.substrand}. Teacher: {doc.teacherName || "Teacher"}. Weeks {doc.weekFrom}–{doc.weekTo}.
        </p>
        <p className="mt-2 text-sm text-ink/80">
          Starts: {doc.startFrom || "the sub-strand"}. Ends: {doc.endAt || "the sub-strand"}.
        </p>
      </header>

      <GenerationNotice value={provenance(doc.body)} />

      {doc.kind === "scheme" ? <SchemeView doc={doc} body={asScheme(doc.body)} beyond={beyond} /> : null}
      {doc.kind === "lesson" ? isLessonPlanPack(doc.body) ? <LessonPackView body={doc.body} /> : <LessonView body={asLesson(doc.body)} /> : null}
      {doc.kind === "notes" ? <NotesView body={asNotes(doc.body)} /> : null}
      {doc.kind === "revision" || doc.kind === "exam" ? (
        <PaperView body={asPaper(doc.body)} hideMarking={hideMarking} onToggle={() => setHideMarking((v) => !v)} />
      ) : null}

      {doc.redacted && (doc.lockedExtra ?? 0) > 0 ? (
        <p className="rounded-xl border border-gold bg-paper px-4 py-3 text-sm">
          {doc.lockedExtra} more {doc.kind === "scheme" ? "weeks are" : "parts are"} waiting behind the till payment.
        </p>
      ) : null}
    </article>
  );
}

function GenerationNotice({ value }: { value?: GenerationProvenance }) {
  if (!value) return null;
  const local = value.mode === "web-assisted-local" || value.mode === "local-template" || value.mode === "mixed";
  return (
    <aside className={`rounded-xl border px-4 py-3 text-sm ${local ? "border-gold bg-gold/10" : "border-leaf/30 bg-leaf/5"}`} aria-label="Generation source and review information">
      <p className="font-semibold text-ink">{value.label}</p>
      <p className="mt-1 text-ink/80">{value.notice}</p>
      {value.sources.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold">Sources and reuse terms ({value.sources.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {value.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-leaf underline">{source.title}</a>
                <span className="text-ink/70"> — {source.license}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {value.licenseNotice ? <p className="mt-2 border-t border-line pt-2 text-ink/80">{value.licenseNotice}</p> : null}
    </aside>
  );
}

function rowsFor(doc: ViewDoc, body: SchemeBody): SchemeLesson[] {
  if (body.lessons?.length) return body.lessons;
  const count = Math.max(1, doc.lessonsPerWeek || 1);
  return (body.weeks ?? []).flatMap((week) =>
    Array.from({ length: count }, (_, index) => ({
      week: week.week,
      lesson: index + 1,
      dateLabel: "",
      strand: doc.strand,
      substrand: week.lessonHints[index] || doc.substrand,
      outcomes: week.outcomes,
      experiences: week.experiences,
      inquiry: week.inquiry,
      resources: week.resources,
      assessment: week.assessment,
      reflection: "",
      competencies: week.competencies,
      values: week.values,
      pcis: week.pcis,
      homework: index + 1 === count ? week.homework : "",
      minutes: body.lessonMinutes || 40,
    })),
  );
}

function readyKey(docId: number | undefined) {
  return `ian-ready:${docId ?? "x"}`;
}
function SchemeView({ doc, body, beyond }: { doc: ViewDoc; body: SchemeBody; beyond: string }) {
  const rows = rowsFor(doc, body);
  const columns = body.columns.length ? body.columns : columnsOrDefault(body.columns);
  const columnPixels = columns.map((column) => (SCHEME_COLUMN_WEIGHTS[column] ?? 8) * 9);
  const tablePixels = columnPixels.reduce((sum, width) => sum + width, 0);
  // Taught ticks and reflections live on the teacher's account (with a local
  // cache for offline use), so they follow the teacher to another device.
  const progress = useLessonProgress(
    doc.id,
    rows.map((row) => ({ week: row.week, lesson: row.lesson })),
    !doc.redacted,
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(localStorage.getItem(readyKey(doc.id)) === "1");
  }, [doc.id]);
  const done = progress.taughtCount;
  const weekNums = [...new Set(rows.map((row) => row.week))];
  const books = bookCoverLine(body.textbooks);
  const selectedLinks = [...new Set(rows.flatMap((row) => row.outcomes).filter((item) => /^\[(Core competency|Value|PCI)\]/.test(item)))];
  const banner = `SCHEME OF WORK – ${doc.subject.toUpperCase()} ${doc.grade.toUpperCase()} | ${doc.term.toUpperCase()} | ${(body.bookLine || doc.subject).toUpperCase()}`;
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-line">
        <div className="bg-[#163254] px-3 py-3 text-[#f4efe4]">
          <p className="text-sm font-semibold leading-snug">{banner}</p>
          <p className="mt-2 text-xs sm:text-sm">
            School: {doc.schoolName || "—"} · Teacher: {doc.teacherName || "—"} · Year: {doc.year} · {termWeekLabel(doc.term, doc.weekFrom, doc.weekTo)}
            {doc.stream ? ` · ${doc.stream}` : ""}
            {body.room ? ` · Room ${body.room}` : ""}
          </p>
        </div>
        <div className="space-y-2 bg-card px-3 py-3 text-sm">
          <p>
            {body.doubleLesson
              ? `Lesson ${body.doubleLesson} is a double (80 min). The others are 40 min.`
              : `${body.lessonMinutes || 40} minutes a lesson.`}
            {" "}{doc.lessonsPerWeek || rows.filter((row) => row.week === rows[0]?.week).length} lessons each week.
            {body.learners ? ` ${body.learners} learners.` : ""}
            {body.boys || body.girls ? ` Boys ${body.boys || 0}, girls ${body.girls || 0}.` : ""}
            {body.homeworkDay ? ` Homework on ${body.homeworkDay}.` : ""}
            {body.preparedOn ? ` Prepared ${body.preparedOn}.` : ""}
            {body.halfTermStart ? ` Half term ${body.halfTermStart}${body.halfTermEnd ? ` to ${body.halfTermEnd}` : ""}.` : ""}
          </p>
          {body.coverNote ? <p>{body.coverNote}</p> : null}
          {books ? <p><span className="font-semibold">Textbooks. </span>{books}</p> : null}
          <button
            type="button"
            className="no-print text-sm font-semibold text-leaf"
            onClick={() => {
              const lines = rows.map((row) => `Week ${row.week} lesson ${row.lesson}: ${row.strand} — ${row.substrand}`);
              void navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success("Week outline copied."));
            }}
          >
            Copy the week outline
          </button>
          <p className="no-print text-ink/70">
            {done} of {rows.length} lessons marked as taught. {rows.length - done} still to teach.
            {progress.synced ? " Saved on your account." : " Saved on this device; it will sync when the network returns."}
          </p>
          <div className="no-print flex flex-wrap gap-2">
            {weekNums.map((week) => {
              const inWeek = rows.filter((row) => row.week === week);
              const ticked = inWeek.filter((row) => progress.get(row.week, row.lesson).taught).length;
              return (
                <span key={week} className="rounded-full bg-paper px-2 py-1 text-xs font-semibold">
                  Week {week}: {ticked}/{inWeek.length}
                </span>
              );
            })}
            <button
              type="button"
              className="rounded-full bg-ink px-2 py-1 text-xs font-semibold text-paper"
              onClick={() => {
                const next = !ready;
                localStorage.setItem(readyKey(doc.id), next ? "1" : "0");
                setReady(next);
              }}
            >
              {ready ? "Ready for the HOD" : "Mark ready for the HOD"}
            </button>
            <button
              type="button"
              className="rounded-full border border-line px-2 py-1 text-xs font-semibold"
              onClick={() => {
                const text = [
                  banner,
                  `${doc.schoolName} · ${doc.teacherName} · ${doc.year}`,
                  ...rows.map((row) => columns.map((column) => lessonCell(row, column).replaceAll("\n", " ")).join(" | ")),
                ].join("\n");
                void navigator.clipboard.writeText(text);
              }}
            >
              Copy table as text
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="border-collapse text-left text-xs" style={{ tableLayout: "fixed", width: `${tablePixels}px`, minWidth: `${tablePixels}px` }}>
            <colgroup>{columnPixels.map((width, index) => <col key={columns[index]} style={{ width: `${width}px` }} />)}</colgroup>
            <thead>
              <tr className="bg-[#163254] text-[#f4efe4]">
                {columns.map((column) => (
                  <th key={column} className="border border-[#0f2340] px-2 py-2 font-semibold">{columnLabel(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.week}-${row.lesson}`} className={`align-top ${row.week % 2 === 0 ? "bg-[#e7f0e8]" : "bg-card"}`}>
                  {columns.map((column) => (
                    <td key={column} className="border border-line px-2 py-2 whitespace-pre-wrap break-words align-top">
                      {column === "lsn" ? (
                        <span className="flex items-start gap-1">
                          <input
                            className="no-print mt-0.5"
                            type="checkbox"
                            checked={progress.get(row.week, row.lesson).taught}
                            onChange={() => progress.toggle(row.week, row.lesson)}
                            aria-label={`Mark week ${row.week} lesson ${row.lesson} as taught`}
                          />
                          <span>
                            {row.lesson}
                            {row.minutes === 80 ? " · 80 min" : ""}
                          </span>
                        </span>
                      ) : column === "reflection" ? (
                        <>
                          <textarea
                            className="no-print min-h-16 w-full rounded-lg border border-line bg-paper p-1 text-xs"
                            value={progress.get(row.week, row.lesson).reflection || row.reflection}
                            placeholder={row.reflection || "Write the reflection after the lesson"}
                            maxLength={240}
                            onChange={(event) => progress.setReflection(row.week, row.lesson, event.target.value)}
                          />
                          <span className="hidden print:inline">{progress.get(row.week, row.lesson).reflection || row.reflection}</span>
                        </>
                      ) : (
                        lessonCell(row, column)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-3 py-2 text-xs text-ink/70">
          {strandTrail(rows)}
        </p>
      </section>
      <QualityPanel report={body.qualityReport} />
      <p>{body.overview}</p>
      {body.topicSelections?.length ? <p className="rounded-xl bg-paper px-4 py-3 text-sm"><span className="font-semibold">Selected topic coverage. </span>{body.topicSelections.map((topic) => `${topic.topic}${topic.subtopics.length ? `: ${topic.subtopics.map((child) => child.title).join(", ")}` : ""}${topic.pagesFrom ? ` (pp. ${topic.pagesFrom}–${topic.pagesTo || topic.pagesFrom})` : ""}`).join(" · ")}</p> : null}
      {selectedLinks.length ? <p className="rounded-xl bg-paper px-4 py-3 text-sm"><span className="font-semibold">Optional curriculum links selected for outcomes. </span>{selectedLinks.join(" · ")}</p> : null}
      {body.csl ? (
        <p className="rounded-xl bg-paper px-4 py-3 text-sm">
          <span className="font-semibold">{beyond}. </span>
          {body.csl}
        </p>
      ) : null}
      {body.safetyNote ? <p className="rounded-xl bg-paper px-4 py-3 text-sm">{body.safetyNote}</p> : null}
      {body.tocPhotos?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {body.tocPhotos.map((photo) => (
            <figure key={photo.caption + photo.dataUrl.slice(0, 32)} className="overflow-hidden rounded-xl border border-line bg-card">
              <img src={photo.dataUrl} alt={photo.caption} className="max-h-80 w-full object-contain bg-paper" />
              <figcaption className="px-3 py-2 text-sm">{photo.caption}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      {body.showApproval ? (
        <p className="text-sm">
          Teacher: ____________________ &nbsp; HOD{body.hodName ? ` (${body.hodName})` : ""}: ____________________ &nbsp; Deputy / Head: ____________________ &nbsp; Date: __________
        </p>
      ) : null}
    </div>
  );
}

function LessonView({ body, showQuality = true }: { body: LessonBody; showQuality?: boolean }) {
  const planned = (body.steps ?? []).reduce((sum, step) => sum + (step.minutes || 0), 0);
  const expected = Number.parseInt(body.duration, 10) || 40;
  return (
    <div className="space-y-4">
      <p className="font-semibold">
        {body.weekLabel} · {body.duration || "40 minutes"}
        <span className="ml-2 font-normal text-ink/60">Steps add up to {planned} min{planned === expected ? "" : ` (plan says ${expected})`}.</span>
      </p>
      {showQuality ? <QualityPanel report={body.qualityReport} /> : null}
      {body.priorKnowledge ? <p className="text-sm"><span className="font-semibold">Prior knowledge. </span>{body.priorKnowledge}</p> : null}
      <Block title="Specific learning outcomes" items={body.outcomes ?? []} />
      {body.successCriteria?.length ? <Block title="Success criteria" items={body.successCriteria} /> : null}
      <button
        type="button"
        className="no-print text-sm font-semibold text-leaf"
        onClick={() => void navigator.clipboard.writeText((body.outcomes ?? []).map((item) => `• ${item}`).join("\n"))}
      >
        Copy outcomes
      </button>
      <Block title="Key inquiry questions" items={body.inquiry ?? []} />
      <Block title="Resources" items={body.resources ?? []} />
      {body.competencies?.length ? <Block title="Core competencies" items={body.competencies} /> : null}
      {body.values?.length ? <Block title="Values" items={body.values} /> : null}
      {body.pcis?.length ? <Block title="Pertinent and contemporary issues" items={body.pcis} /> : null}
      <ol className="space-y-3">
        {(body.steps ?? []).map((step) => (
          <li key={step.phase} className="rounded-xl border border-line bg-card p-4">
            <p className="font-semibold">
              {step.phase} <span className="font-normal text-ink/70">· {step.minutes} min</span>
            </p>
            <p className="mt-1 text-sm">
              <span className="font-semibold">Teacher. </span>
              {step.teacher}
            </p>
            <p className="text-sm">
              <span className="font-semibold">Learners. </span>
              {step.learners}
            </p>
          </li>
        ))}
      </ol>
      {body.support ? <p className="text-sm"><span className="font-semibold">Support. </span>{body.support}</p> : null}
      {body.extension ? <p className="text-sm"><span className="font-semibold">Extension. </span>{body.extension}</p> : null}
      {body.assessment ? <p className="text-sm"><span className="font-semibold">Assessment. </span>{body.assessment}</p> : null}
      {body.rubric?.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {body.rubric.map((row) => (
            <li key={row.level} className="rounded-xl bg-paper px-3 py-2 text-sm">
              <span className="font-semibold">{row.level}. </span>
              {row.descriptor}
            </li>
          ))}
        </ul>
      ) : null}
      {body.homework ? <p className="text-sm"><span className="font-semibold">Homework. </span>{body.homework}</p> : null}
      {body.reflection ? <p className="text-sm"><span className="font-semibold">Reflection. </span>{body.reflection}</p> : null}
    </div>
  );
}

function LessonPackView({ body }: { body: LessonPlanPackBody }) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-paper p-4 text-sm">{body.summary}</p>
      <QualityPanel report={body.qualityReport} />
      <div className="space-y-2">
        {body.lessonPlans.map((item) => <details key={`${item.week}-${item.lesson}`} className="rounded-xl border border-line bg-card p-3">
          <summary className="cursor-pointer font-semibold">Week {item.week} · Lesson {item.lesson} · {item.body.weekLabel}</summary>
          <div className="mt-4"><LessonView body={item.body} showQuality={false} /></div>
        </details>)}
      </div>
    </div>
  );
}

function NotesView({ body }: { body: NotesBody }) {
  const full = (body.sections?.length ?? 0) >= 5;
  const words = [body.summary, ...(body.sections ?? []).flatMap((section) => [...(section.paragraphs ?? []), ...(section.examples ?? [])])].join(" ").split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 130));
  return (
    <article className="space-y-5">
      <p className="text-sm font-semibold text-leaf">
        {full ? "Textbook chapter" : "Short notes"} · {body.sections?.length ?? 0} sections · {body.vocabulary?.length ?? 0} words · about {words} words · {minutes} min to read
      </p>
      <p className="text-sm text-ink/70">Read the contents first, then each definition and its worked examples. Do the exercise before you open the answer page.</p>
      <p className="text-lg leading-relaxed">{body.summary}</p>
      {body.contents?.length ? (
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="font-display text-2xl">Contents</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {body.contents.map((item) => (
              <li key={`${item.substrand}-${item.page}`} className="flex justify-between gap-3">
                <span>{item.strand} · {item.substrand}</span>
                <span className="tabular-nums text-ink/60">{item.page}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {body.objectives?.length ? (
        <section className="rounded-xl border border-line bg-paper p-4">
          <h2 className="font-display text-2xl">By the end of this chapter</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">{body.objectives.map((item) => <li key={item}>{item}</li>)}</ol>
        </section>
      ) : null}
      {body.prerequisite ? (
        <p><span className="font-semibold">Before you start. </span>{body.prerequisite}</p>
      ) : null}
      {body.vocabulary?.length ? (
        <section>
          <h2 className="font-display text-2xl">Words to know</h2>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {body.vocabulary.map((item) => (
              <div key={item.term} className="rounded-xl border border-line bg-card px-3 py-2">
                <dt className="font-semibold">{item.term}</dt>
                <dd className="text-sm text-ink/80">{item.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {(body.sections ?? []).map((section) => (
        <section key={section.heading}>
          <h2 className="font-display text-2xl">{section.heading}</h2>
          {section.paragraphs?.map((para) => (
            <p key={para} className="mt-2 leading-relaxed">{para}</p>
          ))}
          {section.examples?.map((example, index) => (
            <div key={example} className="mt-3 rounded-xl border border-leaf/30 bg-paper px-3 py-2 text-sm leading-relaxed whitespace-pre-line">
              <p className="font-semibold text-leaf">{section.examples.length > 1 ? `Worked example ${index + 1}` : "Worked example"}</p>
              <p className="mt-1">{example}</p>
            </div>
          ))}
        </section>
      ))}
      <Block title="Exercise" items={(body.tryThis ?? []).map((item, index) => `${index + 1}. ${item.replace(/^\d+\.\s*/, "")}`)} />
      {body.answerKey?.length ? <details className="rounded-xl border border-line bg-paper p-4">
        <summary className="cursor-pointer font-semibold">Answers to the exercise</summary>
        <p className="mt-2 text-xs text-ink/70">{body.answerKeyNote || "Model solutions. Check every figure against the approved text before marking."}</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5">{body.answerKey.map((answer, index) => <li key={`${index}-${answer.slice(0, 24)}`} className="whitespace-pre-line">{answer}</li>)}</ol>
      </details> : null}
      {body.mistakes?.length ? <Block title="Common mistakes" items={body.mistakes} /> : null}
      <Block title="Remember" items={body.remember ?? []} />
    </article>
  );
}

function PaperView({
  body,
  hideMarking,
  onToggle,
}: {
  body: RevisionBody;
  hideMarking: boolean;
  onToggle: () => void;
}) {
  const questions = useMemo(() => orderByNumber(body.questions ?? []), [body.questions]);
  const sections = useMemo(() => planSections(questions), [questions]);
  const total = questions.reduce((sum, q) => sum + (q.marks || 0), 0);
  const [learnerCopy, setLearnerCopy] = useState(false);
  // A teacher printing for the class wants the learners' paper with no answers
  // anywhere on it; a teacher marking wants the answers beside every item.
  const showAnswers = !learnerCopy && !hideMarking;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{body.instructions}</p>
        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLearnerCopy((current) => !current)}
            className={`min-h-11 rounded-xl border px-3 text-sm font-semibold ${learnerCopy ? "border-leaf bg-leaf/10 text-leaf" : "border-line bg-card"}`}
            aria-pressed={learnerCopy}
          >
            {learnerCopy ? "Learner copy on" : "Learner copy"}
          </button>
          <button type="button" onClick={onToggle} className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm font-semibold">
            {hideMarking ? "Show marking scheme" : "Hide marking scheme"}
          </button>
        </div>
      </div>

      <p className="rounded-xl border border-line bg-paper px-3 py-2 text-sm font-semibold tabular-nums">
        {questions.length} questions · {body.totalMarks ?? total} marks
        {body.timeMinutes ? ` · about ${body.timeMinutes} minutes` : ""}
        {sections.length > 1 ? ` · ${sections.length} sections` : ""}
        {learnerCopy ? " · answers hidden" : ""}
      </p>

      {body.coverageGrades?.length ? <p className="rounded-lg bg-paper px-3 py-2 text-sm"><span className="font-semibold">Selected source-grade coverage. </span>{body.coverageGrades.join(", ")}</p> : null}
      {body.qualityNotice ? <p className="rounded-lg border border-gold bg-paper px-3 py-2 text-sm">{body.qualityNotice}</p> : null}

      {sections.map((section) => {
        const group = questions.filter((question) => section.types.includes((question.type || "short") as typeof section.types[number]));
        if (!group.length) return null;
        return (
          <section key={section.name} className="space-y-3">
            <header className="rounded-xl border border-line bg-card px-3 py-2">
              <h2 className="font-display text-xl">{section.name}</h2>
              <p className="text-sm text-ink/75">{section.instruction}</p>
              <p className="text-xs font-semibold text-ink/70 tabular-nums">
                Questions {section.from}–{section.to} · {group.length} question{group.length === 1 ? "" : "s"} · {section.marks} mark{section.marks === 1 ? "" : "s"}
              </p>
            </header>
            {group.map((q) => (
              <Question key={q.number} q={q} hideMarking={!showAnswers} />
            ))}
          </section>
        );
      })}

      {showAnswers ? (
        <section className="space-y-2 border-t border-line pt-3">
          <h2 className="font-display text-2xl">Answer sheet</h2>
          <p className="text-sm text-ink/70">For the teacher or the monitor marking this paper. Turn on <span className="font-semibold">Learner copy</span> to print without answers.</p>
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {questions.map((q) => (
              <li key={`ans-${q.number}`} className="rounded-lg bg-paper px-2 py-1">
                <span className="font-semibold tabular-nums">{q.number}. </span>{q.answer || "—"}
                {q.marks > 1 ? <span className="ml-1 text-xs text-ink/60">({q.marks} marks)</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function Question({
  q,
  hideMarking,
}: {
  q: RevisionBody["questions"][number];
  hideMarking: boolean;
}) {
  return (
    <article className="rounded-xl border border-line bg-card p-4">
      <p className="font-semibold">
        {q.number}. <span className="font-normal whitespace-pre-line">{q.prompt}</span>
      </p>
      <p className="text-sm text-ink/60">{q.marks} mark{q.marks === 1 ? "" : "s"} · {q.type}</p>
      {q.options?.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {letteredOptions(q.options).map((option, index) => (
            <li key={`${option}-${index}`} className="tabular-nums">{option}</li>
          ))}
        </ul>
      ) : null}
      {!hideMarking && (q.answer || q.marking) ? (
        <p className="mt-2 whitespace-pre-line rounded-lg bg-paper px-3 py-2 text-sm">
          <span className="font-semibold">Answer. </span>
          {answerLabel(q.answer) || "See the marking note"}
          {q.marking ? ` ${q.marking}` : ""}
        </p>
      ) : null}
    </article>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function QualityPanel({ report }: { report?: SchemeBody["qualityReport"] }) {
  if (!report) return null;
  const passed = report.checks.filter((item) => item.passed).length;
  return (
    <section className="rounded-xl border border-line bg-paper p-4">
      <h2 className="font-display text-xl">Planning completeness review · {passed}/{report.checks.length} checks populated</h2>
      <p className="mt-1 text-xs text-ink/65">{report.source}</p>
      <p className="text-xs"><a className="font-semibold text-leaf underline" href="https://www.education.go.ke/sites/default/files/2023-01/Guidelines%20for%20Implementation%20of%20Junior%20Secondary%20Education%2017th%20Jan-compressed.pdf" target="_blank" rel="noreferrer">Ministry JSS guidelines §4.8</a>{" · "}<a className="font-semibold text-leaf underline" href="https://kicd.ac.ke/cbc-materials/curriculum-designs/" target="_blank" rel="noreferrer">KICD curriculum designs</a></p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {report.checks.map((item) => <li key={item.id} className="rounded-lg bg-card px-3 py-2 text-sm">
          <p className="font-semibold">{item.passed ? "Populated" : "Review needed"} · {item.label}</p>
          <p className="text-xs text-ink/70">{item.detail}</p>
        </li>)}
      </ul>
      <p className="mt-2 text-xs text-ink/70">{report.notice}</p>
    </section>
  );
}
