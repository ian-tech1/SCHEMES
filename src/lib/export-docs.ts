import type { DocumentBranding, GenerationProvenance, LessonBody, LessonPlanPackBody, NotesBody, RevisionBody, SchemeBody, SchemeLesson } from "@/lib/cbe-types";
import { bookCoverLine, columnLabel, columnsOrDefault, lessonCell, SCHEME_COLUMN_WEIGHTS, strandTrail, termWeekLabel } from "@/lib/scheme-format";
import { expandBrandingTokens } from "@/lib/branding";
import { answerLabel, letteredOptions, planSections } from "@/lib/question-plan";

export type ExportDoc = {
  kind: string;
  title: string;
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
  schoolName: string;
  teacherName: string;
  phone: string;
  stream: string;
  startFrom: string;
  endAt: string;
  level: string;
  body: unknown;
  /**
   * Header/footer this teacher's document prints with, already resolved by the
   * desk policy. Absent means the built-in product line, so nothing that used to
   * print stops printing.
   */
  branding?: DocumentBranding;
  /**
   * Learner copies of revision and exam papers omit answers and marking.
   * Notes always keep the worked solutions on a later page, as a textbook does.
   */
  copy?: "learner" | "teacher";
};

const INK: [number, number, number] = [28, 49, 68];
const LEAF: [number, number, number] = [31, 107, 69];

/**
 * Column widths, as weights of the printable width.
 *
 * autoTable's automatic sizing gives every column an equal share, which is why
 * the old export squeezed "SPECIFIC LEARNING OUTCOMES" into the same width as
 * "WK" and let long text run over the next column. Long text columns get the
 * room; week, lesson and reflection stay narrow.
 */
function columnWidths(columns: string[], printable: number): Record<number, { cellWidth: number }> {
  const total = columns.reduce((sum, id) => sum + (SCHEME_COLUMN_WEIGHTS[id] ?? 8), 0) || 1;
  const widths: Record<number, { cellWidth: number }> = {};
  columns.forEach((id, index) => {
    widths[index] = { cellWidth: (printable * (SCHEME_COLUMN_WEIGHTS[id] ?? 8)) / total };
  });
  return widths;
}

function slug(doc: ExportDoc): string {
  const book = scheme(doc.body).bookLine.split("·")[0]?.trim() ?? "";
  const raw = `${doc.grade}-${doc.subject}-${book}-${doc.term}-${doc.year}-${doc.kind}`;
  return raw.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function lines(items: string[]): string {
  return items.filter(Boolean).join("\n");
}

function generationInfo(body: unknown): GenerationProvenance | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as { generationProvenance?: GenerationProvenance }).generationProvenance;
  return value && typeof value === "object" ? value : undefined;
}

function scheme(body: unknown): SchemeBody {
  const b = (body ?? {}) as SchemeBody;
  return {
    overview: b.overview ?? "",
    csl: b.csl ?? "",
    weeks: b.weeks ?? [],
    lessons: b.lessons ?? [],
    columns: columnsOrDefault(b.columns),
    textbooks: b.textbooks ?? [],
    bookLine: b.bookLine ?? "",
    termStart: b.termStart ?? "",
    halfTermStart: b.halfTermStart ?? "",
    halfTermEnd: b.halfTermEnd ?? "",
    lessonMinutes: b.lessonMinutes ?? 40,
    reflectionMode: b.reflectionMode === "prompt" ? "prompt" : "blank",
    coverNote: b.coverNote ?? "",
    safetyNote: b.safetyNote ?? "",
    showApproval: b.showApproval !== false,
    tocPhotos: b.tocPhotos ?? [],
    learners: b.learners ?? 0,
    boys: b.boys ?? 0,
    girls: b.girls ?? 0,
    hodName: b.hodName ?? "",
    preparedOn: b.preparedOn ?? "",
    doubleLesson: b.doubleLesson ?? 0,
    homeworkDay: b.homeworkDay ?? "",
    room: b.room ?? "",
  };
}

function schemeLessons(doc: ExportDoc, data: SchemeBody): SchemeLesson[] {
  if (data.lessons?.length) return data.lessons;
  return (data.weeks ?? []).flatMap((week) => {
    const count = Math.max(1, doc.lessonsPerWeek || week.lessonHints.length || 1);
    return Array.from({ length: count }, (_, index) => ({
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
      minutes: 40,
    }));
  });
}

function lesson(body: unknown): LessonBody {
  return (body ?? {}) as LessonBody;
}

function lessonPack(body: unknown): LessonPlanPackBody | null {
  return body && typeof body === "object" && Array.isArray((body as LessonPlanPackBody).lessonPlans) ? body as LessonPlanPackBody : null;
}

function notes(body: unknown): NotesBody {
  return (body ?? {}) as NotesBody;
}

/**
 * The paper as it should print: one block per section, each carrying its own
 * heading, instruction, question count and marks, then the numbered rows.
 * Shared by the PDF and Word builders so both files look like the same paper.
 */
type PaperBlock = { name: string; instruction: string; note: string; rows: string[][] };

