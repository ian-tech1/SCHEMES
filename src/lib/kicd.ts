/**
 * KICD curriculum-design layer — types and lookup helpers.
 *
 * Kenya Institute of Curriculum Development publishes a curriculum design per
 * learning area per grade. Primary is **not** one block: it is
 * *Lower Primary (Grade 1 – 3)* and *Upper Primary (Grade 4 – 6)*, and the bands
 * differ in more than depth. Under the current (2023/2024 rationalised) designs:
 *
 * - Grades 1–3 study seven broad areas — English Activities, Kiswahili,
 *   Indigenous Languages, Mathematical Activities, Environmental Activities
 *   (science, hygiene, nutrition and social learning integrated), Creative
 *   Activities and Religious Education Activities.
 * - Grades 4–6 study the subject-shaped list — Mathematics, Science and
 *   Technology, Agriculture and Nutrition, Social Studies, Creative Arts,
 *   Physical and Health Education and the rest.
 *
 * The strand text itself also moves between grades inside a band (Grade 6
 * renumbers its Numbers sub-strands; Grade 3 swaps "Lines" for "Position and
 * Direction"), so a sub-strand may carry a `perGrade` title and the lookup
 * resolves it for the grade being planned.
 *
 * Every design entry keeps its source links and a confidence flag: a teacher
 * planning a real term has to be able to see which lines came off the published
 * design and which are an editable starting point.
 *
 * The dataset itself lives in `kicd-data.ts`.
 */

import { KICD_DESIGNS as PRIMARY_DESIGNS } from "./kicd-data.ts";
import { SECONDARY_DESIGNS } from "./kicd-secondary-data.ts";

export type KicdBandId = "lower" | "upper" | "junior" | "senior";

export type KicdSubStrand = {
  /** Sub-strand number as printed in the design, e.g. "2.1". Omit when unverified. */
  id?: string;
  /** Title used when the design prints one title for the whole band. */
  title: string;
  /** Where the design prints a different title per grade, keyed "Grade 4". */
  perGrade?: Record<string, string>;
  /** Caveat or difference the teacher should see next to the line. */
  gradeNotes?: string;
  /** Suggested lessons in the year, when the design prints a count. */
  lessons?: number;
};

export type KicdStrand = {
  id?: string;
  strand: string;
  subStrands: KicdSubStrand[];
};

export type KicdTopic = {
  term: "Term 1" | "Term 2" | "Term 3";
  topic: string;
  subtopic: string;
  strand?: string;
  grades?: string[];
};

export type KicdConfidence = "high" | "medium" | "low";

export type KicdDesign = {
  /** Canonical app key, matching the names used by `subjectsFor`. */
  subject: string;
  /** Title exactly as printed in the design when it differs from the app key. */
  designTitle?: string;
  band: KicdBandId;
  grades: string[];
  strands: KicdStrand[];
  topics: KicdTopic[];
  /**
   * Language designs (English, Kiswahili, Indigenous Language) are organised by
   * theme, and the four strands repeat inside every theme, so the strand codes
   * are theme-prefixed (`3.1 Listening and Speaking` in Theme 3) rather than a
   * flat 1.0 – 4.0. Where a design works that way, the themes are listed here.
   */
  themes?: string[];
  lessonsPerWeek?: string;
  confidence: KicdConfidence;
  sources: string[];
  note?: string;
};

export const LOWER_PRIMARY_GRADES = ["Grade 1", "Grade 2", "Grade 3"];
export const UPPER_PRIMARY_GRADES = ["Grade 4", "Grade 5", "Grade 6"];
export const JUNIOR_SCHOOL_GRADES = ["Grade 7", "Grade 8", "Grade 9"];
export const SENIOR_SCHOOL_GRADES = ["Grade 10", "Grade 11", "Grade 12"];

/** Which school band a grade sits in. */
export function bandForGrade(grade: string): KicdBandId | null {
  const n = Number(String(grade).replace(/\D/g, ""));
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  if (n <= 3) return "lower";
  if (n <= 6) return "upper";
  if (n <= 9) return "junior";
  return "senior";
}

export const BAND_LABEL: Record<KicdBandId, string> = {
  lower: "Lower Primary",
  upper: "Upper Primary",
  junior: "Junior School",
  senior: "Senior School",
};

export const BAND_RANGE: Record<KicdBandId, string> = {
  lower: "Grade 1 – 3",
  upper: "Grade 4 – 6",
  junior: "Grade 7 – 9",
  senior: "Grade 10 – 12",
};

export const BAND_BLURB: Record<KicdBandId, string> = {
  lower: "Activity-based learning, concrete materials, oral language and short clear outcomes.",
  upper: "Subject learning with written reflection, investigations and introductory abstract work.",
  junior: "Broad Junior School learning areas with practical investigations, projects and competency-based assessment.",
  senior: "Pathway-based Senior School learning in STEM, Social Sciences or Arts and Sports Science.",
};

