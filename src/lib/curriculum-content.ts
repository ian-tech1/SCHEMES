import { strandsFor } from "./curriculum.ts";
import { designFor, kicdTopicsFor, subStrandTitle, type KicdDesign } from "./kicd.ts";
import type { TopicSelection, TopicSubtopic } from "./cbe-types.ts";

export type TopicCatalogSubtopic = TopicSubtopic;
export type TopicCatalogItem = {
  strand: string;
  topic: string;
  pagesFrom: string;
  pagesTo: string;
  subtopics: TopicCatalogSubtopic[];
};

const sub = (title: string, pagesFrom = "", pagesTo = ""): TopicCatalogSubtopic => ({ title, pagesFrom, pagesTo });

/** Page ranges below are transcribed from the teacher-supplied Smart Minds scheme. */
export const GRADE_7_MATHS_TERM_3: TopicCatalogItem[] = [
  { strand: "3.0 Measurement", topic: "3.3 Area", pagesFrom: "106", pagesTo: "122", subtopics: [
    sub("Meaning and units of area", "106", "108"),
    sub("Area of rectangles and squares", "108", "112"),
    sub("Area of a triangle", "112", "116"),
    sub("Area of a parallelogram and rhombus", "116", "119"),
    sub("Area of a circle", "119", "122"),
    sub("Combined shapes and application", "106", "122"),
  ] },
  { strand: "3.0 Measurement", topic: "3.4 Volume and capacity", pagesFrom: "122", pagesTo: "134", subtopics: [
    sub("Meaning, units and conversions", "122", "125"),
    sub("Volume of a cube and cuboid", "125", "129"),
    sub("Volume of a cylinder", "129", "132"),
    sub("Capacity problems and conversions", "122", "134"),
    sub("Combined solids and revision", "122", "134"),
  ] },
  { strand: "3.0 Measurement", topic: "3.5 Time, distance and speed", pagesFrom: "134", pagesTo: "149", subtopics: [
    sub("Units of time and time intervals", "134", "137"),
    sub("Distance and units", "137", "140"),
    sub("Speed, meaning and formula", "140", "144"),
    sub("Calculating distance and time", "144", "148"),
    sub("Average speed and mixed problems", "134", "149"),
  ] },
  { strand: "3.0 Measurement", topic: "3.6 Temperature", pagesFrom: "149", pagesTo: "157", subtopics: [
    sub("Meaning, scales and thermometer readings", "149", "152"),
    sub("Temperature changes and Celsius/Kelvin conversion", "152", "157"),
    sub("Application and revision", "149", "157"),
  ] },
  { strand: "3.0 Measurement", topic: "3.7 Money", pagesFrom: "157", pagesTo: "184", subtopics: [
    sub("Kenyan currency and conversion", "157", "160"),
    sub("Profit and loss", "160", "165"),
    sub("Percentage profit and loss", "165", "170"),
    sub("Discount and simple interest (introduction)", "170", "184"),
    sub("Bills, budgets and mixed money problems", "157", "184"),
    sub("Application and revision", "157", "184"),
  ] },
  { strand: "4.0 Geometry", topic: "4.1 Angles", pagesFrom: "184", pagesTo: "207", subtopics: [
    sub("Turns and types of angles", "184", "188"),
    sub("Measuring angles with a protractor", "188", "192"),
    sub("Drawing angles", "192", "196"),
    sub("Angles on a straight line and around a point", "196", "200"),
    sub("Vertically opposite and adjacent angles", "200", "204"),
    sub("Angles of a triangle", "204", "207"),
    sub("Mixed angle problems and revision", "184", "207"),
  ] },
  { strand: "4.0 Geometry", topic: "4.2 Geometrical constructions", pagesFrom: "207", pagesTo: "228", subtopics: [
    sub("Constructing perpendicular lines and perpendicular bisectors", "207", "212"),
    sub("Angle bisectors", "212", "216"),
    sub("Constructing triangles (SSS and SAS)", "216", "222"),
    sub("Constructing triangles (ASA and RHS)", "222", "228"),
    sub("Parallel lines and construction revision", "207", "228"),
  ] },
];

