import type { SchemeLesson, SchemeTextbook, SchemeWeek, TopicSelection } from "@/lib/cbe-types";
import { flattenTopicSelections, lessonFocusAt } from "@/lib/curriculum-content";

export type SchemeColumn = { id: string; label: string };

/** Default staffroom table, matching the Champions Creative Arts layout. */
export const SCHEME_COLUMNS: SchemeColumn[] = [
  { id: "wk", label: "WK" },
  { id: "lsn", label: "LSN" },
  { id: "strand", label: "STRAND" },
  { id: "substrand", label: "SUB-STRAND" },
  { id: "outcomes", label: "SPECIFIC LEARNING OUTCOMES" },
  { id: "experiences", label: "LEARNING EXPERIENCES" },
  { id: "inquiry", label: "KEY INQUIRY QUESTIONS" },
  { id: "resources", label: "LEARNING RESOURCES" },
  { id: "assessment", label: "ASSESSMENT METHODS" },
  { id: "reflection", label: "REFLECTION" },
  { id: "competencies", label: "CORE COMPETENCIES" },
  { id: "values", label: "VALUES" },
  { id: "pcis", label: "PCIs" },
  { id: "homework", label: "HOMEWORK" },
];

/** Relative widths: long CBE narrative columns receive space; labels and tick columns stay narrow. */
export const SCHEME_COLUMN_WEIGHTS: Record<string, number> = {
  wk: 5, lsn: 5, strand: 10, substrand: 12, outcomes: 22, experiences: 24,
  inquiry: 13, resources: 13, assessment: 13, reflection: 9,
  competencies: 11, values: 8, pcis: 8, homework: 10,
};

export const DEFAULT_SCHEME_COLUMNS = [
  "wk",
  "lsn",
  "strand",
  "substrand",
  "outcomes",
  "experiences",
  "inquiry",
  "resources",
  "assessment",
  "reflection",
];

export const TEXTBOOKS: { id: string; title: string; publisher: string }[] = [
  { id: "smart-minds", title: "Smart Minds", publisher: "Smart Minds" },
  { id: "klb", title: "KLB", publisher: "Kenya Literature Bureau" },
  { id: "visionary", title: "Visionary", publisher: "KLB" },
  { id: "top-mark", title: "Top Mark", publisher: "KLB" },
  { id: "oxford", title: "Oxford", publisher: "Oxford University Press" },
  { id: "new-progressive", title: "New Progressive", publisher: "Oxford" },
  { id: "longhorn", title: "Longhorn", publisher: "Longhorn" },
  { id: "mentor", title: "Mentor", publisher: "Mentor" },
  { id: "spotlight", title: "Spotlight", publisher: "Moran" },
  { id: "champions", title: "Champions", publisher: "Moran" },
  { id: "storymoja", title: "Storymoja", publisher: "Storymoja" },
  { id: "distinction", title: "Distinction", publisher: "Distinction" },
  { id: "golden", title: "Golden Tips", publisher: "Spotlight" },
  { id: "peak", title: "Peak Revision", publisher: "Peak" },
  { id: "highflyer", title: "High Flyer", publisher: "High Flyer" },
  { id: "queenex", title: "Queenex", publisher: "Queenex" },
  { id: "access", title: "Access", publisher: "Access" },
  { id: "progress", title: "Progress", publisher: "Progress Publishers" },
  { id: "jkf", title: "JKF", publisher: "Jomo Kenyatta Foundation" },
  { id: "eaep", title: "EAEP", publisher: "East African Educational Publishers" },
  { id: "start-up", title: "Start Up", publisher: "Longhorn" },
  { id: "foundation", title: "Foundation", publisher: "KLB" },
  { id: "chemchemi", title: "Chemchemi", publisher: "KLB" },
  { id: "kiswahili-sanifu", title: "Kiswahili Sanifu", publisher: "KLB" },
];

export function bookShortName(title: string): string {
  return /smart\s*minds/i.test(title) ? "Smart Minds" : title.trim();
}

export const COMPETENCY_KEY = [
  "Communication and collaboration",
  "Critical thinking and problem solving",
  "Imagination and creativity",
  "Citizenship",
  "Digital literacy",
  "Learning to learn",
  "Self-efficacy",
];