function learnerPaper(doc: ExportDoc): boolean {
  return doc.copy === "learner" && (doc.kind === "revision" || doc.kind === "exam");
}

function paperBlocks(data: RevisionBody, learner = false): PaperBlock[] {
  const questions = [...(data.questions ?? [])].sort((a, b) => a.number - b.number);
  const sections = planSections(questions);
  return sections.map((section) => {
    const group = section.types.length
      ? questions.filter((q) => section.types.includes((q.type || "short") as (typeof section.types)[number]))
      : questions;
    const marks = group.reduce((sum, q) => sum + (q.marks || 0), 0);
    return {
      name: section.name,
      instruction: section.instruction,
      note: `Questions ${section.from} to ${section.to} — ${group.length} question${group.length === 1 ? "" : "s"}, ${marks} mark${marks === 1 ? "" : "s"}.`,
      rows: group.map((q) => {
        const options = q.options?.length ? `\n${letteredOptions(q.options).join("\n")}` : "";
        const prompt = `${q.prompt}${options}`;
        if (learner) return [String(q.number), prompt, String(q.marks)];
        return [
          String(q.number),
          prompt,
          String(q.marks),
          [`Answer: ${answerLabel(q.answer) || "See marking guidance"}`, q.marking].filter(Boolean).join("\n"),
        ];
      }),
    };
  });
}

function examFurniture(data: RevisionBody, learner: boolean): string[] {
  const questions = [...(data.questions ?? [])].sort((a, b) => a.number - b.number);
  const total = data.totalMarks ?? questions.reduce((sum, question) => sum + (question.marks || 0), 0);
  const sections = planSections(questions);
  const lines = [
    "School practice paper. Not issued by KNEC and not a KICD examination.",
    `Time allowed: ${data.timeMinutes ?? "as instructed"} minutes. Total marks: ${total}. Answer all questions.`,
    "Name: ________________________    Class: __________    Admission no.: __________",
    "Table of specification",
    ...sections.map((section) => `${section.name}: questions ${section.from}–${section.to}, ${section.marks} marks.`),
  ];
  const objective = questions.filter((question) => question.type === "mcq" || question.type === "true-false");
  if (objective.length) {
    lines.push(learner ? "Objective answer grid. Write one letter in each space." : "Objective key");
    const cells = objective.map((question) => {
      const label = answerLabel(question.answer);
      const letter = /^([A-D])\b/.exec(label)?.[1] ?? (learner ? "" : label.slice(0, 12));
      return `${question.number}. ${learner ? "____" : letter || "—"}`;
    });
    for (let index = 0; index < cells.length; index += 8) lines.push(cells.slice(index, index + 8).join("    "));
  }
  if (!learner) {
    lines.push("CBC performance bands for school reporting, not a KNEC grade: Exceeds Expectations 80–100%, Meets Expectations 60–79%, Approaches Expectations 40–59%, Below Expectations under 40%.");
  }
  return lines;
}

function paper(body: unknown): RevisionBody {
  return (body ?? {}) as RevisionBody;
}

function coverLines(doc: ExportDoc): string[] {
  return [
    doc.schoolName || "School",
    doc.stream ? `${doc.grade} ${doc.stream}` : doc.grade,
    doc.subject,
    `${doc.strand} — ${doc.substrand}`,
    `${doc.term} ${doc.year}`,
    doc.pathway ? `Pathway: ${doc.pathway}` : "",
    `Teacher: ${doc.teacherName || "Teacher"}`,
    doc.phone ? `Phone: ${doc.phone}` : "",
    `From: ${doc.startFrom || "Start of sub-strand"}`,
    `To: ${doc.endAt || "End of sub-strand"}`,
  ].filter(Boolean);
}

/** Fill `{school}`, `{grade}` … tokens with this document's own values. */
function brandValues(doc: ExportDoc) {
  return {
    schoolName: doc.schoolName,
    teacherName: doc.teacherName,
    grade: doc.grade,
    subject: doc.subject,
    term: doc.term,
    year: doc.year,
  };
}

/** The two lines a page is printed with, after the teacher's choice and the policy. */
function brandLines(doc: ExportDoc): { header: string; footer: string; logo: string } {
  const branding = doc.branding;
  if (!branding) {
    return {
      header: "IAN TECH SCHEMES  ·  Kenya CBE",
      footer: "School document prepared with IAN TECH Schemes. Not issued by KICD or KNEC.",
      logo: "",
    };
  }
  return {
    header: branding.showHeader ? expandBrandingTokens(branding.headerText, brandValues(doc)) : "",
    footer: branding.showFooter ? expandBrandingTokens(branding.footerText, brandValues(doc)) : "",
    logo: branding.logoDataUrl || "",
  };
}

/** Logo needs a size that keeps its own shape, not a stretched square. */
function logoSize(pdf: import("jspdf").jsPDF, dataUrl: string, boxHeight: number): { width: number; height: number } | null {
  try {
    const props = pdf.getImageProperties(dataUrl);
    const ratio = Number(props.width) / Math.max(1, Number(props.height));
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    const height = boxHeight;
    return { height, width: Math.min(24, height * ratio) };
  } catch {
    return null;
  }
}

