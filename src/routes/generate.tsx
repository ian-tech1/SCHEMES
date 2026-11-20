import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell, useDesk } from "@/components/shell";
import { AiUsageNotice } from "@/components/ai-usage-notice";
import { ColumnPicker } from "@/components/column-picker";
import { TopicSelector } from "@/components/topic-selector";
import { buttonClass, Field, fieldClass, Panel } from "@/components/bits";
import { LEVELS, PATHWAYS, PRIMARY_BANDS, TERMS, bandBadge, bandOf, strandsFor, subjectsFor } from "@/lib/curriculum";
import { getDocument } from "@/lib/cbe.functions";
import { generateDocumentQueued } from "@/lib/generation-queue";
import { ASSESSMENT_METHODS, DEFAULT_SCHEME_COLUMNS, HOMEWORK_DAYS, PCI_KEY, TERM_PLAN, TEXTBOOKS, VALUE_KEY, COMPETENCY_KEY, columnsOrDefault } from "@/lib/scheme-format";
import { defaultTopicSelections } from "@/lib/curriculum-content";
import type { SchemeBody, SchemeTextbook, TocPhoto, TopicSelection } from "@/lib/cbe-types";
import { secondarySummary, subjectsForPathway, pathwaySubjects } from "@/lib/secondary-quality";

export const Route = createFileRoute("/generate")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" ? search.from : "",
  }),
  component: GeneratePage,
});

type FormState = {
  level: string;
  grade: string;
  subject: string;
  strand: string;
  substrand: string;
  term: string;
  year: number;
  weekFrom: number;
  weekTo: number;
  lessonsPerWeek: number;
  pathway: string;
  startFrom: string;
  endAt: string;
  stream: string;
};

const EMPTY: FormState = {
  level: "junior",
  grade: "Grade 7",
  subject: "Mathematics",
  strand: "3.0 Measurement",
  substrand: "3.3 Area",
  term: "Term 3",
  year: 2026,
  weekFrom: 1,
  weekTo: 9,
  lessonsPerWeek: 5,
  pathway: "",
  startFrom: "",
  endAt: "",
  stream: "",
};

type BookDraft = SchemeTextbook & { key: string };

function newBook(partial: Partial<SchemeTextbook> & { title: string }): BookDraft {
  return {
    key: `${partial.title}-${Math.random().toString(36).slice(2, 7)}`,
    title: partial.title,
    publisher: partial.publisher ?? "",
    pagesFrom: partial.pagesFrom ?? "",
    pagesTo: partial.pagesTo ?? "",
    guide: partial.guide === "teacher" ? "teacher" : "learner",
  };
}

function GeneratePage() {
  return (
    <AppShell>
      <GenerateBody />
    </AppShell>
  );
}

