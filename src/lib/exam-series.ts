import type { QuestionType } from "@/lib/cbe-types";

export type PracticeSeriesId = "lower" | "upper" | "junior" | "senior";

export type PracticeSeries = {
  id: PracticeSeriesId;
  label: string;
  level: "primary" | "junior" | "senior";
  grades: string[];
  questionCount: number;
  questionTypes: QuestionType[];
  note: string;
  guidance: string;
};

/**
 * School practice shapes a Kenyan teacher already recognises.
 * These are not official KNEC papers and they do not copy a live paper.
 */
export const PRACTICE_SERIES: PracticeSeries[] = [
  {
    id: "lower",
    label: "Lower primary practice",
    level: "primary",
    grades: ["Grade 1", "Grade 2", "Grade 3"],
    questionCount: 12,
    questionTypes: ["mcq", "short"],
    note: "Short items, concrete language, one idea each. School practice for Grades 1–3.",
    guidance: "Lower primary school practice. Use short concrete sentences, familiar classroom objects, and one idea per item. No official paper claim.",
  },
  {
    id: "upper",
    label: "Upper primary / KPSEA-style practice",
    level: "primary",
    grades: ["Grade 4", "Grade 5", "Grade 6"],
    questionCount: 20,
    questionTypes: ["mcq", "short", "structured"],
    note: "Objective items plus a few structured items. Confirm the current KPSEA subject rules on KNEC before you treat any timing as national.",
    guidance: "Upper primary school practice in a familiar KPSEA shape: objective items first, then short structured items with working. Not an official KPSEA paper.",
  },
  {
    id: "junior",
    label: "Junior school / KJSEA-style practice",
    level: "junior",
    grades: ["Grade 7", "Grade 8", "Grade 9"],
    questionCount: 20,
    questionTypes: ["mcq", "short", "structured"],
    note: "Grade 9 Mathematics uses the reviewed 100-mark, 120-minute KJSEA-format practice. Other learning areas use a school paper in the same setter habits.",
    guidance: "Junior school practice aligned to the selected KICD strands. Use a context stem, command words, and parts with marks. Not an official KJSEA paper.",
  },
  {
    id: "senior",
    label: "Senior school / KCSE-style practice",
    level: "senior",
    grades: ["Grade 10", "Grade 11", "Grade 12"],
    questionCount: 15,
    questionTypes: ["short", "structured"],
    note: "End-of-course practice. National paper codes differ by subject — check the current KNEC regulations before comparing this with a live paper.",
    guidance: "Senior school practice. Longer structured items, show working, award marks per part. Not an official KCSE paper and not tied to a paper code.",
  },
];
