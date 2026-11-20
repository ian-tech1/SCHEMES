import type { CbaLevel, QuestionType, RevisionBody } from "@/lib/cbe-types";

/**
 * Question counts a teacher may ask for.
 *
 * Kenyan primary and junior papers run long: a Grade 4-6 end-of-term mathematics
 * paper is comfortably 45+ items, and a revision booklet for a whole strand goes
 * past 100. The old list stopped at 30, so every long paper had to be split by
 * hand. `full` is the ladder offered for full papers, `summary` for quick checks.
 */
export const QUESTION_COUNTS = {
  summary: [5, 10, 15, 20],
  full: [15, 20, 25, 30, 40, 45, 50, 60, 75, 100],
} as const;

export const DEFAULT_QUESTION_COUNT = 45;
export const MAX_QUESTION_COUNT = 100;
/** Questions written per AI call; longer papers are built in chunks and merged. */
export const QUESTION_CHUNK = 20;

/** 2026 Mathematics paper layout: 20 one-mark items, then 20 structured items in five tasks (80 marks). */
export const KJSEA_QUESTION_COUNT = 40;

const KJSEA_TASK_MARKS = [4, 4, 4, 4, 4, 4, 3, 3, 5, 5, 5, 4, 4, 4, 4, 4, 4, 3, 4, 4];

export function kjseaMarksAt(index: number): number {
  if (index < 20) return 1;
  return KJSEA_TASK_MARKS[index - 20] ?? 4;
}

export function kjseaTaskLabel(index: number): string {
  const n = index + 1;
  if (n <= 20) return "Section A";
  if (n <= 25) return "Section B · Task 1 (questions 21–25, 20 marks)";
  if (n <= 28) return "Section B · Task 2 (questions 26–28, 10 marks)";
  if (n <= 33) return "Section B · Task 3 (questions 29–33, 23 marks)";
  if (n <= 38) return "Section B · Task 4 (questions 34–38, 19 marks)";
  return "Section B · Task 5 (questions 39–40, 8 marks)";
}

export function allowedCounts(depth: "full" | "summary"): number[] {
  return depth === "summary" ? [...QUESTION_COUNTS.summary] : [...QUESTION_COUNTS.full];
}

export function clampQuestionCount(raw: unknown, depth: "full" | "summary"): number {
  const ladder = allowedCounts(depth);
  const n = Number(raw);
  if (!Number.isFinite(n)) return depth === "summary" ? 10 : DEFAULT_QUESTION_COUNT;
  if (ladder.includes(Math.round(n))) return Math.round(n);
  // Anything else: the closest allowed value that is not larger than requested,
  // so a request for 60 never quietly becomes 75 (and never exceeds the cap).
  const below = ladder.filter((count) => count <= n);
  return below.length ? below[below.length - 1]! : ladder[0]!;
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  structured: "Structured / long answer",
  "true-false": "True or false",
  "fill-blank": "Complete the sentence",
  practical: "Practical / performance",
};

export const ALL_QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];

/**
 * How many minutes a paper should run.
 *
 * 45 seconds a mark is the usual Kenyan classroom pacing for a written paper,
 * rounded to a quarter of an hour so a teacher can slot it into the timetable.
 */
export function suggestTimeMinutes(totalMarks: number, questionCount: number): number {
  const fromMarks = Math.ceil((totalMarks * 45) / 60);
  const fromItems = Math.ceil(questionCount * 0.75);
  const minutes = Math.max(20, Math.max(fromMarks, fromItems));
  return Math.min(180, Math.ceil(minutes / 15) * 15);
}

/** Marks each type usually carries when the model leaves them out. */
export const DEFAULT_MARKS: Record<QuestionType, number> = {
  mcq: 1,
  short: 2,
  structured: 5,
  "true-false": 1,
  "fill-blank": 1,
  practical: 4,
};

export type PaperSection = {
  name: string;
  instruction: string;
  types: QuestionType[];
  from: number;
  to: number;
  marks: number;
};

/**
 * Split a paper into Section A / B / C the way Kenyan papers are laid out, so a
 * 60-question booklet still reads like a real exam instead of one long list.
 */