export const VALUE_KEY = ["Love", "Responsibility", "Respect", "Unity", "Peace", "Patriotism", "Integrity"];

export const PCI_KEY = [
  "Environmental education",
  "Financial literacy",
  "Health education",
  "Safety",
  "Gender and inclusion",
  "Citizenship",
  "Life skills",
  "Learner support",
];

export const HOMEWORK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Usual CBC term shape. Dates are a 2026 planning aid, not a Ministry circular. */
export const TERM_PLAN: Record<string, { weeks: number; start: string }> = {
  "Term 1": { weeks: 13, start: "2026-01-05" },
  "Term 2": { weeks: 13, start: "2026-04-27" },
  "Term 3": { weeks: 9, start: "2026-08-31" },
};

export const ASSESSMENT_METHODS = [
  "Observation",
  "Oral questions",
  "Written exercise",
  "Practical",
  "Peer feedback",
  "Skill checklist",
  "Portfolio",
  "Game observation",
];

const KNOWN = new Set(SCHEME_COLUMNS.map((column) => column.id));

export function sanitizeColumns(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : typeof raw === "string" && raw.trim().startsWith("[") ? safeJson(raw) : [];
  const picked = source.filter((item): item is string => typeof item === "string" && KNOWN.has(item));
  const unique = [...new Set(picked)];
  if (!unique.length) return [];
  const rest = unique.filter((id) => id !== "wk" && id !== "lsn");
  return ["wk", "lsn", ...rest];
}

export function columnsOrDefault(raw: unknown): string[] {
  const clean = sanitizeColumns(raw);
  return clean.length ? clean : [...DEFAULT_SCHEME_COLUMNS];
}

export function columnLabel(id: string): string {
  return SCHEME_COLUMNS.find((column) => column.id === id)?.label ?? id;
}

function safeJson(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function bookBanner(books: SchemeTextbook[], subject: string): string {
  if (!books.length) return subject.toUpperCase();
  return books
    .map((book) => bookShortName(book.title))
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();
}

export function bookCoverLine(books: SchemeTextbook[]): string {
  if (!books.length) return "";
  return books
    .map((book) => {
      const who = book.guide === "teacher" ? "teacher’s guide" : "learner’s book";
      const pages =
        book.pagesFrom && book.pagesTo
          ? `pp. ${book.pagesFrom}–${book.pagesTo}`
          : book.pagesFrom
            ? `from p. ${book.pagesFrom}`
            : book.pagesTo
              ? `to p. ${book.pagesTo}`
              : "";
      const name = bookShortName(book.title);
      if (name === "Smart Minds") return pages ? `Smart Minds, ${pages}` : "Smart Minds";
      const publisher = book.publisher && book.publisher !== name ? ` (${book.publisher})` : "";
      return `${name}${publisher}, ${who}${pages ? `, ${pages}` : ""}`;
    })
    .join("; ");
}

function spreadPages(from: number, to: number, index: number, total: number): string {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || total < 1) return "";
  if (from === to || total === 1) return `pg ${from}`;
  const span = to - from + 1;
  const size = Math.max(1, Math.floor(span / total));
  const start = from + index * size;
  const end = index === total - 1 ? to : Math.min(to, start + size - 1);
  if (start > to) return `pg ${to}`;
  return start === end ? `pg ${start}` : `pg ${start}–${end}`;
}

export function resourceCitation(
  books: SchemeTextbook[],
  index: number,
  total: number,
  grade: string,
  subject: string,
  extra: string[],
  topicPages?: { pagesFrom: string; pagesTo: string },
): string[] {
  const gradeBit = grade.replace(/^Grade\s+/i, "G");
  const lines = books.map((book) => {
    const useTopicPages = Boolean(topicPages?.pagesFrom);
    const from = Number((useTopicPages ? topicPages?.pagesFrom : book.pagesFrom) || book.pagesFrom);
    const to = Number((useTopicPages ? topicPages?.pagesTo || topicPages?.pagesFrom : book.pagesTo) || book.pagesFrom);
    const pages = useTopicPages
      ? `pg ${topicPages?.pagesFrom}${topicPages?.pagesTo && topicPages.pagesTo !== topicPages.pagesFrom ? `–${topicPages.pagesTo}` : ""}`
      : spreadPages(from, to, index, total);
    const name = bookShortName(book.title);
    const guide = book.guide === "teacher" ? "T.G." : "L.B.";
    const pageBit = pages || "pages in the book";
    if (name === "Smart Minds") return `Smart Minds ${pageBit}`.trim();
    return `${name} ${subject} ${gradeBit} ${guide} ${pageBit}`.replace(/\s+/g, " ").trim();
  });
  const extras = extra.map((item) => item.trim()).filter(Boolean).slice(0, 4);
  return [...lines, ...extras].slice(0, 6);
}

