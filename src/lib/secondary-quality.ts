import { bandOf, PATHWAYS, subjectsFor } from "./curriculum.ts";

export type SecondaryLevel = "junior" | "senior";

/** A practical, editable pathway guide. It is a filter and planning aid, not an official KICD subject-allocation table. */
export const SECONDARY_PATHWAY_SUBJECTS: Record<string, readonly string[]> = {
  STEM: ["Mathematics", "Biology", "Chemistry", "Physics", "Computer Science", "Agriculture", "Home Science"],
  "Social Sciences": ["English", "Kiswahili", "History and Citizenship", "Geography", "Business Studies", "Christian Religious Education", "Islamic Religious Education"],
  "Arts and Sports Science": ["English", "Kiswahili", "Fine Arts", "Music and Dance", "Sports Science", "Home Science"],
};

export const SECONDARY_QUALITY_UPGRADES = [
  "Grade-to-band breadcrumb and quick switching",
  "Junior School learning-area starter designs",
  "Senior School pathway-aware subject filter",
  "Editable strands, sub-strands and local topics",
  "Term-by-term topic coverage view",
  "Curriculum confidence and teacher verification label",
  "Source links on every secondary design",
  "Topic search with matching strand context",
  "Copyable strand list for departmental planning",
  "Cumulative mixed-grade assessment coverage",
  "KJSEA-format Grade 9 mathematics guardrails",
  "Senior pathway printed on generated documents",
  "Grade-aware question difficulty rotation",
  "45–100 question long-paper ladder",
  "Secondary empty-state and recovery guidance",
] as const;

export function isSecondaryLevel(level: string): level is SecondaryLevel {
  return level === "junior" || level === "senior";
}

export function pathwaySubjects(pathway: string): readonly string[] {
  return SECONDARY_PATHWAY_SUBJECTS[pathway] ?? [];
}

export function subjectFitsPathway(subject: string, pathway: string): boolean {
  return !pathway || !pathwaySubjects(pathway).length || pathwaySubjects(pathway).includes(subject);
}

export function subjectsForPathway(level: string, grade: string, pathway: string): string[] {
  const subjects = subjectsFor(level, grade);
  if (level !== "senior") return subjects;
  const allowed = pathwaySubjects(pathway);
  return allowed.length ? subjects.filter((subject) => allowed.includes(subject)) : subjects;
}

export function secondarySummary(level: string, grade: string, subject: string, pathway = ""): string {
  const band = bandOf(grade);
  if (!isSecondaryLevel(level) || !band) return "Choose a grade and learning area to begin.";
  if (level === "senior") {
    return `${band.label} · ${grade} · ${pathway || "pathway not selected"} · ${subject}. Confirm the current pathway design before publishing.`;
  }
  return `${band.label} · ${grade} · ${subject}. Use the editable starter topics and verify outcomes against the current school design.`;
}

export function assessmentGuidance(level: string, grade: string, questionCount: number): string {
  if (level === "senior") return `${grade} paper: ${questionCount} questions. Balance recall, application, analysis and practical/contextual items for the selected pathway.`;
  if (level === "junior") return `${grade} paper: ${questionCount} questions. Mix competency application, investigation and structured reasoning; choose only topics already taught.`;
  return `${questionCount} questions planned. Adjust the paper to the learners' taught content and available time.`;
}

export function secondaryPathways(): readonly string[] {
  return PATHWAYS;
}