function logoFormat(dataUrl: string): "PNG" | "JPEG" | "WEBP" {
  if (/^data:image\/jpeg/i.test(dataUrl) || /^data:image\/jpg/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
}

async function buildPdf(doc: ExportDoc): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const landscape = doc.kind === "scheme";
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(...LEAF);
  pdf.rect(0, 0, pageWidth, 16, "F");
  pdf.setTextColor(244, 239, 228);
  const brand = brandLines(doc);
  const mark = brand.logo ? logoSize(pdf, brand.logo, 8) : null;
  if (mark) {
    try {
      pdf.addImage(brand.logo, logoFormat(brand.logo), 10, 5, mark.width, mark.height);
    } catch {
      /* a broken data URL must never stop a download */
    }
  }
  pdf.setFontSize(11);
  if (brand.header) pdf.text(brand.header, mark ? 10 + mark.width + 4 : 10, 10, { maxWidth: pageWidth - (mark ? 24 : 14) });
  pdf.setTextColor(...INK);
  pdf.setFontSize(16);
  pdf.text(doc.title, 10, 26, { maxWidth: pageWidth - 20 });
  let y = 34;
  pdf.setFontSize(10);
  for (const line of coverLines(doc)) {
    pdf.text(line, 10, y);
    y += 5;
  }
  y += 2;

  if (doc.kind === "scheme") {
    const data = scheme(doc.body);
    const lessons = schemeLessons(doc, data);
    const headers = data.columns.map(columnLabel);
    const banner = `SCHEME OF WORK – ${doc.subject.toUpperCase()} ${doc.grade.toUpperCase()} | ${doc.term.toUpperCase()} | ${(data.bookLine || doc.subject).toUpperCase()}`;
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    const titleLines = pdf.splitTextToSize(banner, pageWidth - 20);
    pdf.text(titleLines, 10, y);
    y += titleLines.length * 5 + 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const meta = `School: ${doc.schoolName || "—"}    Teacher: ${doc.teacherName || "—"}    Year: ${doc.year}    ${termWeekLabel(doc.term, doc.weekFrom, doc.weekTo)}`;
    pdf.text(pdf.splitTextToSize(meta, pageWidth - 20), 10, y);
    y += 6;
    const books = bookCoverLine(data.textbooks);
    if (books) {
      const bookLines = pdf.splitTextToSize(`Textbooks: ${books}`, pageWidth - 20);
      pdf.text(bookLines, 10, y);
      y += bookLines.length * 4 + 1;
    }
    if (data.coverNote) {
      pdf.text(pdf.splitTextToSize(data.coverNote, pageWidth - 20), 10, y);
      y += 5;
    }
    const classLine = [
      doc.stream ? `Stream: ${doc.stream}` : "",
      data.room ? `Room: ${data.room}` : "",
      data.learners ? `Learners: ${data.learners}` : "",
      data.boys || data.girls ? `Boys ${data.boys || 0}, girls ${data.girls || 0}` : "",
      doc.phone ? `Phone: ${doc.phone}` : "",
    ].filter(Boolean).join("    ");
    if (classLine) {
      pdf.text(pdf.splitTextToSize(classLine, pageWidth - 20), 10, y);
      y += 5;
    }
    const minutes = [
      data.doubleLesson
        ? `Lesson ${data.doubleLesson} is 80 minutes. The other lessons are 40 minutes.`
        : `Each lesson is ${data.lessonMinutes || 40} minutes.`,
      `${doc.lessonsPerWeek} lessons each week.`,
      data.homeworkDay ? `Homework goes home on ${data.homeworkDay}.` : "",
      data.preparedOn ? `Prepared ${data.preparedOn}.` : "",
      data.halfTermStart ? `Half term ${data.halfTermStart}${data.halfTermEnd ? ` to ${data.halfTermEnd}` : ""}.` : "",
      `Strand: ${doc.strand}.`,
    ].filter(Boolean).join(" ");
    pdf.text(pdf.splitTextToSize(minutes, pageWidth - 20), 10, y);
    y += 6;
    const printable = pageWidth - 20;
    autoTable(pdf, {
      startY: y,
      head: [headers],
      body: lessons.map((row) => data.columns.map((column) => lessonCell(row, column))),
      // Fixed widths: text wraps inside its own column instead of spilling over
      // the neighbour (the fault in the old export).
      tableWidth: printable,
      margin: { left: 10, right: 10 },
      columnStyles: columnWidths(data.columns, printable),
      styles: { fontSize: 6.6, cellPadding: 1, textColor: INK, overflow: "linebreak", valign: "top", lineWidth: 0.1 },
      headStyles: { fillColor: [22, 50, 84], textColor: [244, 239, 228], fontSize: 6.4, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 244, 236] },
      didParseCell: (hook) => {
        // Week and lesson stay centred and narrow; every other cell is left aligned.
        if (hook.column.index < 2) hook.cell.styles.halign = "center";
      },
      theme: "grid",
      showHead: "everyPage",
    });
    const after = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    let yy = after + 6;
    const tail = [
      data.overview,
      data.csl ? `Beyond the classroom: ${data.csl}` : "",
      data.safetyNote,
      ...(data.qualityReport ? [
        `Planning completeness review: ${data.qualityReport.checks.filter((item) => item.passed).length}/${data.qualityReport.checks.length} checks populated.`,
        ...data.qualityReport.checks.map((item) => `${item.passed ? "POPULATED" : "REVIEW NEEDED"}: ${item.label} — ${item.detail}`),
        `Source: ${data.qualityReport.source}`,
        data.qualityReport.notice,
      ] : []),
      data.showApproval
        ? `Teacher: ____________________    HOD${data.hodName ? ` (${data.hodName})` : ""}: ____________________    Deputy / Head: ____________________    Date: __________`
        : "",
    ].filter(Boolean);
    pdf.setFontSize(9);
    for (const line of tail) {
      const split = pdf.splitTextToSize(line, pageWidth - 20);
      if (yy > pdf.internal.pageSize.getHeight() - 16) {
        pdf.addPage();
        yy = 16;
      }
      pdf.text(split, 10, yy);
      yy += split.length * 4 + 2;
    }
  } else if (doc.kind === "lesson") {
    const pack = lessonPack(doc.body);
    const plans = pack?.lessonPlans ?? [{ week: doc.weekFrom, lesson: 1, body: lesson(doc.body) }];
    let yy = y;
    pdf.setFontSize(10);
    const writeBlock = (block: string, fontSize = 10) => {
      pdf.setFontSize(fontSize);
      const split = pdf.splitTextToSize(block, pageWidth - 20);
      if (yy > pdf.internal.pageSize.getHeight() - 16) { pdf.addPage(); yy = 16; }
      pdf.text(split, 10, yy);
      yy += split.length * 5 + 2;
    };
    if (pack) {
      writeBlock(pack.summary, 11);
      const passed = pack.qualityReport?.checks.filter((item) => item.passed).length ?? 0;
      if (pack.qualityReport) {
        writeBlock(`Planning completeness review: ${passed}/${pack.qualityReport.checks.length} checks populated. ${pack.qualityReport.notice}`);
      }
    }
    for (const item of plans) {
      const data = item.body;
      if (pack) writeBlock(`WEEK ${item.week} · LESSON ${item.lesson} · ${data.weekLabel}`, 12);
      for (const block of [
        `Duration: ${data.duration || "40 minutes"} · ${data.weekLabel || ""}`,
        `Outcomes: ${lines(data.outcomes)}`,
        `Inquiry: ${lines(data.inquiry)}`,
        `Resources: ${lines(data.resources)}`,
        ...(data.competencies?.length ? [`Core competencies: ${lines(data.competencies)}`] : []),
        ...(data.values?.length ? [`Values: ${lines(data.values)}`] : []),
        ...(data.pcis?.length ? [`Pertinent and contemporary issues: ${lines(data.pcis)}`] : []),
      ]) writeBlock(block);
      autoTable(pdf, {
        startY: yy,
        head: [["Phase", "Min", "Teacher", "Learners"]],
        body: (data.steps ?? []).map((s) => [s.phase, String(s.minutes), s.teacher, s.learners]),
        styles: { fontSize: 9, textColor: INK, valign: "top" },
        headStyles: { fillColor: LEAF, textColor: [244, 239, 228] },
        theme: "grid",
      });
      yy = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yy) + 8;
      for (const line of [
        `Support: ${data.support || "—"}`,
        `Extension: ${data.extension || "—"}`,
        `Assessment: ${data.assessment || "—"}`,
        ...(data.rubric ?? []).map((r) => `${r.level}: ${r.descriptor}`),
        `Homework: ${data.homework || "—"}`,
        `Reflection: ${data.reflection || "—"}`,
      ]) writeBlock(line);
    }
  } else if (doc.kind === "notes") {
    const data = notes(doc.body);
    let yy = y;
    const writeLine = (value: string, bold = false, size = 11) => {
      for (const part of value.split("\n")) {
        if (!part.trim()) continue;
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        const split = pdf.splitTextToSize(part, pageWidth - 20);
        const lineHeight = size > 12 ? 6 : 5;
        if (yy + split.length * lineHeight > pdf.internal.pageSize.getHeight() - 16) {
          pdf.addPage();
          yy = 18;
        }
        pdf.text(split, 10, yy);
        yy += split.length * lineHeight + (bold ? 2 : 1.5);
      }
    };
    writeLine("Chapter notes", true, 13);
    writeLine(data.summary || "");
    if (data.contents?.length) {
      writeLine("Contents", true, 12);
      data.contents.forEach((item) => writeLine(`${item.strand} · ${item.substrand} …… ${item.page}`));
    }
    if (data.objectives?.length) {
      writeLine("By the end of this chapter", true, 12);
      data.objectives.forEach((item, index) => writeLine(`${index + 1}. ${item}`));
    }
    if (data.prerequisite) {
      writeLine("Before you start", true, 12);
      writeLine(data.prerequisite);
    }
    if (data.vocabulary?.length) {
      writeLine("Words to know", true, 12);
      autoTable(pdf, {
        startY: yy,
        head: [["Term", "Meaning"]],
        body: data.vocabulary.map((item) => [item.term, item.meaning]),
        styles: { fontSize: 10, textColor: INK, valign: "top" },
        headStyles: { fillColor: LEAF, textColor: [244, 239, 228] },
        margin: { top: 16, bottom: 16 },
      });
      yy = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yy) + 8;
    }
    for (const section of data.sections ?? []) {
      writeLine(section.heading, true, 13);
      for (const paragraph of section.paragraphs ?? []) writeLine(paragraph);
      (section.examples ?? []).forEach((example, index) => {
        writeLine(section.examples.length > 1 ? `Worked example ${index + 1}` : "Worked example", true, 11);
        writeLine(example);
      });
    }
    if (data.tryThis?.length) {
      writeLine("Exercise", true, 13);
      data.tryThis.forEach((item, index) => writeLine(`${index + 1}. ${item.replace(/^\d+\.\s*/, "")}`));
    }
    if (data.remember?.length) {
      writeLine("Remember", true, 12);
      data.remember.forEach((item) => writeLine(`• ${item}`));
    }
    if (data.mistakes?.length) {
      writeLine("Common mistakes", true, 12);
      data.mistakes.forEach((item) => writeLine(item));
    }
    if (data.answerKey?.length) {
      pdf.addPage();
      yy = 18;
      writeLine("Answers to the exercise", true, 14);
      if (data.answerKeyNote) writeLine(data.answerKeyNote);
      data.answerKey.forEach((answer, index) => writeLine(`${index + 1}. ${answer}`));
    }
  } else {
    const data = paper(doc.body);
    pdf.setFontSize(11);
    const learner = learnerPaper(doc);
    for (const line of examFurniture(data, learner)) {
      const wrapped = pdf.splitTextToSize(line, pageWidth - 20);
      if (y + wrapped.length * 5 > pdf.internal.pageSize.getHeight() - 16) {
        pdf.addPage();
        y = 16;
      }
      pdf.text(wrapped, 10, y);
      y += wrapped.length * 5 + 1.5;
    }
    y += 2;
    const intro = pdf.splitTextToSize(data.instructions || "", pageWidth - 20);
    pdf.text(intro, 10, y);
    y += intro.length * 5 + 4;
    for (const note of [data.coverageGrades?.length ? `Selected source-grade coverage: ${data.coverageGrades.join(", ")}` : "", data.qualityNotice ?? ""].filter(Boolean)) {
      const lines = pdf.splitTextToSize(note, pageWidth - 20);
      pdf.text(lines, 10, y);
      y += lines.length * 5 + 3;
    }
    for (const block of paperBlocks(data, learner)) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      const heading = pdf.splitTextToSize(`${block.name} — ${block.instruction}`, pageWidth - 20);
      pdf.text(heading, 10, y);
      y += heading.length * 5 + 2;
      pdf.setFont("helvetica", "normal");
      const note = pdf.splitTextToSize(block.note, pageWidth - 20);
      pdf.text(note, 10, y);
      y += note.length * 4.5 + 3;
      autoTable(pdf, {
        startY: y,
        head: [learner ? ["No.", "Question", "Marks"] : ["No.", "Question", "Marks", "Marking"]],
        body: block.rows,
        styles: { fontSize: 9, textColor: INK, valign: "top" },
        headStyles: { fillColor: LEAF, textColor: [244, 239, 228] },
        margin: { top: 14, bottom: 16 },
      });
      y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10;
    }
    if (!learner && (data.questions ?? []).some((question) => question.answer)) {
      pdf.addPage();
      let yy = 18;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(...INK);
      pdf.text("Answer sheet", 10, yy);
      yy += 8;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      for (const question of [...(data.questions ?? [])].sort((a, b) => a.number - b.number)) {
        const line = `${question.number}. ${answerLabel(question.answer) || "—"}${question.marking ? ` — ${question.marking}` : ""}`;
        const wrapped = pdf.splitTextToSize(line, pageWidth - 20);
        if (yy + wrapped.length * 5 > pdf.internal.pageSize.getHeight() - 16) {
          pdf.addPage();
          yy = 18;
        }
        pdf.text(wrapped, 10, yy);
        yy += wrapped.length * 5 + 2;
      }
    }
  }

  const provenance = generationInfo(doc.body);
  if (provenance) {
    pdf.addPage();
    let yy = 16;
    const writeInfo = (value: string, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
      pdf.setFontSize(9);
      const wrapped = pdf.splitTextToSize(value, pageWidth - 20);
      if (yy + wrapped.length * 4.5 > pdf.internal.pageSize.getHeight() - 14) { pdf.addPage(); yy = 16; }
      pdf.text(wrapped, 10, yy);
      yy += wrapped.length * 4.5 + 3;
    };
    writeInfo("Generation, sources and reuse terms", true);
    writeInfo(provenance.label, true);
    writeInfo(provenance.notice);
    if (provenance.sources.length) {
      writeInfo("Sources:", true);
      for (const source of provenance.sources) writeInfo(`${source.title}\n${source.url}\n${source.license}`);
    }
    if (provenance.licenseNotice) writeInfo(provenance.licenseNotice);
  }

  const pages = pdf.getNumberOfPages();
  const trail = doc.kind === "scheme" ? strandTrail(schemeLessons(doc, scheme(doc.body))) : "";
  pdf.setFont("helvetica", "normal");
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setTextColor(90, 100, 110);
    const foot = trail ? `Page ${i} of ${pages}  |  ${trail}` : `${i} / ${pages}`;
    if (brand.footer) pdf.text(brand.footer, 10, pdf.internal.pageSize.getHeight() - 8, { maxWidth: pageWidth - 16 });
    pdf.text(foot, 10, pdf.internal.pageSize.getHeight() - 4, { maxWidth: pageWidth - 16 });
    // The header is a page decoration, so it repeats on every page — unless the
    // teacher was granted permission to remove it.
    if (brand.header && i > 1) {
      pdf.setFontSize(8);
      pdf.setTextColor(31, 107, 69);
      if (mark) {
        try {
          pdf.addImage(brand.logo, logoFormat(brand.logo), 10, 5, mark.width * 0.8, mark.height * 0.8);
        } catch {
          /* ignore */
        }
      }
      pdf.text(brand.header, mark ? 10 + mark.width * 0.8 + 4 : 10, 9, { maxWidth: pageWidth - 20 });
      pdf.setTextColor(90, 100, 110);
    }
  }
  return pdf.output("blob");
}