export type LessonSeed = {
  strand?: string;
  substrand?: string;
  pagesFrom?: string;
  pagesTo?: string;
  outcomes?: string[];
  experiences?: string[];
  inquiry?: string[];
  resources?: string[];
  assessment?: string;
};

export function parseLessonLine(line: string): LessonSeed {
  const parts = line.split("|").map((part) => part.trim());
  const [substrand, outcome, experience, inquiry, assessment] = parts;
  return {
    substrand: substrand || "",
    outcomes: outcome ? [outcome.startsWith("By the end") ? outcome : `By the end of the lesson, the learner should be able to ${outcome.replace(/^[•\-\d.\s]+/, "")}`] : [],
    experiences: experience ? [experience] : [],
    inquiry: inquiry ? [inquiry] : [],
    assessment: assessment || "",
  };
}

export function weekDateLabel(termStart: string, week: number, weekFrom: number): string {
  if (!termStart) return "";
  const start = new Date(`${termStart}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";
  const monday = new Date(start);
  monday.setDate(start.getDate() + (week - weekFrom) * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const fmt = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

export function termWeekLabel(term: string, weekFrom: number, weekTo: number): string {
  const count = Math.max(1, weekTo - weekFrom + 1);
  return `${term} (${count} ${count === 1 ? "Week" : "Weeks"})`;
}

type BuildInput = {
  strand: string;
  substrand: string;
  substrands: string[];
  grade: string;
  subject: string;
  lessonsPerWeek: number;
  lessonMinutes: number;
  reflectionMode: "blank" | "prompt";
  assessmentMethods: string[];
  textbooks: SchemeTextbook[];
  termStart: string;
  weekFrom: number;
  doubleLesson: number;
  selectedTopics?: TopicSelection[];
  includeCompetencies?: string[];
  includeValues?: string[];
  includePcis?: string[];
};

export function buildLessonRows(
  weeks: SchemeWeek[],
  seeds: LessonSeed[],
  input: BuildInput,
): SchemeLesson[] {
  const slices = [input.substrand, ...input.substrands].map((item) => item.trim()).filter(Boolean);
  const topicPlan = flattenTopicSelections(input.selectedTopics ?? []);
  const total = Math.max(1, weeks.length * input.lessonsPerWeek);
  const rows: SchemeLesson[] = [];
  let index = 0;
  for (const week of weeks) {
    for (let lesson = 1; lesson <= input.lessonsPerWeek; lesson += 1) {
      const seed = seeds[index];
      const hint = week.lessonHints[lesson - 1] || week.focus || input.substrand;
      const topicFocus = topicPlan.length ? lessonFocusAt(topicPlan, index, total) : undefined;
      const slice = topicFocus
        ? `${topicFocus.topic} — ${topicFocus.subtopic}`
        : seed?.substrand || slices[index % Math.max(1, slices.length)] || input.substrand;
      const goal = hint.replace(/^By the end of the lesson, the learner should be able to\s+/i, "").replace(/\.$/, "");
      const asOutcome = (value: string) => value.toLowerCase().startsWith("by the end")
        ? value
        : `By the end of the lesson, the learner should be able to ${value.replace(/^[•\-\d.\s]+/, "").replace(/[.]?$/, ".")}`;
      const baseOutcomes = (seed?.outcomes ?? []).map(asOutcome).filter(Boolean);
      const outcomeValues = [...baseOutcomes];
      const fallbacks = [
        `explain the key terms and describe the concept of ${topicFocus?.topic ?? input.substrand} using appropriate subject vocabulary`,
        `demonstrate the relevant method or skill for ${topicFocus?.subtopic ?? input.substrand} through a worked example or practical task`,
        `apply ${topicFocus?.subtopic ?? input.substrand} to ${goal || "a new familiar example"} and justify the result`,
      ];
      for (const item of fallbacks) {
        if (outcomeValues.length >= 3) break;
        outcomeValues.push(asOutcome(item));
      }
      const curriculumLinks = [
        ...(input.includeCompetencies ?? []).map((value) => `[Core competency] ${value}`),
        ...(input.includeValues ?? []).map((value) => `[Value] ${value}`),
        ...(input.includePcis ?? []).map((value) => `[PCI] ${value}`),
      ];
      const outcomes = [...outcomeValues.slice(0, 5), ...curriculumLinks];
      const experience = seed?.experiences?.[0]
        || week.experiences[lesson - 1]
        || week.experiences[0]
        || `The teacher models ${slice} in clear steps while learners record the key vocabulary and ask clarification questions.`;
      const experienceValues = [...new Set([
        ...(seed?.experiences ?? []),
        ...week.experiences,
      ].filter(Boolean))];
      for (const fallback of [
        `In pairs, learners complete a related ${slice} task, compare their methods and use a checklist to give specific peer feedback.`,
        `Individually, learners apply ${slice} to a new example, show the steps or evidence and explain how they checked the result.`,
      ]) {
        if (experienceValues.length >= 3) break;
        experienceValues.push(fallback);
      }
      const inquiry = seed?.inquiry?.[0]
        || week.inquiry[lesson - 1]
        || week.inquiry[0]
        || `What should we notice about ${slice}?`;
      const assessment = seed?.assessment
        || (input.assessmentMethods.length ? input.assessmentMethods.slice(0, 3).join(" / ") : week.assessment);
      rows.push({
        week: week.week,
        lesson,
        dateLabel: weekDateLabel(input.termStart, week.week, input.weekFrom),
        strand: topicFocus?.strand || seed?.strand || input.strand,
        substrand: slice,
        outcomes,
        experiences: [...new Set([experience, ...experienceValues])].slice(0, 5),
        inquiry: [inquiry, ...(seed?.inquiry?.slice(1) ?? [])].slice(0, 3),
        resources: resourceCitation(input.textbooks, index, total, input.grade, input.subject, [
          ...(seed?.resources ?? []),
          ...week.resources,
        ], topicFocus ? { pagesFrom: topicFocus.pagesFrom, pagesTo: topicFocus.pagesTo } : undefined),
        assessment,
        reflection: input.reflectionMode === "prompt" ? `After lesson ${lesson}: what worked, and who still needs support?` : "",
        competencies: input.includeCompetencies ?? week.competencies,
        values: input.includeValues ?? week.values,
        pcis: input.includePcis ?? week.pcis,
        homework: lesson === input.lessonsPerWeek ? week.homework : "",
        minutes:
          input.doubleLesson > 0
            ? lesson === input.doubleLesson ? 80 : 40
            : input.lessonMinutes === 80 ? 80 : 40,
      });
      index += 1;
    }
  }
  return rows;
}

export function lessonCell(row: SchemeLesson, column: string): string {
  if (column === "wk") return row.dateLabel ? `${row.week}\n${row.dateLabel}` : String(row.week);
  if (column === "lsn") return String(row.lesson);
  if (column === "strand") return row.strand;
  if (column === "substrand") return row.substrand;
  if (column === "outcomes") return row.outcomes.map((item) => `• ${item}`).join("\n");
  if (column === "experiences") return row.experiences.map((item) => `• ${item}`).join("\n");
  if (column === "inquiry") return row.inquiry.map((item) => `• ${item}`).join("\n");
  if (column === "resources") return row.resources.map((item) => `• ${item}`).join("\n");
  if (column === "assessment") return row.assessment;
  if (column === "reflection") return row.reflection;
  if (column === "competencies") return row.competencies.join(", ");
  if (column === "values") return row.values.join(", ");
  if (column === "pcis") return row.pcis.join(", ");
  if (column === "homework") return row.homework;
  return "";
}

export function strandTrail(rows: SchemeLesson[]): string {
  const seen: string[] = [];
  for (const row of rows) {
    const bit = row.substrand.trim();
    if (bit && !seen.includes(bit)) seen.push(bit);
  }
  return seen.slice(0, 8).join("  ·  ");
}
