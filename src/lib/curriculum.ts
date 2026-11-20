import { BAND_BLURB, BAND_LABEL, BAND_RANGE, bandForGrade, designFor, subStrandTitle, type KicdBandId } from "./kicd.ts";

/**
 * A grade band is how KICD actually publishes primary: Lower Primary (Grade 1 – 3)
 * and Upper Primary (Grade 4 – 6). The bands are not the same list of subjects at
 * different depths — the learning areas themselves change name and number, so the
 * app categorises Primary by band everywhere a grade is chosen.
 */
export type GradeBand = {
  id: KicdBandId;
  label: string;
  range: string;
  blurb: string;
  grades: readonly string[];
  subjects: readonly string[];
};

/**
 * Lower Primary learning areas exactly as printed in the Revised 2024 Lesson
 * Allocation table: 7 areas + Pastoral Program Instruction = 31 lessons a week,
 * 30-minute lessons, 6 a day. There is no Science and Technology, no Agriculture
 * and Nutrition, no Social Studies and no separate Physical and Health Education
 * at this level — that learning is carried by Environmental Activities and
 * Creative Activities.
 */
const LOWER_SUBJECTS = [
  "English",
  "Kiswahili",
  "Indigenous Language",
  "Mathematics",
  "Environmental Activities",
  "Creative Arts",
  "Christian Religious Education",
  "Islamic Religious Education",
  "Hindu Religious Education",
  "Pastoral Program Instruction",
];

/**
 * Upper Primary learning areas: 8 areas + Pastoral Program Instruction =
 * 35 lessons a week, 35-minute lessons, 7 a day.
 */
const UPPER_SUBJECTS = [
  "English",
  "Kiswahili",
  "Indigenous Language",
  "Mathematics",
  "Science and Technology",
  "Social Studies",
  "Agriculture and Nutrition",
  "Creative Arts",
  "Christian Religious Education",
  "Islamic Religious Education",
  "Hindu Religious Education",
  "Pastoral Program Instruction",
];

export const PRIMARY_BANDS: readonly GradeBand[] = [
  {
    id: "lower",
    label: BAND_LABEL.lower,
    range: BAND_RANGE.lower,
    blurb: BAND_BLURB.lower,
    grades: ["Grade 1", "Grade 2", "Grade 3"],
    subjects: LOWER_SUBJECTS,
  },
  {
    id: "upper",
    label: BAND_LABEL.upper,
    range: BAND_RANGE.upper,
    blurb: BAND_BLURB.upper,
    grades: ["Grade 4", "Grade 5", "Grade 6"],
    subjects: UPPER_SUBJECTS,
  },
];

export const PATHWAYS = ["STEM", "Social Sciences", "Arts and Sports Science"];

export const TERMS = ["Term 1", "Term 2", "Term 3"];

/**
 * Every learning area Primary has used across both bands. Kept for places that
 * list subjects without knowing a grade — the library filter and old documents.
 */
const PRIMARY = [
  "English",
  "Kiswahili",
  "Mathematics",
  "Science and Technology",
  "Social Studies",
  "Agriculture and Nutrition",
  "Creative Arts",
  "Christian Religious Education",
  "Islamic Religious Education",
  "Hindu Religious Education",
  "Physical and Health Education",
];

const JUNIOR = [
  "English",
  "Kiswahili",
  "Mathematics",
  "Integrated Science",
  "Social Studies",
  "Pre-Technical Studies",
  "Agriculture and Nutrition",
  "Creative Arts and Sports",
  "Computer Science",
  "Christian Religious Education",
  "Islamic Religious Education",
  "Hindu Religious Education",
];

const SENIOR = [
  "English",
  "Kiswahili",
  "Mathematics",
  "Biology",
  "Chemistry",
  "Physics",
  "Computer Science",
  "Agriculture",
  "Business Studies",
  "History and Citizenship",
  "Geography",
  "Christian Religious Education",
  "Islamic Religious Education",
  "Home Science",
  "Sports Science",
  "Fine Arts",
  "Music and Dance",
];

export const JUNIOR_BAND: GradeBand = {
  id: "junior",
  label: BAND_LABEL.junior,
  range: BAND_RANGE.junior,
  blurb: BAND_BLURB.junior,
  grades: ["Grade 7", "Grade 8", "Grade 9"],
  subjects: JUNIOR,
};