async function buildDocx(doc: ExportDoc): Promise<Blob> {
  const docx = await import("docx");
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
    WidthType, BorderStyle, PageOrientation, Header, Footer, AlignmentType, ImageRun, PageBreak,
  } = docx;
  const brand = brandLines(doc);
  // Word only accepts raster images it can decode, so a WebP logo is skipped
  // rather than producing a file Word refuses to open.
  const logoData = /^(data:image\/png|data:image\/jpe?g)/i.test(brand.logo)
    ? (brand.logo.split(",")[1] ?? "")
    : "";
  const logoRun = logoData
    ? new ImageRun({
        data: logoData,
        transformation: { width: brand.logo.includes("png") ? 34 : 30, height: 16 },
        type: brand.logo.includes("png") ? "png" : "jpg",
      })
    : null;
  const brandLine = (text: string, colour: string, bold: boolean) =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        ...(logoRun ? [logoRun] : []),
        new TextRun({ text: text || " ", bold, color: colour, size: 16 }),
      ],
    });

  const cell = (value: string, header = false, width = 20) =>
    new TableCell({
      width: { size: width, type: WidthType.PERCENTAGE },
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
      shading: header ? { fill: "163254" } : undefined,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "E3D7C4" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "E3D7C4" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "E3D7C4" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "E3D7C4" },
      },
      children: (value || "—").split("\n").map((line) => new Paragraph({
        children: [new TextRun({ text: line || " ", bold: header, color: header ? "F4EFE4" : "1C3144", size: 16 })],
      })),
    });

  const p = (text: string, bold = false) =>
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text, bold, color: "1C3144", size: 22 })],
    });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: doc.title, color: "1C3144" })],
    }),
    ...coverLines(doc).map((line) => p(line)),
  ];

  if (doc.kind === "scheme") {
    const data = scheme(doc.body);
    const lessons = schemeLessons(doc, data);
    const headers = data.columns.map(columnLabel);
    const width = Math.floor(100 / Math.max(1, headers.length));
    const banner = `SCHEME OF WORK – ${doc.subject.toUpperCase()} ${doc.grade.toUpperCase()} | ${doc.term.toUpperCase()} | ${(data.bookLine || doc.subject).toUpperCase()}`;
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: banner, color: "163254" })],
    }));
    children.push(p(`School: ${doc.schoolName || "—"}    Teacher: ${doc.teacherName || "—"}    Year: ${doc.year}    ${termWeekLabel(doc.term, doc.weekFrom, doc.weekTo)}`, true));
    const books = bookCoverLine(data.textbooks);
    if (books) children.push(p(`Textbooks: ${books}`));
    if (data.coverNote) children.push(p(data.coverNote));
    children.push(p(`Each lesson is ${data.lessonMinutes || 40} minutes. ${doc.lessonsPerWeek} lessons each week.`));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: headers.map((header) => cell(header, true, width)),
          }),
          ...lessons.map(
            (row) =>
              new TableRow({
                children: data.columns.map((column) => cell(lessonCell(row, column), false, width)),
              }),
          ),
        ],
      }),
    );
    if (data.overview) children.push(p(data.overview));
    if (data.csl) children.push(p(`Beyond the classroom: ${data.csl}`));
    if (data.safetyNote) children.push(p(data.safetyNote));
    if (data.qualityReport) {
      children.push(p(`Planning completeness review: ${data.qualityReport.checks.filter((item) => item.passed).length}/${data.qualityReport.checks.length} checks populated.`, true));
      for (const item of data.qualityReport.checks) children.push(p(`${item.passed ? "POPULATED" : "REVIEW NEEDED"}: ${item.label} — ${item.detail}`));
      children.push(p(`Source: ${data.qualityReport.source}`));
      children.push(p(data.qualityReport.notice));
    }
    const trail = strandTrail(lessons);
    if (trail) children.push(p(trail));
    if (data.showApproval) {
      children.push(p(`Teacher: ____________________    HOD${data.hodName ? ` (${data.hodName})` : ""}: ____________________    Deputy / Head: ____________________    Date: __________`));
    }
  } else if (doc.kind === "lesson") {
    const pack = lessonPack(doc.body);
    const plans = pack?.lessonPlans ?? [{ week: doc.weekFrom, lesson: 1, body: lesson(doc.body) }];
    if (pack) {
      children.push(p(pack.summary));
      if (pack.qualityReport) {
        const passed = pack.qualityReport.checks.filter((item) => item.passed).length;
        children.push(p(`Planning completeness review: ${passed}/${pack.qualityReport.checks.length} checks populated. ${pack.qualityReport.notice}`, true));
      }
    }
    for (const item of plans) {
      const data = item.body;
      if (pack) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `Week ${item.week} · Lesson ${item.lesson} · ${data.weekLabel}`, color: "163254" })] }));
      children.push(p(`${data.duration || "40 minutes"} · ${data.weekLabel || ""}`, true));
      children.push(p(`Outcomes: ${lines(data.outcomes)}`));
      children.push(p(`Inquiry: ${lines(data.inquiry)}`));
      children.push(p(`Resources: ${lines(data.resources)}`));
      if (data.competencies?.length) children.push(p(`Core competencies: ${lines(data.competencies)}`));
      if (data.values?.length) children.push(p(`Values: ${lines(data.values)}`));
      if (data.pcis?.length) children.push(p(`Pertinent and contemporary issues: ${lines(data.pcis)}`));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ tableHeader: true, children: ["Phase", "Min", "Teacher", "Learners"].map((h) => cell(h, true)) }),
          ...(data.steps ?? []).map((s) => new TableRow({ children: [cell(s.phase), cell(String(s.minutes)), cell(s.teacher), cell(s.learners)] })),
        ],
      }));
      children.push(p(`Support: ${data.support || "—"}`));
      children.push(p(`Extension: ${data.extension || "—"}`));
      children.push(p(`Assessment: ${data.assessment || "—"}`));
      for (const r of data.rubric ?? []) children.push(p(`${r.level}: ${r.descriptor}`));
      children.push(p(`Homework: ${data.homework || "—"}`));
      children.push(p(`Reflection: ${data.reflection || "—"}`));
    }
  } else if (doc.kind === "notes") {
    const data = notes(doc.body);
    const heading = (text: string) => new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text, color: "1F6B45" })],
    });
    const pushBlock = (value: string, bold = false) => {
      for (const part of value.split("\n")) {
        if (part.trim()) children.push(p(part, bold));
      }
    };
    children.push(heading("Chapter notes"));
    pushBlock(data.summary || "");
    if (data.contents?.length) {
      children.push(heading("Contents"));
      data.contents.forEach((item) => children.push(p(`${item.strand} · ${item.substrand} …… ${item.page}`)));
    }
    if (data.objectives?.length) {
      children.push(heading("By the end of this chapter"));
      data.objectives.forEach((item, index) => children.push(p(`${index + 1}. ${item}`)));
    }
    if (data.prerequisite) {
      children.push(heading("Before you start"));
      pushBlock(data.prerequisite);
    }
    if (data.vocabulary?.length) {
      children.push(heading("Words to know"));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: [cell("Term", true, 30), cell("Meaning", true, 70)] }),
            ...data.vocabulary.map((item) => new TableRow({ children: [cell(item.term, false, 30), cell(item.meaning, false, 70)] })),
          ],
        }),
      );
    }
    for (const section of data.sections ?? []) {
      children.push(heading(section.heading));
      for (const para of section.paragraphs ?? []) pushBlock(para);
      (section.examples ?? []).forEach((example, index) => {
        children.push(p((section.examples?.length ?? 0) > 1 ? `Worked example ${index + 1}` : "Worked example", true));
        pushBlock(example);
      });
    }
    if (data.tryThis?.length) {
      children.push(heading("Exercise"));
      data.tryThis.forEach((item, index) => children.push(p(`${index + 1}. ${item.replace(/^\d+\.\s*/, "")}`)));
    }
    if (data.remember?.length) {
      children.push(heading("Remember"));
      for (const item of data.remember) children.push(p(item));
    }
    if (data.mistakes?.length) {
      children.push(heading("Common mistakes"));
      for (const item of data.mistakes) children.push(p(item));
    }
    if (data.answerKey?.length) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(heading("Answers to the exercise"));
      if (data.answerKeyNote) pushBlock(data.answerKeyNote);
      data.answerKey.forEach((answer, index) => pushBlock(`${index + 1}. ${answer}`));
    }
  } else {
    const data = paper(doc.body);
    const learner = learnerPaper(doc);
    for (const line of examFurniture(data, learner)) children.push(p(line, line.startsWith("Table") || line.startsWith("Objective") || line.startsWith("CBC")));
    children.push(p(data.instructions || ""));
    if (learner) children.push(p("Learner copy. Answers are not printed on this file.", true));
    if (data.coverageGrades?.length) children.push(p(`Selected source-grade coverage: ${data.coverageGrades.join(", ")}`, true));
    if (data.qualityNotice) children.push(p(data.qualityNotice, true));
    const total = (data.questions ?? []).reduce((sum, q) => sum + (q.marks || 0), 0);
    children.push(p(`Total marks: ${total}${data.timeMinutes ? ` in about ${data.timeMinutes} minutes` : ""}`, true));
    const heads = learner ? ["No.", "Question", "Marks"] : ["No.", "Question", "Marks", "Marking"];
    for (const block of paperBlocks(data, learner)) {
      children.push(p(`${block.name} — ${block.instruction}`, true));
      children.push(p(block.note));
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: heads.map((header) => cell(header, true)),
            }),
            ...block.rows.map((row) => new TableRow({
              children: row.map((value) => cell(String(value))),
            })),
          ],
        }),
      );
    }
    if (!learner && (data.questions ?? []).some((question) => question.answer)) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(p("Answer sheet", true));
      for (const question of [...(data.questions ?? [])].sort((a, b) => a.number - b.number)) {
        children.push(p(`${question.number}. ${answerLabel(question.answer) || "—"}${question.marking ? ` — ${question.marking}` : ""}`));
      }
    }
  }

  const provenance = generationInfo(doc.body);
  if (provenance) {
    children.push(p("Generation, sources and reuse terms", true));
    children.push(p(`${provenance.label}\n${provenance.notice}`));
    for (const source of provenance.sources) children.push(p(`Source: ${source.title}\n${source.url}\n${source.license}`));
    if (provenance.licenseNotice) children.push(p(provenance.licenseNotice));
  }

  const file = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: doc.kind === "scheme" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
              width: doc.kind === "scheme" ? 16838 : 11906,
              height: doc.kind === "scheme" ? 11906 : 16838,
            },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        headers: {
          default: new Header({ children: [brandLine(brand.header, "1F6B45", true)] }),
        },
        footers: {
          default: new Footer({ children: [brandLine(brand.footer, "5C6B78", false)] }),
        },
        children,
      },
    ],
  });
  return Packer.toBlob(file);
}

