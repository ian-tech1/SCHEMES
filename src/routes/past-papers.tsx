import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell, useDesk } from "@/components/shell";
import { Panel, buttonClass, fieldClass } from "@/components/bits";
import { generateDocumentQueued } from "@/lib/generation-queue";
import { getDocument } from "@/lib/cbe.functions";
import { downloadDocument, type ExportDoc } from "@/lib/export-docs";
import { PRACTICE_SERIES, type PracticeSeriesId } from "@/lib/exam-series";
import { strandsFor } from "@/lib/curriculum";
import { designFor, subStrandTitle } from "@/lib/kicd";
import { subjectsForPathway } from "@/lib/secondary-quality";
import { DEFAULT_SCHEME_COLUMNS } from "@/lib/scheme-format";

export const Route = createFileRoute("/past-papers")({ component: PastPapersPage });

const PAPER_YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];

const OFFICIAL = [
  { label: "KNEC KJSEA regulations", href: "https://www.knec.ac.ke/wp-content/uploads/2026/02/KJSEA-REGULATIONS.pdf" },
  { label: "KNEC home", href: "https://www.knec.ac.ke/" },
];

function kjseaNote(seriesId: string, grade: string, subject: string, year: number) {
  if (seriesId === "junior" && grade === "Grade 9" && subject.toLowerCase().includes("math") && year >= 2025) {
    return `${year} Grade 9 Mathematics uses the KJSEA layout: Section A has 20 multiple-choice items and Section B has questions 21–40 in five tasks. 100 marks, 2 hours. It is school practice, not an official paper.`;
  }
  return `A ${year} ${subject} practice paper, with a context, parts, marks and a marking guide. It follows the habits of that year's series. It is not an official KNEC paper.`;
}

function currentTerm() {
  const month = new Date().getMonth() + 1;
  if (month <= 4) return "Term 1";
  if (month <= 8) return "Term 2";
  return "Term 3";
}

function paperScope(subject: string, grade: string) {
  const design = designFor(subject, grade);
  const first = design?.strands[0];
  if (first) {
    const titles = first.subStrands.slice(0, 4).map((sub) => subStrandTitle(sub, grade)).filter((title) => title.length >= 2);
    const topic = titles[0] || first.strand;
    return {
      strand: first.strand,
      substrand: topic,
      substrands: titles.length ? titles : [topic],
      selectedTopics: (titles.length ? titles : [topic]).map((title) => ({
        strand: first.strand,
        topic: title,
        pagesFrom: "",
        pagesTo: "",
        subtopics: [] as { title: string; pagesFrom: string; pagesTo: string }[],
      })),
    };
  }
  const starter = strandsFor(subject, grade)[0];
  const titles = (starter?.substrands ?? [subject]).slice(0, 4);
  const strand = starter?.strand || subject;
  return {
    strand,
    substrand: titles[0] || subject,
    substrands: titles,
    selectedTopics: titles.map((title) => ({ strand, topic: title, pagesFrom: "", pagesTo: "", subtopics: [] as { title: string; pagesFrom: string; pagesTo: string }[] })),
  };
}

function PastPapersPage() {
  return <AppShell><PastPapersBody /></AppShell>;
}