export const SENIOR_BAND: GradeBand = {
  id: "senior",
  label: BAND_LABEL.senior,
  range: BAND_RANGE.senior,
  blurb: BAND_BLURB.senior,
  grades: ["Grade 10", "Grade 11", "Grade 12"],
  subjects: SENIOR,
};

export const ALL_BANDS: readonly GradeBand[] = [...PRIMARY_BANDS, JUNIOR_BAND, SENIOR_BAND];
export const LEVELS = [
  {
    id: "primary",
    label: "Primary",
    grades: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"],
    bands: PRIMARY_BANDS,
    weeklyLine: "Lower Primary 7 areas · 31 lessons a week · 30 minutes. Upper Primary 8 areas · 35 lessons a week · 35 minutes.",
  },
  {
    id: "junior",
    label: "Junior School",
    grades: ["Grade 7", "Grade 8", "Grade 9"],
    bands: [JUNIOR_BAND],
    weeklyLine: "Grade 7 – 9 · 12 learning areas.",
  },
  {
    id: "senior",
    label: "Senior School",
    grades: ["Grade 10", "Grade 11", "Grade 12"],
    bands: [SENIOR_BAND],
    weeklyLine: "Grade 10 – 12 · chosen subjects per pathway.",
  },
] as const;




/** The band a grade sits in inside Primary, Junior or Senior School. */
export function bandOf(grade: string): GradeBand | null {
  const id = bandForGrade(grade);
  return id ? ALL_BANDS.find((band) => band.id === id) ?? null : null;
}

export function bandIdOf(grade: string): KicdBandId | null {
  return bandForGrade(grade);
}

/** Short label used all over the UI: "Lower Primary · Grade 1 – 3". */
export function bandBadge(grade: string): string {
  const band = bandOf(grade);
  return band ? `${band.label} · ${band.range}` : "";
}

/**
 * Learning areas for a level. Pass the grade for Primary and you get the band's
 * own list — the list the KICD design for that grade actually prints. Without a
 * grade you get every area Primary has ever used, which is what the library
 * filter needs so old documents stay findable.
 */
export function subjectsFor(level: string, grade = ""): string[] {
  if (level === "primary") {
    const band = bandOf(grade);
    if (band) return [...band.subjects];
    return [...new Set([...PRIMARY, ...LOWER_SUBJECTS, ...UPPER_SUBJECTS])];
  }
  if (level === "senior") return SENIOR;
  return JUNIOR;
}

/** Grades belonging to a level, or to one band of it. */
export function gradesFor(level: string, band?: string): string[] {
  const found = LEVELS.find((entry) => entry.id === level);
  if (!found) return [];
  if (band) return [...ALL_BANDS.find((entry) => entry.id === band && entry.grades.every((grade) => (found.grades as readonly string[]).includes(grade)))?.grades ?? []];
  return [...found.grades];
}

/** The name the published design prints for this area and grade, if different. */
export function designNameFor(subject: string, grade: string): string {
  return designFor(subject, grade)?.designTitle ?? "";
}

export type StrandOpt = { strand: string; substrands: string[] };