/** Titles the designs use that differ from the app's canonical learning-area key. */
const SUBJECT_ALIASES: Record<string, string> = {
  "mathematical activities": "Mathematics",
  "english activities": "English",
  "kiswahili activities": "Kiswahili",
  "kiswahili and indigenous language activities": "Kiswahili",
  "indigenous language activities": "Indigenous Language",
  "indigenous languages": "Indigenous Language",
  "environmental activities": "Environmental Activities",
  "creative activities": "Creative Arts",
  "movement and creative activities": "Creative Arts",
  "physical and health education activities": "Physical and Health Education",
  "religious education activities": "Christian Religious Education",
  "agriculture and nutrition activities": "Agriculture and Nutrition",
  "science, technology and engineering": "Science and Technology",
  "social studies activities": "Social Studies",
};

export function canonicalSubject(name: string): string {
  const key = name.trim().toLowerCase();
  const direct = KICD_DESIGNS.find((design) => design.subject.toLowerCase() === key)?.subject;
  if (direct) return direct;
  return SUBJECT_ALIASES[key] ?? name.trim();
}

export const KICD_DESIGNS: KicdDesign[] = [...PRIMARY_DESIGNS, ...SECONDARY_DESIGNS];

export function designsForBand(band: KicdBandId): KicdDesign[] {
  return KICD_DESIGNS.filter((design) => design.band === band);
}

export function designFor(subject: string, grade: string): KicdDesign | null {
  const band = bandForGrade(grade);
  if (!band) return null;
  const key = canonicalSubject(subject).toLowerCase();
  return KICD_DESIGNS.find((design) => design.band === band && design.subject.toLowerCase() === key) ?? null;
}

/** The grade-specific title of a sub-strand, falling back to the band title. */
export function subStrandTitle(sub: KicdSubStrand, grade: string): string {
  return (grade && sub.perGrade?.[grade]) || sub.title;
}

/** Label a strand or sub-strand line is shown with: "2.1 Length". */
export function labelledLine(id: string | undefined, title: string): string {
  return id ? `${id} ${title}` : title;
}

/**
 * Strand list in the shape the picker components consume, numbered exactly as the
 * design numbers it and resolved for the grade being planned.
 */
export function kicdStrandsFor(subject: string, grade: string): { strand: string; substrands: string[] }[] {
  const design = designFor(subject, grade);
  if (!design) return [];
  return design.strands.map((strand) => ({
    strand: labelledLine(strand.id, strand.strand),
    substrands: strand.subStrands.map((sub) => labelledLine(sub.id, subStrandTitle(sub, grade))),
  }));
}

/** Every subject the designs are known for in a band. */
export function kicdSubjectsFor(band: KicdBandId): string[] {
  return [...new Set(designsForBand(band).map((design) => design.subject))].sort();
}

/** Topic bank rows for one term, ready for the topic picker. */
export function kicdTopicsFor(subject: string, grade: string, term?: string): KicdTopic[] {
  const design = designFor(subject, grade);
  if (!design) return [];
  return design.topics.filter((topic) => (!term || topic.term === term) && (!topic.grades || topic.grades.includes(grade)));
}

/** How far a given line is backed by a published design — surfaced in the UI. */
export function kicdCoverage(subject: string, grade: string): {
  covered: boolean;
  confidence: KicdConfidence | "none";
  design: KicdDesign | null;
} {
  const design = designFor(subject, grade);
  return { covered: Boolean(design?.strands.length), confidence: design?.confidence ?? "none", design };
}

/** Distinct source links across the dataset, for the citation panel. */
export function kicdSourceLinks(): { label: string; href: string }[] {
  const seen = new Set<string>();
  const links: { label: string; href: string }[] = [];
  for (const design of KICD_DESIGNS) {
    for (const source of design.sources) {
      if (seen.has(source)) continue;
      seen.add(source);
      const host = source.split("/")[2] ?? "";
      links.push({
        label: host.includes("kicd.ac.ke")
          ? "KICD — official curriculum design pages"
          : host.includes("education.go.ke")
            ? "Ministry of Education"
            : `${host} — KICD-published design copy`,
        href: source,
      });
    }
  }
  return links;
}

/** Roll-up used by the curriculum browser and the status page. */
export function kicdStat() {
  const subCount = (design: KicdDesign) => design.strands.reduce((sum, strand) => sum + strand.subStrands.length, 0);
  return {
    designs: KICD_DESIGNS.length,
    strands: KICD_DESIGNS.reduce((sum, design) => sum + design.strands.length, 0),
    subStrands: KICD_DESIGNS.reduce((sum, design) => sum + subCount(design), 0),
    topics: KICD_DESIGNS.reduce((sum, design) => sum + design.topics.length, 0),
    subjects: new Set(KICD_DESIGNS.map((design) => design.subject)).size,
    sources: kicdSourceLinks().length,
    verified: KICD_DESIGNS.filter((design) => design.confidence === "high").length,
  };
}