export function planSections(questions: RevisionBody["questions"]): PaperSection[] {
  if (!questions.length) return [];
  const byType = (types: QuestionType[]) => questions.filter((q) => types.includes((q.type || "short") as QuestionType));
  const objective = byType(["mcq", "true-false", "fill-blank"]);
  const shortAnswers = byType(["short"]);
  const written = byType(["structured", "practical"]);

  const layout: { name: string; instruction: string; types: QuestionType[]; items: typeof questions }[] = [];
  if (objective.length) {
    layout.push({
      name: "SECTION A (Objective)",
      instruction: "Answer all questions in this section by ticking or writing the correct answer.",
      types: ["mcq", "true-false", "fill-blank"],
      items: objective,
    });
  }
  if (shortAnswers.length) {
    layout.push({
      name: "SECTION B (Short answer)",
      instruction: "Answer all questions in this section. Show your working where it applies.",
      types: ["short"],
      items: shortAnswers,
    });
  }
  if (written.length) {
    layout.push({
      name: "SECTION C (Structured and practical)",
      instruction: "Answer all questions in this section. Write full sentences and show every step.",
      types: ["structured", "practical"],
      items: written,
    });
  }
  if (!layout.length) {
    layout.push({ name: "SECTION A", instruction: "Answer all questions.", types: [], items: questions });
  }

  return layout.map((block) => ({
    name: block.name,
    instruction: block.instruction,
    types: block.types,
    from: block.items[0]?.number ?? 1,
    to: block.items[block.items.length - 1]?.number ?? 1,
    marks: block.items.reduce((sum, item) => sum + (item.marks || 1), 0),
  }));
}

/**
 * Multiple-choice options as a learner should see them: A, B, C, D. Models and
 * the offline bank store the plain text, so the letter is added here once, and
 * an option that already carries one is left exactly as it is.
 */
export function letteredOptions(options: string[] | undefined): string[] {
  if (!options?.length) return [];
  return options.map((option, index) => {
    const letter = String.fromCharCode(65 + index);
    return /^[A-Za-z][).]\s/.test(option) ? option : `${letter}. ${option}`;
  });
}

/** The answer a teacher marks, printed the same way whatever wrote the paper. */
export function answerLabel(answer: string | undefined): string {
  const text = (answer ?? "").trim();
  const match = /^([a-dA-D])[).:]?(\s|$)/.exec(text);
  if (!match) return text;
  const letter = match[1]!.toUpperCase();
  const rest = text.slice(match[0].length).trim();
  return rest ? `${letter}. ${rest}` : letter;
}

/** Group questions by number order for printing (sections keep the paper readable). */
export function orderByNumber(questions: RevisionBody["questions"]): RevisionBody["questions"] {
  return [...questions].sort((a, b) => a.number - b.number);
}

/* ── CBC assessment levels (Competency Based Assessment) ─────────────────── */

export const CBA_LEVELS: CbaLevel[] = [
  { key: "exceeding", label: "Exceeding Expectation", short: "EE", band: "80 – 100%" },
  { key: "meeting", label: "Meeting Expectation", short: "ME", band: "65 – 79%" },
  { key: "approaching", label: "Approaching Expectation", short: "AE", band: "50 – 64%" },
  { key: "below", label: "Below Expectation", short: "BE", band: "Below 50%" },
];

export function cbaLevel(percentage: number): CbaLevel {
  if (percentage >= 80) return CBA_LEVELS[0]!;
  if (percentage >= 65) return CBA_LEVELS[1]!;
  if (percentage >= 50) return CBA_LEVELS[2]!;
  return CBA_LEVELS[3]!;
}

export function percentageOf(marks: number | null, total: number): number | null {
  if (marks == null || !Number.isFinite(marks) || total <= 0) return null;
  return Math.round((marks / total) * 1000) / 10;
}

/** Item analysis: the evidence an inspector or HOD asks a teacher to produce. */
export type ItemAnalysisRow = {
  number: number;
  type: QuestionType;
  marks: number;
  answered: number;
  correct: number;
  rate: number | null;
  level: "strong" | "fair" | "revise";
};

export function analyseItems(
  questions: RevisionBody["questions"],
  scoresByQuestion: Record<number, { answered: number; correct: number }>,
): ItemAnalysisRow[] {
  return questions.map((question) => {
    const row = scoresByQuestion[question.number] ?? { answered: 0, correct: 0 };
    const rate = row.answered ? Math.round((row.correct / row.answered) * 100) : null;
    return {
      number: question.number,
      type: (question.type || "short") as QuestionType,
      marks: question.marks,
      answered: row.answered,
      correct: row.correct,
      rate,
      level: rate == null ? "revise" : rate >= 75 ? "strong" : rate >= 50 ? "fair" : "revise",
    };
  });
}