function fallbackCatalog(subject: string, grade = ""): TopicCatalogItem[] {
  return strandsFor(subject, grade).flatMap((strand) => [{
    strand: strand.strand,
    topic: strand.strand,
    pagesFrom: "",
    pagesTo: "",
    subtopics: strand.substrands.map((name) => sub(name)),
  }]);
}

/**
 * Split a theme list across three terms the way schools distribute them, so a
 * teacher filtering by Term 2 sees the themes actually taught in Term 2.
 */
function themesForTerm(themes: readonly string[], term: string): { index: number; theme: string }[] {
  const per = Math.ceil(themes.length / 3);
  const number = Number(term.replace(/\D/g, "")) || 1;
  const from = (number - 1) * per;
  return themes.slice(from, from + per).map((theme, offset) => ({ index: from + offset + 1, theme }));
}

/**
 * Topics taken straight from the published KICD design for this area and grade.
 *
 * Mathematics, Science, Social Studies and Religious Education are organised by
 * strand, so the design's topic bank becomes the catalogue and the sub-strands
 * printed under that strand become the lesson focuses.
 *
 * English, Kiswahili and Indigenous Language are organised by **theme**, with the
 * four skill strands repeating inside every theme (Theme 4 listening is 4.1).
 * There the themes are the topics and the strands are the focuses — which is how
 * a language lesson is really planned.
 */
function designTopics(design: KicdDesign, grade: string, term?: string): TopicCatalogItem[] {
  if (design.themes?.length) {
    return themesForTerm(design.themes, term || "Term 1").map(({ index, theme }) => ({
      strand: `Theme ${index} · ${design.subject}`,
      topic: theme,
      pagesFrom: "",
      pagesTo: "",
      subtopics: design.strands.map((entry) => sub(entry.strand.replace(/^X\.\d+\s*/, ""))),
    }));
  }
  const rows = kicdTopicsFor(design.subject, grade, term);
  return rows.map((entry) => {
    const key = (entry.strand ?? "").toLowerCase();
    const parent = design.strands.find((strand) => key.includes((strand.id ?? "").toLowerCase()) || key.includes(strand.strand.toLowerCase().split(" ")[0] ?? ""));
    const children = (parent?.subStrands ?? []).map((child) => sub(subStrandTitle(child, grade)));
    return {
      strand: entry.strand || (parent ? `${parent.id} ${parent.strand}` : design.subject),
      topic: entry.topic,
      pagesFrom: "",
      pagesTo: "",
      subtopics: children.length ? children : [sub(entry.subtopic)],
    };
  });
}

export function topicCatalogFor(subject: string, grade: string, term?: string): TopicCatalogItem[] {
  if (subject.toLowerCase().includes("mathematics") && grade === "Grade 7" && (!term || term === "Term 3")) {
    return GRADE_7_MATHS_TERM_3;
  }
  const design = designFor(subject, grade);
  if (design && design.strands.length) {
    const rows = designTopics(design, grade, term);
    if (rows.length) return rows;
  }
  return fallbackCatalog(subject, grade);
}

/** Where a catalogue came from, so the picker can label it honestly. */
export function topicCatalogSource(subject: string, grade: string): {
  fromDesign: boolean;
  designTitle: string;
  confidence: string;
  lessonsPerWeek: string;
  note: string;
  sources: string[];
  themes: string[];
} | null {
  const design = designFor(subject, grade);
  if (!design || !design.strands.length) return null;
  return {
    fromDesign: true,
    designTitle: design.designTitle ?? design.subject,
    confidence: design.confidence,
    lessonsPerWeek: design.lessonsPerWeek ?? "",
    note: design.note ?? "",
    sources: design.sources,
    themes: design.themes ?? [],
  };
}

