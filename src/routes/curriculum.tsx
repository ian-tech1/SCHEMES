import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell";
import { buttonClass, fieldClass, Panel } from "@/components/bits";
import {
  BAND_LABEL,
  BAND_RANGE,
  KICD_DESIGNS,
  designFor,
  kicdSourceLinks,
  kicdStat,
  kicdTopicsFor,
  subStrandTitle,
  type KicdBandId,
  type KicdConfidence,
} from "@/lib/kicd";
import {
  LEVELS,
  PATHWAYS,
  TERMS,
  bandOf,
  gradesFor,
  strandsFor,
  strandsAreFromDesign,
  subjectsFor,
} from "@/lib/curriculum";
import { SECONDARY_QUALITY_UPGRADES, secondarySummary, subjectsForPathway, pathwaySubjects } from "@/lib/secondary-quality";
import { downloadGradeCurriculum, downloadSubjectCurriculum } from "@/lib/curriculum-download";

export const Route = createFileRoute("/curriculum")({ component: CurriculumPage });

const KICD_INDEX = "https://kicd.ac.ke/cbc-materials/curriculum-designs/";
const GRADE_DESIGN_PAGES: Partial<Record<string, string>> = {
  "Grade 7": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-seven-designs/",
  "Grade 8": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-eight-designs/",
  "Grade 9": "https://kicd.ac.ke/cbc-materials/curriculum-designs/grade-nine-designs/",
};
const confidenceCopy: Record<KicdConfidence | "none", { label: string; className: string }> = {
  high: { label: "Verified", className: "bg-leaf/15 text-leaf" },
  medium: { label: "Check before use", className: "bg-gold/20 text-ink" },
  low: { label: "Starter list", className: "bg-clay/15 text-clay" },
  none: { label: "Starter list", className: "bg-clay/15 text-clay" },
};

function CurriculumPage() {
  return <AppShell><CurriculumBody /></AppShell>;
}