const STRANDS: Record<string, StrandOpt[]> = {
  Mathematics: [
    {
      strand: "Numbers",
      substrands: [
        "Whole numbers",
        "Fractions",
        "Decimals",
        "Integers",
        "Percentages",
        "Ratio and proportion",
      ],
    },
    {
      strand: "Algebra",
      substrands: ["Algebraic expressions", "Linear equations", "Inequalities", "Quadratic expressions"],
    },
    {
      strand: "Measurement",
      substrands: ["Length", "Area", "Volume and capacity", "Mass", "Time", "Money"],
    },
    {
      strand: "Geometry",
      substrands: ["Lines and angles", "2-D shapes", "3-D shapes", "Scale drawing", "Circles"],
    },
    {
      strand: "Data handling",
      substrands: ["Data collection", "Averages", "Probability", "Graphs"],
    },
  ],
  English: [
    {
      strand: "Listening and speaking",
      substrands: ["Pronunciation", "Oral presentations", "Conversation", "Debating"],
    },
    {
      strand: "Reading",
      substrands: ["Fluency", "Comprehension", "Intensive reading", "Extensive reading"],
    },
    {
      strand: "Writing",
      substrands: ["Handwriting and punctuation", "Functional writing", "Creative writing", "Composition"],
    },
    {
      strand: "Grammar in use",
      substrands: ["Parts of speech", "Tenses", "Sentence construction", "Agreement"],
    },
  ],
  Kiswahili: [
    {
      strand: "Kusikiliza na kuzungumza",
      substrands: ["Matamshi", "Mazungumzo", "Hotuba", "Mjadala"],
    },
    {
      strand: "Kusoma",
      substrands: ["Ufahamu", "Kusoma kwa ufasaha", "Fasihi simulizi", "Tamthilia"],
    },
    {
      strand: "Kuandika",
      substrands: ["Insha", "Barua", "Uandishi wa kiuamilifu", "Uandishi wa kibunifu"],
    },
    {
      strand: "Sarufi",
      substrands: ["Aina za maneno", "Ngeli", "Nyakati", "Vifungu"],
    },
  ],
  "Integrated Science": [
    {
      strand: "Mixtures, elements and compounds",
      substrands: ["Mixtures", "Acids, bases and indicators", "Elements and compounds", "States and properties of matter"],
    },
    {
      strand: "Living things and their environment",
      substrands: ["Cells", "Plants and animals", "Reproduction", "Human body systems", "Ecology and interdependence"],
    },
    {
      strand: "Force and energy",
      substrands: ["Forces", "Static electricity", "Magnetism", "Pressure", "Heat transfer", "Light"],
    },
  ],
  "Science and Technology": [
    {
      strand: "Living things",
      substrands: ["Plants", "Animals", "Human body", "Environment"],
    },
    {
      strand: "Matter and materials",
      substrands: ["States of matter", "Properties of materials", "Water"],
    },
    {
      strand: "Force and energy",
      substrands: ["Sound", "Light", "Heat", "Simple machines"],
    },
  ],
  "Social Studies": [
    {
      strand: "Community and society",
      substrands: ["Our community", "Leadership", "Citizenship", "Social organisations"],
    },
    {
      strand: "Natural and built environments",
      substrands: ["Map work", "Climate", "Resources", "Settlements"],
    },
    {
      strand: "History and governance",
      substrands: ["Early communities", "Colonial experience", "Constitution", "Human rights"],
    },
  ],
  "Pre-Technical Studies": [
    {
      strand: "Safety and materials",
      substrands: ["Safety in the workplace", "Tools and materials", "Occupations"],
    },
    {
      strand: "Communication and drawing",
      substrands: ["Technical drawing", "Plane geometry", "Computer literacy"],
    },
    {
      strand: "Entrepreneurship",
      substrands: ["Business ideas", "Money and records", "Consumer awareness"],
    },
  ],
  "Agriculture and Nutrition": [
    {
      strand: "Crop production",
      substrands: ["Soil", "Crop establishment", "Crop pests and diseases", "Harvesting"],
    },
    {
      strand: "Animal production",
      substrands: ["Domestic animals", "Animal health", "Feeds"],
    },
    {
      strand: "Food and nutrition",
      substrands: ["Food nutrients", "Food hygiene", "Meal planning", "Preservation"],
    },
  ],
  Biology: [
    {
      strand: "Cell biology",
      substrands: ["Cell structure", "Cell physiology", "Chemicals of life"],
    },
    {
      strand: "Classification and ecology",
      substrands: ["Classification", "Ecology", "Human impact"],
    },
    {
      strand: "Human physiology",
      substrands: ["Nutrition", "Transport", "Respiration", "Excretion", "Coordination"],
    },
  ],
  Chemistry: [
    {
      strand: "Matter",
      substrands: ["Atomic structure", "Periodic table", "Bonding"],
    },
    {
      strand: "Chemical reactions",
      substrands: ["Acids and bases", "Salts", "Rates of reaction", "Electrochemistry"],
    },
    {
      strand: "Organic chemistry",
      substrands: ["Hydrocarbons", "Alkanols", "Polymers"],
    },
  ],
  Physics: [
    {
      strand: "Mechanics",
      substrands: ["Measurement", "Linear motion", "Newton's laws", "Work and energy"],
    },
    {
      strand: "Waves and optics",
      substrands: ["Waves", "Sound", "Light and lenses"],
    },
    {
      strand: "Electricity and magnetism",
      substrands: ["Current electricity", "Electrostatics", "Magnetism"],
    },
  ],
  "Computer Science": [
    {
      strand: "Computer systems",
      substrands: ["Hardware", "Software", "Data representation"],
    },
    {
      strand: "Programming",
      substrands: ["Algorithms", "Sequence and selection", "Iteration"],
    },
    {
      strand: "Networks and safety",
      substrands: ["Internet", "Cyber safety", "Spreadsheets"],
    },
  ],
  "Creative Arts": [
    { strand: "Visual arts", substrands: ["Drawing", "Colour", "Pattern", "Sculpture and construction"] },
    { strand: "Music and movement", substrands: ["Rhythm", "Singing", "Instruments", "Dance"] },
    { strand: "Performance and appreciation", substrands: ["Drama", "Storytelling", "Creative presentation", "Responding to art"] },
  ],
  "Creative Arts and Sports": [
    { strand: "Creative arts", substrands: ["Drawing and painting", "Craft", "Music", "Drama and dance"] },
    { strand: "Movement and games", substrands: ["Fundamental movement", "Team games", "Athletics", "Dance"] },
    { strand: "Health and safety", substrands: ["Fitness", "Personal safety", "Fair play", "Wellbeing"] },
  ],
  "Christian Religious Education": [
    { strand: "The Bible and its message", substrands: ["Bible stories", "Teachings", "Prayer and worship", "Applying scripture"] },
    { strand: "Christian living", substrands: ["Relationships", "Moral choices", "Service", "Responsibility"] },
    { strand: "Religion and society", substrands: ["Community", "Religious celebrations", "Church and society", "Respect for others"] },
  ],
  "Islamic Religious Education": [
    { strand: "Qur'an and Hadith", substrands: ["Selected passages", "Meanings", "Hadith", "Applying teachings"] },
    { strand: "Faith and worship", substrands: ["Articles of faith", "Pillars of Islam", "Prayer", "Devotional practice"] },
    { strand: "Islamic living", substrands: ["Moral conduct", "Family and community", "History", "Care and responsibility"] },
  ],
  "Hindu Religious Education": [
    { strand: "Hindu beliefs and teachings", substrands: ["Sacred texts", "Beliefs", "Stories and teachings", "Reflection"] },
    { strand: "Worship and practice", substrands: ["Prayer", "Festivals", "Rituals", "Symbols"] },
    { strand: "Values and community", substrands: ["Respect", "Service", "Family and society", "Living responsibly"] },
  ],
  "Physical and Health Education": [
    { strand: "Movement and physical activity", substrands: ["Fundamental movement", "Games", "Athletics", "Rhythmic movement"] },
    { strand: "Personal health", substrands: ["Nutrition", "Hygiene", "Safety", "Wellbeing"] },
    { strand: "Fitness and relationships", substrands: ["Fitness", "Teamwork", "Fair play", "Healthy relationships"] },
  ],
  Agriculture: [
    { strand: "Crop production", substrands: ["Soil management", "Crop husbandry", "Pests and diseases", "Harvesting and storage"] },
    { strand: "Animal production", substrands: ["Animal husbandry", "Nutrition", "Health", "Production systems"] },
    { strand: "Agribusiness and sustainability", substrands: ["Farm records", "Markets", "Agricultural technology", "Sustainable practice"] },
  ],
  "Business Studies": [
    { strand: "Business and enterprise", substrands: ["Business ideas", "Entrepreneurship", "Forms of business", "Business growth"] },
    { strand: "Resources and operations", substrands: ["Money", "People and production", "Stock", "Customer care"] },
    { strand: "Markets and records", substrands: ["Demand and supply", "Marketing", "Bookkeeping", "Digital commerce"] },
  ],
  "History and Citizenship": [
    { strand: "History and evidence", substrands: ["Sources of history", "Early societies", "Kenya's past", "Historical change"] },
    { strand: "Citizenship and governance", substrands: ["Rights and responsibilities", "Constitution", "Public institutions", "Participation"] },
    { strand: "Society and heritage", substrands: ["Culture", "National identity", "Regional connections", "Contemporary issues"] },
  ],
  Geography: [
    { strand: "Map skills and fieldwork", substrands: ["Maps and scale", "Direction and location", "Field observations", "Geospatial tools"] },
    { strand: "Physical environments", substrands: ["Weather and climate", "Landforms", "Water systems", "Ecosystems"] },
    { strand: "People, resources and development", substrands: ["Population", "Settlements", "Resources", "Sustainable development"] },
  ],
  "Home Science": [
    { strand: "Food, nutrition and health", substrands: ["Food groups", "Meal planning", "Food safety", "Nutrition needs"] },
    { strand: "Home and family", substrands: ["Family wellbeing", "Consumer choices", "Home management", "Care"] },
    { strand: "Textiles and design", substrands: ["Textile materials", "Clothing care", "Construction skills", "Design"] },
  ],
  "Sports Science": [
    { strand: "Movement and performance", substrands: ["Movement skills", "Training principles", "Fitness testing", "Performance analysis"] },
    { strand: "Health and wellbeing", substrands: ["Nutrition", "Recovery", "Injury prevention", "Mental wellbeing"] },
    { strand: "Sport and society", substrands: ["Rules and officiating", "Teamwork", "Ethics", "Sport pathways"] },
  ],
  "Fine Arts": [
    { strand: "Drawing and observation", substrands: ["Line and form", "Perspective", "Figure drawing", "Visual research"] },
    { strand: "Materials and processes", substrands: ["Colour", "Printmaking", "Sculpture", "Mixed media"] },
    { strand: "Art history and presentation", substrands: ["Art traditions", "Critique", "Portfolio", "Exhibition"] },
  ],
  "Music and Dance": [
    { strand: "Creating and performing", substrands: ["Singing", "Instruments", "Composition", "Dance performance"] },
    { strand: "Music skills", substrands: ["Rhythm", "Pitch", "Notation", "Ensemble"] },
    { strand: "Context and appreciation", substrands: ["Musical traditions", "Listening", "Movement", "Performance reflection"] },
  ],
};