export function defaultTopicSelections(subject: string, grade: string, strand: string, substrand: string, term?: string): TopicSelection[] {
  const catalog = topicCatalogFor(subject, grade, term);
  const group = catalog.find((entry) => entry.strand.toLowerCase().includes(strand.toLowerCase()) || entry.topic.toLowerCase().includes(strand.toLowerCase()));
  if (group) {
    const child = group.subtopics.find((entry) => entry.title.toLowerCase().includes(substrand.toLowerCase())) ?? group.subtopics[0];
    return [{
      strand: group.strand,
      topic: group.topic,
      pagesFrom: group.pagesFrom,
      pagesTo: group.pagesTo,
      subtopics: child ? [{ ...child }] : [],
    }];
  }
  return [{ strand: strand || subject, topic: substrand || strand || subject, pagesFrom: "", pagesTo: "", subtopics: [{ title: substrand || "Key concepts", pagesFrom: "", pagesTo: "" }] }];
}

export function flattenTopicSelections(selections: TopicSelection[]): { strand: string; topic: string; subtopic: string; pagesFrom: string; pagesTo: string }[] {
  const items = selections.flatMap((entry) => {
    const chosen = entry.subtopics.length ? entry.subtopics : [{ title: entry.topic, pagesFrom: entry.pagesFrom, pagesTo: entry.pagesTo }];
    return chosen.map((child) => ({
      strand: entry.strand,
      topic: entry.topic,
      subtopic: child.title,
      pagesFrom: child.pagesFrom || entry.pagesFrom,
      pagesTo: child.pagesTo || entry.pagesTo,
    }));
  });
  return items;
}

/** A topic ticked with no sub-strands still means the whole topic: fill them from the catalogue. */
export function expandStrandSelections(selections: TopicSelection[], subject: string, grade: string, term?: string): TopicSelection[] {
  if (!selections.length) return selections;
  const catalog = topicCatalogFor(subject, grade, term);
  return selections.map((entry) => {
    if (entry.subtopics.length) return entry;
    const match = catalog.find((item) => item.topic === entry.topic && item.strand === entry.strand)
      ?? catalog.find((item) => item.topic.toLowerCase() === entry.topic.toLowerCase());
    if (!match?.subtopics.length) return entry;
    return { ...entry, strand: entry.strand || match.strand, subtopics: match.subtopics.map((child) => ({ ...child })) };
  });
}

export type FlatTopic = { strand: string; topic: string; subtopic: string; pagesFrom: string; pagesTo: string };

/**
 * Lesson `index` of `total` stays inside one strand until that strand's
 * sub-strands are finished, then moves to the next strand.
 */
export function lessonFocusAt(plan: FlatTopic[], index: number, total: number): FlatTopic | undefined {
  if (!plan.length) return undefined;
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.max(0, Math.min(index, safeTotal - 1));
  const order: string[] = [];
  const grouped = new Map<string, FlatTopic[]>();
  for (const item of plan) {
    const strand = item.strand.trim() || "Strand";
    if (!grouped.has(strand)) {
      order.push(strand);
      grouped.set(strand, []);
    }
    grouped.get(strand)!.push(item);
  }
  const groups = order.map((strand) => grouped.get(strand)!);
  if (safeTotal <= groups.length) return groups[safeIndex]?.[0] ?? groups[0]?.[0];
  const weightSum = groups.reduce((sum, group) => sum + group.length, 0);
  const sizes: number[] = [];
  let left = safeTotal;
  groups.forEach((group, groupIndex) => {
    if (groupIndex === groups.length - 1) {
      sizes.push(left);
      return;
    }
    const fair = Math.max(1, Math.round((safeTotal * group.length) / weightSum));
    const take = Math.min(fair, left - (groups.length - 1 - groupIndex));
    sizes.push(take);
    left -= take;
  });
  let cursor = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const size = sizes[groupIndex] ?? 0;
    if (safeIndex < cursor + size) {
      const local = safeIndex - cursor;
      const items = groups[groupIndex]!;
      const span = Math.max(1, Math.floor(size / items.length));
      return items[Math.min(items.length - 1, Math.floor(local / span))];
    }
    cursor += size;
  }
  const last = groups[groups.length - 1]!;
  return last[last.length - 1];
}