function CurriculumBody() {
  const [level, setLevel] = useState("primary");
  const [grade, setGrade] = useState("Grade 1");
  const [subject, setSubject] = useState("English");
  const [pathway, setPathway] = useState("STEM");
  const [term, setTerm] = useState("All terms");
  const [query, setQuery] = useState("");
  const selectedLevel = LEVELS.find((item) => item.id === level) ?? LEVELS[0];
  const gradeBand = bandOf(grade);
  const subjects = level === "senior" ? subjectsForPathway(level, grade, pathway) : subjectsFor(level, grade);
  const design = designFor(subject, grade);
  const officialSources = (design?.sources ?? []).filter((source) => {
    try { const url = new URL(source); return url.protocol === "https:" && (url.hostname === "kicd.ac.ke" || url.hostname.endsWith(".kicd.ac.ke")); } catch { return false; }
  });
  const gradeDesignPage = GRADE_DESIGN_PAGES[grade] ?? KICD_INDEX;
  const coverage = design ? confidenceCopy[design.confidence] : confidenceCopy.none;
  const starter = strandsFor(subject, grade);

  const rows = useMemo(() => {
    if (design) {
      return design.strands.flatMap((strand) => strand.subStrands.map((sub) => ({
        strand: strand.id ? `${strand.id} ${strand.strand}` : strand.strand,
        number: sub.id ?? "",
        title: subStrandTitle(sub, grade),
        note: sub.gradeNotes ?? "",
      })));
    }
    return starter.flatMap((strand) => strand.substrands.map((item) => {
      const match = item.match(/^(\S+)\s+(.+)$/);
      return { strand: strand.strand, number: match?.[1] ?? "", title: match?.[2] ?? item, note: "" };
    }));
  }, [design, grade, starter]);
  const hits = query.trim().toLowerCase()
    ? rows.filter((row) => `${row.title} ${row.strand} ${row.note}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];
  const topics = design ? kicdTopicsFor(subject, grade, term === "All terms" ? undefined : term) : [];
  const stat = kicdStat();
  const bandForCard = (id: KicdBandId) => selectedLevel.bands.find((item) => item.id === id);

  function chooseLevel(nextLevel: string) {
    const nextGrades = gradesFor(nextLevel);
    const nextGrade = nextGrades[0] ?? "Grade 1";
    const nextPathway = nextLevel === "senior" ? "STEM" : "";
    const nextSubjects = nextLevel === "senior" ? subjectsForPathway(nextLevel, nextGrade, nextPathway) : subjectsFor(nextLevel, nextGrade);
    setLevel(nextLevel);
    setGrade(nextGrade);
    setSubject(nextSubjects[0] ?? "Mathematics");
    setPathway(nextPathway);
    setTerm("All terms");
    setQuery("");
  }
  function chooseGrade(nextGrade: string) {
    const nextSubjects = level === "senior" ? subjectsForPathway(level, nextGrade, pathway) : subjectsFor(level, nextGrade);
    setGrade(nextGrade);
    setSubject(nextSubjects.includes(subject) ? subject : nextSubjects[0] ?? "Mathematics");
    setTerm("All terms");
    setQuery("");
  }
  function copyStrands() {
    const text = rows.map((row) => `${row.number ? `${row.number} ` : ""}${row.title} — ${row.strand}`).join("\n");
    void navigator.clipboard.writeText(text).then(() => toast.success("Strand list copied."), () => toast.error("Could not copy the strand list."));
  }
  async function saveSubjectFile() {
    try {
      await downloadSubjectCurriculum(grade, subject);
      toast.success(`${subject} saved to your phone.`);
    } catch {
      toast.error("That curriculum file could not be saved.");
    }
  }
  async function saveGradeFile() {
    try {
      await downloadGradeCurriculum(level, grade, pathway);
      toast.success(`${grade} learning areas saved to your phone.`);
    } catch {
      toast.error("That grade pack could not be saved.");
    }
  }

  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-leaf">Plan from the source</p>
      <h1 className="font-display text-4xl leading-tight">Curriculum designs</h1>
      <p className="mt-2 max-w-3xl text-ink/80">A browser for the KICD published designs, first published in 2017 and revised in 2024. Use these lines as an editable starting point, then check the printed design before teaching.</p>
    </header>

    <nav className="sticky top-0 z-10 -mx-4 border-y border-line bg-paper/95 px-4 py-2 backdrop-blur" aria-label="Curriculum path">
      <div className="flex flex-wrap items-center gap-1 text-sm font-semibold">
        <button type="button" className="rounded-lg px-2 py-1 text-leaf hover:bg-card" onClick={() => chooseLevel(level)}>{selectedLevel.label}</button>
        {gradeBand ? <><span aria-hidden="true">›</span><button type="button" className="rounded-lg px-2 py-1 text-leaf hover:bg-card" onClick={() => chooseGrade(gradeBand.grades[0])}>{gradeBand.label}</button></> : null}
        <span aria-hidden="true">›</span><button type="button" className="rounded-lg px-2 py-1 text-leaf hover:bg-card" onClick={() => chooseGrade(grade)}>{grade}</button>
        <span aria-hidden="true">›</span><span className="px-2 py-1 text-ink/70">{subject}</span>
      </div>
    </nav>

    <div className="flex gap-2 overflow-x-auto border-b border-line" role="tablist" aria-label="School level">
      {LEVELS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={level === item.id} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${level === item.id ? "border-leaf text-leaf" : "border-transparent text-ink/70 hover:text-ink"}`} onClick={() => chooseLevel(item.id)}>{item.label}</button>)}
    </div>

    {level === "primary" ? <div className="grid gap-4 md:grid-cols-2">
      {(["lower", "upper"] as KicdBandId[]).map((id) => {
        const band = bandForCard(id);
        if (!band) return null;
        return <Panel key={id} className={gradeBand?.id === id ? "border-leaf" : ""}>
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-2xl">{BAND_LABEL[id]} · {BAND_RANGE[id]}</h2><p className="mt-1 text-sm text-ink/75">{band.blurb}</p></div><span className="rounded-full bg-leaf/15 px-2.5 py-1 text-xs font-semibold text-leaf">{band.grades.length} grades</span></div>
          <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-sm font-semibold text-ink/80">{selectedLevel.weeklyLine}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/60">Learning areas</p>
          <div className="mt-2 flex flex-wrap gap-2">{band.subjects.map((item) => <button key={item} type="button" className={`rounded-full border px-2.5 py-1.5 text-sm ${subject === item && gradeBand?.id === id ? "border-leaf bg-leaf text-paper" : "border-line bg-card text-ink hover:border-leaf"}`} onClick={() => { setGrade(band.grades[0]); setSubject(item); }}>{item}</button>)}</div>
          <div className="mt-4 flex flex-wrap gap-2" aria-label={`${band.label} grades`}>{band.grades.map((item) => <button key={item} type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold ${grade === item ? "bg-ink text-paper" : "border border-line bg-card text-ink hover:border-leaf"}`} onClick={() => chooseGrade(item)}>{item}</button>)}</div>
        </Panel>;
      })}
    </div> : <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl">{selectedLevel.label}</h2><p className="mt-1 text-sm text-ink/75">{selectedLevel.bands[0]?.blurb} {selectedLevel.weeklyLine}</p></div><span className="rounded-full bg-gold/20 px-2.5 py-1 text-xs font-semibold">KICD/CBC design browser</span></div>
      <div className="mt-4 flex flex-wrap gap-2">{selectedLevel.grades.map((item) => <button key={item} type="button" className={`rounded-lg px-3 py-2 text-sm font-semibold ${grade === item ? "bg-ink text-paper" : "border border-line bg-card text-ink hover:border-leaf"}`} onClick={() => chooseGrade(item)}>{item}</button>)}</div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/60">Learning areas and pathways</p>
      <div className="mt-2 flex flex-wrap gap-2">{(selectedLevel.bands[0]?.subjects ?? []).map((item) => <button key={item} type="button" className={`rounded-full border px-2.5 py-1.5 text-sm ${subject === item ? "border-leaf bg-leaf text-paper" : "border-line bg-card text-ink hover:border-leaf"}`} onClick={() => setSubject(item)}>{item}</button>)}</div>
    </Panel>}

    <Panel className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-semibold">Grade<select className={`${fieldClass} mt-1`} value={grade} onChange={(event) => chooseGrade(event.target.value)}>{selectedLevel.grades.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-sm font-semibold">Learning area<select className={`${fieldClass} mt-1`} value={subject} onChange={(event) => { setSubject(event.target.value); setQuery(""); }}>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label>
        {level === "senior" ? <label className="text-sm font-semibold">Pathway<select className={`${fieldClass} mt-1`} value={pathway} onChange={(event) => { const next = event.target.value; const nextSubjects = subjectsForPathway(level, grade, next); setPathway(next); setSubject(nextSubjects.includes(subject) ? subject : nextSubjects[0] ?? "Mathematics"); setQuery(""); }}>{PATHWAYS.map((item) => <option key={item}>{item}</option>)}</select></label> : null}
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" className={buttonClass("leaf")} onClick={() => void saveSubjectFile()}>Save {subject}</button>
          <button type="button" className={buttonClass("ink")} onClick={() => void saveGradeFile()}>Save all {grade}</button>
          <Link to="/generate" search={{ from: "" }} className={buttonClass("ghost")}>Write a scheme for this</Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">{selectedLevel.label} › {grade} › {subject}{level === "senior" ? ` › ${pathway}` : ""}</span><Link to="/library" className="text-leaf underline">Open library</Link></div>
      {level === "junior" || level === "senior" ? <div className="rounded-xl border border-leaf/30 bg-leaf/5 p-3"><p className="font-semibold text-leaf">Secondary quality summary</p><p className="mt-1 text-sm text-ink/75">{secondarySummary(level, grade, subject, pathway)}</p><p className="mt-2 text-xs text-ink/65">{level === "senior" ? `${pathwaySubjects(pathway).length} common subjects are highlighted for this pathway.` : "Junior School topics stay editable so departments can match local pacing."}</p></div> : null}
    </Panel>

    <section aria-labelledby="design-heading" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-leaf">{design ? "Published design" : "Editable starter"}</p><h2 id="design-heading" className="font-display text-3xl">{design?.designTitle && design.designTitle !== subject ? `${design.designTitle} · ${subject}` : design?.designTitle ?? subject}</h2><p className="mt-1 text-sm text-ink/75">{design?.lessonsPerWeek ? `${design.lessonsPerWeek} lessons per week. ` : "Lesson allocation is set by your school timetable. "}{design?.note ?? "These strands are a useful starting list while this design is being transcribed."}</p></div><span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${coverage.className}`}>{coverage.label}</span></div>
      {design?.themes?.length ? <p className="text-sm text-ink/70">Themes in this design: {design.themes.join(" · ")}</p> : null}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-sm font-semibold">Search sub-strands<input className={`${fieldClass} mt-1`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try fractions, plants or writing" /></label>
        <button type="button" className={`${buttonClass("ghost")} self-end`} onClick={copyStrands} disabled={!rows.length}>Copy strand list</button>
      </div>
      {query.trim() ? <div className="rounded-xl border border-line bg-paper p-3"><p className="text-sm font-semibold">{hits.length} matching sub-strand{hits.length === 1 ? "" : "s"}</p>{hits.length ? <ul className="mt-2 divide-y divide-line">{hits.map((hit) => <li key={`${hit.strand}-${hit.number}-${hit.title}`} className="py-2"><span className="font-semibold">{hit.number} {hit.title}</span><span className="ml-2 text-sm text-ink/65">{hit.strand}</span>{hit.note ? <p className="text-xs text-ink/65">{hit.note}</p> : null}</li>)}</ul> : <p className="mt-1 text-sm text-ink/70">No sub-strands match that search.</p>}</div> : null}

      {design ? <div className="space-y-3">{design.strands.map((strand, index) => <details key={`${strand.id}-${strand.strand}`} open={index === 0} className="rounded-xl border border-line bg-card"><summary className="cursor-pointer list-none px-4 py-3 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"><span className="text-leaf">{strand.id ?? `${index + 1}.0`}</span> {strand.strand}<span className="float-right text-xs font-normal text-ink/60">{strand.subStrands.length} sub-strands</span></summary><div className="border-t border-line px-4">{strand.subStrands.map((sub) => <div key={`${sub.id}-${sub.title}`} className="grid gap-1 border-b border-line py-3 last:border-0 sm:grid-cols-[4.5rem_1fr]"><span className="font-mono text-sm text-leaf">{sub.id ?? "—"}</span><div><p className="font-semibold">{subStrandTitle(sub, grade)}</p>{sub.gradeNotes ? <p className="mt-1 text-xs text-ink/65">{sub.gradeNotes}</p> : null}</div></div>)}</div></details>)}</div> : <div className="rounded-xl border border-gold bg-gold/10 p-4"><p className="font-semibold">No design transcribed yet for {selectedLevel.label}.</p><p className="mt-1 text-sm text-ink/75">Keep planning with these editable starter strands. Check your school’s current design before finalising the scheme.</p>{starter.length ? <div className="mt-3 space-y-2">{starter.map((strand) => <div key={strand.strand} className="rounded-lg bg-card px-3 py-2"><p className="font-semibold">{strand.strand}</p><p className="text-sm text-ink/70">{strand.substrands.join(" · ")}</p></div>)}</div> : null}</div>}
    </section>

    {design ? <Panel><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl">Topics by term</h2><p className="text-sm text-ink/70">Term allocation is a helpful planning view; it is not printed in the designs.</p></div><div className="flex flex-wrap gap-2" role="group" aria-label="Filter topics by term"><button type="button" className={`rounded-full px-3 py-1.5 text-sm font-semibold ${term === "All terms" ? "bg-leaf text-paper" : "border border-line bg-card"}`} onClick={() => setTerm("All terms")}>All terms</button>{TERMS.map((item) => <button key={item} type="button" className={`rounded-full px-3 py-1.5 text-sm font-semibold ${term === item ? "bg-leaf text-paper" : "border border-line bg-card"}`} onClick={() => setTerm(item)}>{item}</button>)}</div></div>{topics.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[34rem] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wide text-ink/60"><tr><th className="px-2 py-2">Term</th><th className="px-2 py-2">Topic</th><th className="px-2 py-2">Strand</th></tr></thead><tbody>{topics.map((topic, index) => <tr key={`${topic.term}-${topic.topic}-${index}`} className="border-b border-line last:border-0"><td className="px-2 py-3 font-semibold">{topic.term}</td><td className="px-2 py-3">{topic.topic}{topic.subtopic ? <span className="block text-xs text-ink/60">{topic.subtopic}</span> : null}</td><td className="px-2 py-3 text-ink/70">{topic.strand ?? "—"}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-lg bg-paper p-3 text-sm text-ink/70">No topics are listed for this term.</p>}</Panel> : null}

    <div className="grid gap-4 md:grid-cols-2">
      <Panel className="space-y-3"><div><p className="text-sm font-semibold text-leaf">On this phone</p><h2 className="font-display text-2xl">Save the curriculum</h2><p className="mt-1 text-sm text-ink/75">One tap writes a PDF into your phone’s downloads. It is the strand and sub-strand plan already on this page, not a rehosted official KICD file. Check the printed design before you teach.</p></div><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass("leaf")} onClick={() => void saveSubjectFile()}>Save {subject}</button><button type="button" className={buttonClass("ink")} onClick={() => void saveGradeFile()}>Save every learning area in {grade}</button></div>{officialSources.length ? <p className="text-xs text-ink/60">Official KICD files stay on KICD. Open them there if you need the published PDF.</p> : null}<div className="flex flex-wrap gap-3 text-sm font-semibold"><a href={gradeDesignPage} target="_blank" rel="noreferrer" className="text-leaf underline">Open {grade} at KICD</a><a href={KICD_INDEX} target="_blank" rel="noreferrer" className="text-leaf underline">All KICD curriculum designs</a></div></Panel>
      <Panel><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl">Source notes</h2><p className="mt-1 text-sm text-ink/75">Use the linked design as the final check. Term allocation is a helpful planning view, not text printed in the designs.</p></div><a href={KICD_INDEX} target="_blank" rel="noreferrer" className="text-sm font-semibold text-leaf underline">KICD curriculum index</a></div><ul className="mt-3 space-y-2">{(design?.sources ?? kicdSourceLinks().map((item) => item.href)).map((source) => <li key={source}><a href={source} target="_blank" rel="noreferrer" className="break-all text-sm text-leaf underline">{source}</a></li>)}</ul></Panel>
    </div>

    {level === "junior" || level === "senior" ? <Panel><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-2xl">Secondary workflow upgrades</h2><p className="mt-1 text-sm text-ink/70">These checks are built into the curriculum, creation and library flows.</p></div><span className="rounded-full bg-leaf/15 px-2.5 py-1 text-xs font-semibold text-leaf">{SECONDARY_QUALITY_UPGRADES.length} upgrades</span></div><ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{SECONDARY_QUALITY_UPGRADES.map((item) => <li key={item} className="rounded-lg bg-paper px-3 py-2">✓ {item}</li>)}</ul></Panel> : null}

    <section className="rounded-xl bg-ink p-4 text-paper"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gold">Coverage in this browser</p><p className="mt-1 text-sm text-paper/75">The transcribed KICD layer grows over time. Starter strands remain editable.</p></div><a href={KICD_INDEX} target="_blank" rel="noreferrer" className="text-sm font-semibold text-gold underline">{kicdSourceLinks().length} source links</a></div><div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">{[[stat.designs, "designs"], [stat.strands, "strands"], [stat.subStrands, "sub-strands"], [stat.topics, "topics"], [stat.sources, "sources"]].map(([value, label]) => <div key={label} className="rounded-lg bg-paper/10 p-3"><p className="font-display text-2xl">{value}</p><p className="text-paper/70">{label}</p></div>)}</div></section>
    <p className="text-xs text-ink/60">Showing {strandsAreFromDesign(subject, grade) ? "published design strands" : "editable starter strands"} for {subject} · {KICD_DESIGNS.length} designs currently transcribed.</p>
  </div>;
}