export async function downloadDocument(doc: ExportDoc, format: "pdf" | "docx" | "both") {
  const base = `${slug(doc)}${doc.copy === "learner" ? "-learner" : ""}`;
  if (format === "pdf") {
    saveBlob(await buildPdf(doc), `${base}.pdf`);
    return;
  }
  if (format === "docx") {
    saveBlob(await buildDocx(doc), `${base}.docx`);
    return;
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(`${base}.pdf`, await buildPdf(doc));
  zip.file(`${base}.docx`, await buildDocx(doc));
  saveBlob(await zip.generateAsync({ type: "blob" }), `${base}.zip`);
}

/** The fields an export needs, as returned by `getDocument`. */
export type ExportSource = {
  kind: string;
  title: string;
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
  schoolName: string;
  teacherName: string;
  phone: string;
  stream: string;
  startFrom: string;
  endAt: string;
  level: string;
  body: unknown;
  /**
   * Header/footer this export prints with, resolved on the server from the
   * desk policy and this teacher's grant. Missing means the built-in line.
   */
  branding?: DocumentBranding;
};

/** Narrow a loaded document to what the PDF and Word builders read. */
export function toExportDoc(doc: ExportSource): ExportDoc {
  return {
    kind: doc.kind,
    title: doc.title,
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
    schoolName: doc.schoolName,
    teacherName: doc.teacherName,
    phone: doc.phone,
    stream: doc.stream,
    startFrom: doc.startFrom,
    endAt: doc.endAt,
    level: doc.level,
    body: doc.body,
    branding: doc.branding,
  };
}

export type PackFormat = "pdf" | "docx" | "both";

/**
 * One zip for a whole term: every document the teacher chose, in Word, PDF or
 * both. Each file sits in a folder named after its kind, so the staffroom
 * printer can open "schemes/" first and the lesson plans after that.
 */
export async function downloadPack(
  docs: ExportDoc[],
  format: PackFormat,
  name: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (!docs.length) throw new Error("There is nothing in this pack yet.");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Map<string, number>();
  let done = 0;
  for (const doc of docs) {
    const folder = doc.kind === "exam" ? "exams" : doc.kind === "revision" ? "revision-papers" : doc.kind === "lesson" ? "lesson-plans" : doc.kind === "notes" ? "notes" : "schemes";
    let base = slug(doc);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    if (seen) base = `${base}-${seen + 1}`;
    if (format === "pdf" || format === "both") zip.file(`${folder}/${base}.pdf`, await buildPdf(doc));
    if (format === "docx" || format === "both") zip.file(`${folder}/${base}.docx`, await buildDocx(doc));
    done += 1;
    onProgress?.(done, docs.length);
  }
  const safe = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "term-pack";
  saveBlob(await zip.generateAsync({ type: "blob" }), `${safe}.zip`);
}