function GenerateBody() {
  const { from } = Route.useSearch();
  const { me } = useDesk();
  const navigate = useNavigate();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("Waiting for the project worker…");
  const [error, setError] = useState("");
  const [columns, setColumns] = useState<string[]>(DEFAULT_SCHEME_COLUMNS);
  const [columnsReady, setColumnsReady] = useState(false);
  const [topicSelections, setTopicSelections] = useState<TopicSelection[]>(() => defaultTopicSelections(EMPTY.subject, EMPTY.grade, EMPTY.strand, EMPTY.substrand, EMPTY.term));
  const [includeCompetencies, setIncludeCompetencies] = useState<string[]>([]);
  const [includeValues, setIncludeValues] = useState<string[]>([]);
  const [includePcis, setIncludePcis] = useState<string[]>([]);
  const [books, setBooks] = useState<BookDraft[]>([]);
  const [customTitle, setCustomTitle] = useState("");
  const [customPublisher, setCustomPublisher] = useState("");
  const [substrandsText, setSubstrandsText] = useState("");
  const [methods, setMethods] = useState<string[]>(["Observation", "Oral questions"]);
  const [minutes, setMinutes] = useState<40 | 80>(40);
  const [termStart, setTermStart] = useState("");
  const [halfStart, setHalfStart] = useState("");
  const [halfEnd, setHalfEnd] = useState("");
  const [reflectionMode, setReflectionMode] = useState<"blank" | "prompt">("blank");
  const [coverNote, setCoverNote] = useState("");
  const [showApproval, setShowApproval] = useState(true);
  const [safetyNote, setSafetyNote] = useState(false);
  const [remember, setRemember] = useState(false);
  const [photos, setPhotos] = useState<TocPhoto[]>([]);
  const [learners, setLearners] = useState(0);
  const [boys, setBoys] = useState(0);
  const [girls, setGirls] = useState(0);
  const [hodName, setHodName] = useState("");
  const [preparedOn, setPreparedOn] = useState("");
  const [doubleLesson, setDoubleLesson] = useState(0);
  const [homeworkDay, setHomeworkDay] = useState("");
  const [room, setRoom] = useState("");
  const [appliedDefaults, setAppliedDefaults] = useState(false);

  useEffect(() => {
    if (!from) return;
    const id = Number(from);
    if (!Number.isInteger(id)) return;
    getDocument({ data: id }).then((result) => {
      if (!result.ok) return;
      const doc = result.doc;
      setForm({
        level: doc.level,
        grade: doc.grade,
        subject: doc.subject,
        strand: doc.strand,
        substrand: doc.substrand,
        term: doc.term,
        year: doc.year,
        weekFrom: doc.weekFrom,
        weekTo: doc.weekTo,
        lessonsPerWeek: doc.lessonsPerWeek,
        pathway: doc.pathway,
        startFrom: doc.startFrom,
        endAt: doc.endAt,
        stream: doc.stream,
      });
      const body = doc.body as SchemeBody;
      if (body?.columns?.length) setColumns(columnsOrDefault(body.columns));
      if (body?.topicSelections?.length) setTopicSelections(body.topicSelections);
      if (body?.textbooks?.length) setBooks(body.textbooks.map((book) => newBook(book)));
      if (body?.lessonMinutes === 80) setMinutes(80);
      if (body?.termStart) setTermStart(body.termStart);
      if (body?.halfTermStart) setHalfStart(body.halfTermStart);
      if (body?.halfTermEnd) setHalfEnd(body.halfTermEnd);
      if (body?.reflectionMode) setReflectionMode(body.reflectionMode);
      if (body?.coverNote) setCoverNote(body.coverNote);
      if (typeof body?.showApproval === "boolean") setShowApproval(body.showApproval);
      if (body?.learners) setLearners(body.learners);
      if (body?.boys) setBoys(body.boys);
      if (body?.girls) setGirls(body.girls);
      if (body?.hodName) setHodName(body.hodName);
      if (body?.preparedOn) setPreparedOn(body.preparedOn);
      if (body?.doubleLesson) setDoubleLesson(body.doubleLesson);
      if (body?.homeworkDay) setHomeworkDay(body.homeworkDay);
      if (body?.room) setRoom(body.room);
      setColumnsReady(true);
    }).catch(() => undefined);
  }, [from]);

  useEffect(() => {
    if (!me || columnsReady || from) return;
    const next = me.profile.useAdminColumns || me.profile.schemeColumns.length === 0
      ? me.settings.schemeColumns
      : me.profile.schemeColumns;
    setColumns(columnsOrDefault(next));
    setColumnsReady(true);
  }, [me, columnsReady, from]);

  useEffect(() => {
    if (!me || from || appliedDefaults) return;
    setForm((current) => ({
      ...current,
      lessonsPerWeek: me.settings.defaultLessons || current.lessonsPerWeek,
    }));
    if (me.settings.defaultMinutes === 80) setMinutes(80);
    setAppliedDefaults(true);
  }, [me, from, appliedDefaults]);

  useEffect(() => {
    if (form.subject.toLowerCase().includes("math") && form.grade === "Grade 7" && form.term === "Term 3") {
      setBooks((current) => current.some((book) => book.title === "Smart Minds")
        ? current
        : [...current, newBook({ title: "Smart Minds", publisher: "Smart Minds" })]);
    }
  }, [form.subject, form.grade, form.term]);

  if (!me) return null;
  const grades = LEVELS.find((level) => level.id === form.level)?.grades ?? [];
  // Primary is planned by band: the Lower Primary areas are not the Upper
  // Primary areas, so the list must follow the grade that was chosen.
  const subjects = form.level === "senior" ? subjectsForPathway(form.level, form.grade, form.pathway) : subjectsFor(form.level, form.grade);
  const strandOpts = strandsFor(form.subject, form.grade);
  const incomplete = me.profile.role !== "admin" && (me.profile.schoolName.length < 2 || me.profile.phone.replace(/\D/g, "").length < 9);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "grade" || key === "subject" || key === "term") setTopicSelections([]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNote("Waiting for the project worker…");
    setBusy(true);
    try {
      const result = await generateDocumentQueued({
          ...form,
          kind: "scheme",
          substrands: substrandsText.split(/\n|;/).map((item) => item.trim()).filter((item) => item.length > 1),
          columns,
          textbooks: books.map(({ title, publisher, pagesFrom, pagesTo, guide }) => ({
            title, publisher, pagesFrom, pagesTo, guide,
          })),
          lessonMinutes: minutes,
          termStart,
          halfTermStart: halfStart,
          halfTermEnd: halfEnd,
          reflectionMode,
          coverNote,
          assessmentMethods: methods,
          showApproval,
          safetyNote,
          tocPhotos: photos,
          depth: "full",
          selectedTopics: topicSelections,
          includeCompetencies,
          includeValues,
          includePcis,
          rememberColumns: remember,
          learners,
          boys,
          girls,
          hodName,
          preparedOn,
          doubleLesson,
          homeworkDay,
          room,
        }, (state) => setNote(state === "queued" ? "Queued — waiting for Grok…" : state === "processing" ? "Grok is writing this scheme…" : "Saving your finished scheme…"));
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        setBusy(false);
        return;
      }
      toast.success("Scheme saved on your desk.");
      await router.navigate({ to: "/library/$id", params: { id: String(result.id) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The writer could not finish.";
      setError(message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="font-display text-4xl leading-tight">Write a scheme</h1>
        <p className="mt-2 max-w-2xl text-ink/80">
          {me.downloadsFree
            ? "Your downloads are free. The scheme still saves on your library."
            : `You can read it here first. The saved set uses the site baseline of KES ${me.settings.priceKes} unless its grade and learning area have a price override; the final amount is shown on the saved item${me.settings.tillNumber ? ` and paid to till ${me.settings.tillNumber}` : ""}.`}
          {" "}Each week gets one row per lesson. Five lessons on the timetable means five rows, with the strand and sub-strand on every row.
        </p>
      </div>
      <AiUsageNotice />
      {busy ? <p role="status" className="rounded-xl bg-paper px-4 py-3 text-sm font-semibold text-leaf">{note}</p> : null}

      {incomplete ? (
        <Panel>
          <p className="font-semibold">Profile first</p>
          <p className="text-sm text-ink/75">Add your school and phone so the cover is complete.</p>
          <button type="button" className={`${buttonClass("leaf")} mt-3`} onClick={() => navigate({ to: "/profile" })}>
            Open profile
          </button>
        </Panel>
      ) : null}

      <Panel className="grid gap-3 sm:grid-cols-2">
        <Field label="Level">
          <select
            className={fieldClass}
            value={form.level}
            onChange={(e) => {
              const level = e.target.value;
              const nextGrades = LEVELS.find((item) => item.id === level)?.grades ?? [];
              const nextSubjects = level === "senior" ? subjectsForPathway(level, nextGrades[0] ?? "", "STEM") : subjectsFor(level, nextGrades[0] ?? "");
              setForm((current) => ({
                ...current,
                level,
                grade: nextGrades[0] ?? current.grade,
                subject: nextSubjects.includes(current.subject) ? current.subject : (nextSubjects[0] ?? current.subject),
                pathway: level === "senior" ? current.pathway || "STEM" : "",
              }));
            }}
          >
            {LEVELS.map((level) => (
              <option key={level.id} value={level.id}>{level.label}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Grade"
          hint={form.level === "primary"
            ? "Primary is split the way KICD publishes it: Lower Primary Grade 1 to 3 first, then Upper Primary Grade 4 to 6."
            : undefined}
        >
          <select
            className={fieldClass}
            value={form.grade}
            onChange={(e) => {
              const grade = e.target.value;
              const allowed = form.level === "senior" ? subjectsForPathway(form.level, grade, form.pathway) : subjectsFor(form.level, grade);
              setForm((current) => ({
                ...current,
                grade,
                subject: allowed.includes(current.subject) ? current.subject : (allowed[0] ?? current.subject),
                strand: "",
                substrand: "",
              }));
            }}
          >
            {form.level === "primary"
              ? PRIMARY_BANDS.map((band) => (
                  <optgroup key={band.id} label={`${band.label} · ${band.range}`}>
                    {band.grades.map((grade) => (
                      <option key={grade}>{grade}</option>
                    ))}
                  </optgroup>
                ))
              : grades.map((grade) => (
                  <option key={grade}>{grade}</option>
                ))}
          </select>
          {bandOf(form.grade) ? (
            <p className="mt-1 text-xs text-ink/70">
              {bandBadge(form.grade)} · {subjects.length} learning areas in this band. {bandOf(form.grade)!.blurb}
            </p>
          ) : null}
        </Field>
        <Field
          label="Learning area"
          hint={form.level === "primary"
            ? `The areas printed in the ${bandOf(form.grade)?.label ?? "Primary"} designs. Pick one, or type your own below.`
            : "Pick one, or type your own below the list."}
        >
          <select
            className={fieldClass}
            value={subjects.includes(form.subject) ? form.subject : ""}
            onChange={(e) => {
              if (e.target.value) set("subject", e.target.value);
            }}
          >
            {!subjects.includes(form.subject) ? <option value="">Custom learning area</option> : null}
            {subjects.map((subject) => (
              <option key={subject}>{subject}</option>
            ))}
          </select>
        </Field>
        <Field label="Or type the learning area">
          <input className={fieldClass} value={form.subject} onChange={(e) => set("subject", e.target.value)} required />
        </Field>
        {form.level === "senior" ? (
          <Field label="Pathway">
            <select className={fieldClass} value={form.pathway} onChange={(e) => {
              const pathway = e.target.value;
              const nextSubjects = subjectsForPathway(form.level, form.grade, pathway);
              setForm((current) => ({ ...current, pathway, subject: nextSubjects.includes(current.subject) ? current.subject : nextSubjects[0] ?? current.subject, strand: "", substrand: "" }));
              setTopicSelections([]);
            }}>
              {PATHWAYS.map((pathway) => (
                <option key={pathway}>{pathway}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Class / stream" hint="Optional. Example: 7 Blue.">
          <input className={fieldClass} value={form.stream} onChange={(e) => set("stream", e.target.value)} />
        </Field>
      </Panel>

      <Panel className="grid gap-3 sm:grid-cols-2">
        {strandOpts.length ? (
          <Field label="Common strand">
            <select
              className={fieldClass}
              value={strandOpts.some((item) => item.strand === form.strand) ? form.strand : ""}
              onChange={(e) => {
                const strand = e.target.value;
                const opt = strandOpts.find((item) => item.strand === strand);
                setForm((current) => ({
                  ...current,
                  strand,
                  substrand: opt?.substrands[0] ?? current.substrand,
                }));
              }}
            >
              <option value="">I will type it</option>
              {strandOpts.map((item) => (
                <option key={item.strand}>{item.strand}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Strand / topic">
          <input className={fieldClass} value={form.strand} onChange={(e) => set("strand", e.target.value)} required />
        </Field>
        {strandOpts.find((item) => item.strand === form.strand)?.substrands.length ? (
          <Field label="Common sub-strand">
            <select className={fieldClass} value={form.substrand} onChange={(e) => set("substrand", e.target.value)}>
              {strandOpts.find((item) => item.strand === form.strand)?.substrands.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Sub-strand">
          <input className={fieldClass} value={form.substrand} onChange={(e) => set("substrand", e.target.value)} required />
        </Field>
        <Field label="Where to start" hint="Leave blank to begin at the start of the sub-strand.">
          <input className={fieldClass} value={form.startFrom} onChange={(e) => set("startFrom", e.target.value)} placeholder="Introduction, lesson 1" />
        </Field>
        <Field label="Where to end" hint="Leave blank to stop at the end of the sub-strand.">
          <input className={fieldClass} value={form.endAt} onChange={(e) => set("endAt", e.target.value)} placeholder="Word problems" />
        </Field>
        <Field label="More sub-strands" hint="One per line. They are shared across the lesson rows.">
          <textarea className={fieldClass} rows={3} value={substrandsText} onChange={(e) => setSubstrandsText(e.target.value)} placeholder={"Features of a narrative\nStorytelling techniques"} />
        </Field>
      </Panel>

      <TopicSelector subject={form.subject} grade={form.grade} term={form.term} value={topicSelections} onChange={setTopicSelections} />
      {(() => {
        const slots = Math.max(1, (Number(form.weekTo) - Number(form.weekFrom) + 1) * Number(form.lessonsPerWeek || 1));
        const focuses = topicSelections.reduce((count, topic) => count + Math.max(1, topic.subtopics.length), 0);
        if (!focuses) return <p className="text-sm text-clay">Tick at least one topic. Every ticked subtopic gets its own lesson row.</p>;
        if (focuses > slots) return <p className="text-sm text-clay">You ticked {focuses} subtopics but this scheme has {slots} lesson rows. Add weeks, or untick some subtopics, so nothing is squeezed out.</p>;
        return <p className="text-sm text-ink/70">{focuses} subtopic{focuses === 1 ? "" : "s"} across {slots} lessons. Spare lessons split a subtopic instead of leaving a blank row.</p>;
      })()}

      <Panel className="space-y-3">
        <h2 className="font-display text-2xl">Optional CBC links under outcomes</h2>
        <p className="text-sm text-ink/75">Tick only what genuinely fits the selected lesson. These are labelled and placed below the specific learning outcomes; leave them all blank when not needed.</p>
        <fieldset>
          <legend className="text-sm font-semibold">Core competencies</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {COMPETENCY_KEY.map((item) => <label key={item} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={includeCompetencies.includes(item)} onChange={() => setIncludeCompetencies((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item}</label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Values</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {VALUE_KEY.map((item) => <label key={item} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={includeValues.includes(item)} onChange={() => setIncludeValues((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item}</label>)}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Pertinent and contemporary issues (PCIs)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {PCI_KEY.map((item) => <label key={item} className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={includePcis.includes(item)} onChange={() => setIncludePcis((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])} />{item}</label>)}
          </div>
        </fieldset>
      </Panel>

      <Panel className="grid gap-3 sm:grid-cols-2">
        <Field label="Term">
          <select
            className={fieldClass}
            value={form.term}
            onChange={(e) => {
              const term = e.target.value;
              set("term", term);
              const plan = TERM_PLAN[term];
              if (plan && form.year === 2026) {
                set("weekFrom", 1);
                set("weekTo", plan.weeks);
                setTermStart(plan.start);
              }
            }}
          >
            {TERMS.map((term) => (
              <option key={term}>{term}</option>
            ))}
          </select>
        </Field>
        <Field label="Year">
          <input className={fieldClass} type="number" min={2024} max={2035} value={form.year} onChange={(e) => set("year", Number(e.target.value))} />
        </Field>
        <Field label="Start week">
          <input className={fieldClass} type="number" min={1} max={14} value={form.weekFrom} onChange={(e) => set("weekFrom", Number(e.target.value))} />
        </Field>
        <Field label="End week" hint="A full term is often 10 to 13 weeks. Shorter is faster.">
          <input className={fieldClass} type="number" min={1} max={14} value={form.weekTo} onChange={(e) => set("weekTo", Number(e.target.value))} />
        </Field>
        <Field label="Lessons per week" hint="Five lessons means five rows in every week, each with its strand and sub-strand.">
          <input className={fieldClass} type="number" min={1} max={6} value={form.lessonsPerWeek} onChange={(e) => set("lessonsPerWeek", Number(e.target.value))} />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          {[3, 4, 5, 6].map((count) => (
            <button key={count} type="button" className={buttonClass(form.lessonsPerWeek === count ? "leaf" : "ghost")} onClick={() => set("lessonsPerWeek", count)}>
              {count} lessons
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
          <button type="button" className={buttonClass("ghost")} onClick={() => { set("weekFrom", 1); set("weekTo", 13); }}>
            13-week term
          </button>
          <button type="button" className={buttonClass("ghost")} onClick={() => { set("weekFrom", 1); set("weekTo", 9); }}>
            9-week term
          </button>
          <button type="button" className={buttonClass("ghost")} onClick={() => { set("weekFrom", 1); set("weekTo", 5); }}>
            First 5 weeks
          </button>
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h2 className="font-display text-2xl">Textbooks</h2>
        <p className="text-sm text-ink/75">The book name and the page for that lesson print on the scheme and in the file. Add a book that is not on the list.</p>
        <div className="flex flex-wrap gap-2">
          {TEXTBOOKS.map((book) => (
            <button
              key={book.id}
              type="button"
              className={buttonClass("ghost")}
              onClick={() => setBooks((current) => current.some((item) => item.title === book.title) ? current : [...current, newBook(book)])}
            >
              {book.title}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input className={fieldClass} value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Book not on the list" />
          <input className={fieldClass} value={customPublisher} onChange={(e) => setCustomPublisher(e.target.value)} placeholder="Publisher" />
          <button
            type="button"
            className={buttonClass("ink")}
            onClick={() => {
              if (customTitle.trim().length < 2) return;
              setBooks((current) => [...current, newBook({ title: customTitle.trim(), publisher: customPublisher.trim() })]);
              setCustomTitle("");
              setCustomPublisher("");
            }}
          >
            Add book
          </button>
        </div>
        {books.map((book) => (
          <div key={book.key} className="grid gap-2 rounded-xl bg-paper p-3 sm:grid-cols-4">
            <p className="text-sm font-semibold sm:col-span-4">{book.title}{book.publisher ? ` · ${book.publisher}` : ""}</p>
            <Field label="From page">
              <input className={fieldClass} inputMode="numeric" value={book.pagesFrom} onChange={(e) => setBooks((current) => current.map((item) => item.key === book.key ? { ...item, pagesFrom: e.target.value } : item))} />
            </Field>
            <Field label="To page">
              <input className={fieldClass} inputMode="numeric" value={book.pagesTo} onChange={(e) => setBooks((current) => current.map((item) => item.key === book.key ? { ...item, pagesTo: e.target.value } : item))} />
            </Field>
            <Field label="Book type">
              <select className={fieldClass} value={book.guide} onChange={(e) => setBooks((current) => current.map((item) => item.key === book.key ? { ...item, guide: e.target.value === "teacher" ? "teacher" : "learner" } : item))}>
                <option value="learner">Learner’s book</option>
                <option value="teacher">Teacher’s guide</option>
              </select>
            </Field>
            <button type="button" className={buttonClass("ghost")} onClick={() => setBooks((current) => current.filter((item) => item.key !== book.key))}>
              Remove
            </button>
          </div>
        ))}
        <Field label="Photo of the table of contents" hint="Up to two photos. They stay with this scheme.">
          <input
            className={fieldClass}
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void shrinkPhoto(file).then((dataUrl) => {
                if (!dataUrl) {
                  toast.error("That photo is still too large. Try a closer crop of the contents page.");
                  return;
                }
                const caption = books[0]?.title ? `${books[0].title} contents` : "Table of contents";
                setPhotos((current) => [...current, { caption, dataUrl }].slice(0, 2));
              });
            }}
          />
        </Field>
        {photos.length ? (
          <ul className="space-y-1 text-sm">
            {photos.map((photo, index) => (
              <li key={`${photo.caption}-${index}`}>
                {photo.caption}
                <button type="button" className="ml-2 font-semibold text-clay" onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {form.level === "junior" || form.level === "senior" ? <div className="sm:col-span-2 rounded-xl border border-leaf/30 bg-leaf/5 p-3 text-sm"><p className="font-semibold text-leaf">Secondary planning check</p><p className="mt-1 text-ink/75">{secondarySummary(form.level, form.grade, form.subject, form.pathway)} {form.level === "senior" ? `The selected pathway currently highlights ${pathwaySubjects(form.pathway).length} common learning areas.` : "Keep the topic list editable for your school's pacing."}</p></div> : null}
      </Panel>

      <Panel className="space-y-3">
        <h2 className="font-display text-2xl">Columns on this scheme</h2>
        <p className="text-sm text-ink/75">
          The default matches the staffroom table: week, lesson, strand, sub-strand, outcomes, experiences, inquiry, resources, assessment and reflection.
          The admin default is loaded first. Change it for this scheme, or save it as your own.
        </p>
        <ColumnPicker value={columns} onChange={setColumns} />
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember this layout on my profile
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First Monday of the first week" hint="Optional. The dates print under the week number.">
            <input className={fieldClass} type="date" value={termStart} onChange={(e) => setTermStart(e.target.value)} />
          </Field>
          <Field label="Half term starts" hint="Optional. The break dates print on the scheme so the office can see when teaching pauses.">
            <input className={fieldClass} type="date" value={halfStart} onChange={(e) => setHalfStart(e.target.value)} />
          </Field>
          <Field label="Half term ends">
            <input className={fieldClass} type="date" value={halfEnd} onChange={(e) => setHalfEnd(e.target.value)} />
          </Field>
          <Field label="Lesson length">
            <select className={fieldClass} value={String(minutes)} onChange={(e) => setMinutes(e.target.value === "80" ? 80 : 40)}>
              <option value="40">40 minutes (single)</option>
              <option value="80">80 minutes (double)</option>
            </select>
          </Field>
          <Field label="Reflection column">
            <select className={fieldClass} value={reflectionMode} onChange={(e) => setReflectionMode(e.target.value === "prompt" ? "prompt" : "blank")}>
              <option value="blank">Leave blank for handwriting</option>
              <option value="prompt">Print a short prompt</option>
            </select>
          </Field>
          <Field label="Note on the cover">
            <input className={fieldClass} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="Class motto or a note to the HOD" />
          </Field>
          <Field label="Learners in the class">
            <input className={fieldClass} type="number" min={0} max={80} value={learners || ""} onChange={(e) => setLearners(Number(e.target.value))} />
          </Field>
          <Field label="Boys">
            <input className={fieldClass} type="number" min={0} max={80} value={boys || ""} onChange={(e) => setBoys(Number(e.target.value))} />
          </Field>
          <Field label="Girls">
            <input className={fieldClass} type="number" min={0} max={80} value={girls || ""} onChange={(e) => setGirls(Number(e.target.value))} />
          </Field>
          <Field label="HOD name">
            <input className={fieldClass} value={hodName} onChange={(e) => setHodName(e.target.value)} placeholder="Name on the approval line" />
          </Field>
          <Field label="Classroom / room">
            <input className={fieldClass} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Grade 7 East room" />
          </Field>
          <Field label="Date prepared">
            <input className={fieldClass} type="date" value={preparedOn} onChange={(e) => setPreparedOn(e.target.value)} />
          </Field>
          <Field label="Homework day">
            <select className={fieldClass} value={homeworkDay} onChange={(e) => setHomeworkDay(e.target.value)}>
              <option value="">Not set</option>
              {HOMEWORK_DAYS.map((day) => (
                <option key={day}>{day}</option>
              ))}
            </select>
          </Field>
          <Field label="Double lesson" hint="That lesson number is 80 minutes. The rest stay 40. Choose 0 if every lesson is the same length.">
            <select className={fieldClass} value={doubleLesson} onChange={(e) => setDoubleLesson(Number(e.target.value))}>
              <option value={0}>No double</option>
              {[1, 2, 3, 4, 5, 6].filter((n) => n <= form.lessonsPerWeek).map((n) => (
                <option key={n} value={n}>Lesson {n} is 80 minutes</option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Assessment methods to prefer</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ASSESSMENT_METHODS.map((method) => (
              <label key={method} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={methods.includes(method)}
                  onChange={() => setMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method])}
                />
                {method}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={showApproval} onChange={(e) => setShowApproval(e.target.checked)} />
          Approval lines for teacher, HOD and deputy
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={safetyNote} onChange={(e) => setSafetyNote(e.target.checked)} />
          Add a safety note for games, practicals or tools
        </label>
      </Panel>

      {error ? <p className="rounded-xl border border-clay bg-card px-4 py-3 text-sm text-clay">{error}</p> : null}
      <Panel className="space-y-1 text-sm">
        <h2 className="font-display text-2xl">Before you write</h2>
        <p>{books.length ? `${books.length} book(s) will be named on the scheme.` : "No book is ticked. The scheme will not cite Smart Minds or another book."}</p>
        <p>{halfStart && halfEnd ? `Half-term ${halfStart} to ${halfEnd} will be printed.` : "Half-term dates are empty. Add them if the school has a break."}</p>
        <p>
          {learners > 0 && (boys > 0 || girls > 0) && boys + girls !== learners
            ? `Boys (${boys}) plus girls (${girls}) is not ${learners}. Check the class size.`
            : learners > 0
              ? `${learners} learners will appear on the cover.`
              : "Class size is optional. Add it if the cover should show enrolment."}
        </p>
      </Panel>
      <button type="submit" className={buttonClass("leaf")} disabled={busy || incomplete}>
        {busy ? note : "Write the scheme"}
      </button>
    </form>
  );
}

async function shrinkPhoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.62);
  bitmap.close();
  return dataUrl.length > 180_000 ? null : dataUrl;
}