/**
 * Strand list for a learning area.
 *
 * With a grade in Primary the KICD design for that band is used, so the picker
 * shows the numbered strands the design prints for the grade being planned
 * ("2.0 Measurement · 2.1 Length"), resolved per grade. Without a grade, or for
 * an area with no transcribed design, the editable starter list is returned so
 * the app never blocks a teacher — it just labels the line as a starting point.
 */
export function strandsFor(subject: string, grade = ""): StrandOpt[] {
  const design = grade ? designFor(subject, grade) : null;
  if (design && design.strands.length) {
    return design.strands.map((entry) => ({
      strand: entry.id ? `${entry.id} ${entry.strand}` : entry.strand,
      substrands: entry.subStrands.map((child) =>
        child.id ? `${child.id} ${subStrandTitle(child, grade)}` : subStrandTitle(child, grade),
      ),
    }));
  }
  return STRANDS[subject] ?? [];
}

/** True when the strands shown came straight off a published design. */
export function strandsAreFromDesign(subject: string, grade = ""): boolean {
  return strandsProvenance(subject, grade) === "design";
}

/**
 * Where the list in front of the teacher came from, so the UI can say so:
 * "design" for a transcribed KICD table, "starter" for an area the designs do
 * not publish a strand table for, "editable" for the app's own starter map.
 */
export function strandsProvenance(subject: string, grade = ""): "design" | "starter" | "editable" {
  const design = grade ? designFor(subject, grade) : null;
  if (design && design.strands.length && design.confidence !== "low") return "design";
  if (design && design.strands.length) return "starter";
  return "editable";
}

/** The note that should sit above the strand picker for this area and grade. */
export function strandsNote(subject: string, grade = ""): string {
  const design = grade ? designFor(subject, grade) : null;
  if (!design) {
    return "These strands are the app's editable starter list. Check them against your current curriculum design before the first lesson.";
  }
  if (design.note) return design.note;
  return strandsProvenance(subject, grade) === "design"
    ? "Taken from the published KICD design for this grade."
    : "This area has no published strand table; the list below is an editable starting point.";
}

export function levelLabel(id: string): string {
  return LEVELS.find((l) => l.id === id)?.label ?? "Junior School";
}