function PastPapersBody() {
  const { me } = useDesk();
  const [seriesId, setSeriesId] = useState<PracticeSeriesId>("junior");
  const series = PRACTICE_SERIES.find((item) => item.id === seriesId) ?? PRACTICE_SERIES[2]!;
  const [grade, setGrade] = useState(series.grades.at(-1) ?? "Grade 9");
  const [subject, setSubject] = useState("Mathematics");
  const [pathway, setPathway] = useState("STEM");
  const [paperYear, setPaperYear] = useState(2026);
  const [busy, setBusy] = useState("");
  const subjects = useMemo(
    () => subjectsForPathway(series.level, grade, pathway),
    [series.level, grade, pathway],
  );
  const ready = Boolean(me && (me.profile.role === "admin" || (me.profile.displayName.length >= 2 && me.profile.schoolName.length >= 2 && me.profile.phone.replace(/\D/g, "").length >= 9)));

  function chooseSeries(nextId: PracticeSeriesId) {
    const next = PRACTICE_SERIES.find((item) => item.id === nextId) ?? series;
    const nextGrade = next.grades.at(-1) ?? next.grades[0] ?? grade;
    const nextSubjects = subjectsForPathway(next.level, nextGrade, pathway);
    setSeriesId(next.id);
    setGrade(nextGrade);
    setSubject(nextSubjects.includes(subject) ? subject : nextSubjects[0] ?? "Mathematics");
  }

  async function writeAndSave() {
    if (!ready) {
      toast.error("Add your name, school and phone on your profile first. They go on the paper.");
      return;
    }
    const scope = paperScope(subject, grade);
    const kjsea = series.id === "junior" && grade === "Grade 9" && subject.toLowerCase().includes("math") && paperYear >= 2025;
    setBusy("Grok is setting the paper…");
    const result = await generateDocumentQueued({
      kind: "exam",
      level: series.level,
      grade,
      subject,
      strand: scope.strand,
      substrand: scope.substrand,
      substrands: scope.substrands,
      selectedTopics: scope.selectedTopics,
      term: currentTerm(),
      year: paperYear,
      weekFrom: 1,
      weekTo: 1,
      lessonsPerWeek: 1,
      pathway: series.level === "senior" ? pathway : "",
      startFrom: "",
      endAt: "",
      stream: "",
      questionCount: kjsea ? 40 : series.questionCount,
      questionTypes: kjsea ? ["mcq", "structured"] : series.questionTypes,
      questionDifficulty: "balanced",
      assessmentMode: kjsea ? "kjsea-format" : "practice",
      depth: "full",
      teacherGuidance: `${series.guidance} Set this as a ${paperYear} ${series.label} practice paper. Use the paper habits of that year. Do not copy a live paper and do not claim KNEC issued it.`,
      columns: DEFAULT_SCHEME_COLUMNS,
      textbooks: [],
      lessonMinutes: 40,
      termStart: "",
      reflectionMode: "prompt",
      coverNote: `School practice paper in the style of the ${paperYear} series. Not an official KNEC paper.`,
      assessmentMethods: ["Written exercise"],
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
    }, (state) => setBusy(state === "queued" ? "Queued — waiting for Grok…" : "Grok is setting the paper…"));
    if (!result.ok) {
      toast.error(result.error);
      setBusy("");
      return;
    }
    setBusy("Saving both PDFs to your phone…");
    const loaded = await getDocument({ data: result.id });
    if (!loaded.ok) {
      toast.error(loaded.error);
      setBusy("");
      return;
    }
    if (loaded.doc.redacted) {
      toast.error("The paper is in your library. Unlock it there before the files can be saved.");
      setBusy("");
      return;
    }
    const base: Omit<ExportDoc, "copy"> = {
      kind: loaded.doc.kind,
      title: loaded.doc.title,
      grade: loaded.doc.grade,
      subject: loaded.doc.subject,
      strand: loaded.doc.strand,
      substrand: loaded.doc.substrand,
      term: loaded.doc.term,
      year: loaded.doc.year,
      weekFrom: loaded.doc.weekFrom,
      weekTo: loaded.doc.weekTo,
      lessonsPerWeek: loaded.doc.lessonsPerWeek,
      pathway: loaded.doc.pathway,
      schoolName: loaded.doc.schoolName,
      teacherName: loaded.doc.teacherName,
      phone: loaded.doc.phone,
      stream: loaded.doc.stream,
      startFrom: loaded.doc.startFrom,
      endAt: loaded.doc.endAt,
      level: loaded.doc.level,
      body: loaded.doc.body,
      branding: loaded.doc.branding,
    };
    await downloadDocument({ ...base, copy: "learner" }, "pdf");
    await downloadDocument({ ...base, copy: "teacher" }, "pdf");
    toast.success("Learner paper and teacher marking file saved to your phone.");
    setBusy("");
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-4xl">Practice papers</h1>
        <p className="mt-2 max-w-3xl text-ink/75">Grok writes a school practice paper in the shape teachers use for KPSEA, KJSEA and KCSE preparation, then saves the learner PDF and the teacher marking PDF on this phone. These are not official KNEC papers and they are not copies of a live paper.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {PRACTICE_SERIES.map((item) => (
          <button key={item.id} type="button" className={`rounded-2xl border p-4 text-left ${seriesId === item.id ? "border-leaf bg-leaf/10" : "border-line bg-card"}`} onClick={() => chooseSeries(item.id)}>
            <p className="font-display text-xl">{item.label}</p>
            <p className="mt-1 text-sm text-ink/75">{item.note}</p>
          </button>
        ))}
      </div>
      <Panel className="space-y-3">
        <h2 className="font-display text-2xl">Write and save</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Grade
            <select className={`${fieldClass} mt-1`} value={grade} onChange={(event) => {
              const next = event.target.value;
              const nextSubjects = subjectsForPathway(series.level, next, pathway);
              setGrade(next);
              setSubject(nextSubjects.includes(subject) ? subject : nextSubjects[0] ?? "Mathematics");
            }}>{series.grades.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">Learning area
            <select className={`${fieldClass} mt-1`} value={subject} onChange={(event) => setSubject(event.target.value)}>{subjects.map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          <label className="text-sm font-semibold">Year the series was done
            <select className={`${fieldClass} mt-1`} value={paperYear} onChange={(event) => setPaperYear(Number(event.target.value))}>{PAPER_YEARS.map((item) => <option key={item} value={item}>{item}{item === 2026 ? " — KJSEA / current" : ""}</option>)}</select>
          </label>
          {series.level === "senior" ? <label className="text-sm font-semibold">Pathway
            <select className={`${fieldClass} mt-1`} value={pathway} onChange={(event) => {
              const next = event.target.value;
              const nextSubjects = subjectsForPathway(series.level, grade, next);
              setPathway(next);
              setSubject(nextSubjects.includes(subject) ? subject : nextSubjects[0] ?? "Mathematics");
            }}><option>STEM</option><option>Social Sciences</option><option>Arts and Sports Science</option></select>
          </label> : null}
        </div>
        <p className="text-sm text-ink/70">{kjseaNote(series.id, grade, subject, paperYear)}</p>
        {!ready ? <p className="rounded-lg bg-gold/15 p-3 text-sm">Add your name, school and phone on your profile before the first paper. <Link to="/profile" className="font-semibold text-leaf underline">Open profile</Link></p> : null}
        <button type="button" className={buttonClass("leaf")} disabled={!!busy || !ready} onClick={() => void writeAndSave().catch((error: unknown) => { toast.error(error instanceof Error ? error.message : "The paper could not be saved."); setBusy(""); })}>{busy || "Write and save both PDFs"}</button>
        <p className="text-xs text-ink/65">The files land in your phone’s downloads. The same paper stays in your library if you need it again. A teacher still checks every mark against the current KICD design.</p>
      </Panel>
      <Panel className="space-y-2">
        <h2 className="font-display text-2xl">What the paper follows</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            "One idea per item, with a command word the grade can read.",
            "A short Kenyan context before structured parts.",
            "Marks shown on each part, and a marking guide that awards every mark.",
            "A table of specification, candidate lines and an objective answer grid on the PDF.",
            "CBC bands on the teacher file: Exceeds, Meets, Approaches, Below.",
            "A clear line that the paper was not issued by KNEC.",
          ].map((item) => <li key={item} className="rounded-lg bg-paper px-3 py-2">{item}</li>)}
        </ul>
        <p className="text-xs text-ink/65">Official rules stay on KNEC. {OFFICIAL.map((item) => item.label).join(" · ")} can be opened if you need the current regulations. This site does not sell or redistribute a live KNEC paper.</p>
      </Panel>
    </div>
  );
}
