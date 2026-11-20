import type { KicdDesign, KicdStrand, KicdTopic } from "./kicd.ts";

/**
 * Secondary design index. Junior School uses the Grade 7–9 CBC learning areas;
 * Senior School uses the Grade 10–12 pathway subject families. The official
 * designs are grade-specific, but these shared strands are deliberately held in
 * one design per band so the picker remains stable across a teaching cycle.
 * Teachers can still add a school-specific topic in the topic selector.
 */
const SOURCES = [
  "https://kicd.ac.ke/cbc-materials/curriculum-designs/",
  "https://kicd.ac.ke/cbc-materials/",
];
const J = ["Grade 7", "Grade 8", "Grade 9"];
const S = ["Grade 10", "Grade 11", "Grade 12"];

type Spec = [string, string[]];
const junior: Record<string, Spec[]> = {
  English: [
    ["Listening and speaking", ["Listening for information", "Oral presentations", "Discussion and debate"]],
    ["Reading", ["Comprehension", "Literary texts", "Functional texts"]],
    ["Writing", ["Functional writing", "Creative writing", "Research and referencing"]],
    ["Grammar in use", ["Sentence structure", "Tenses and agreement", "Vocabulary and punctuation"]],
  ],
  Kiswahili: [["Kusikiliza na kuzungumza", ["Mazungumzo", "Hotuba na mjadala"]], ["Kusoma", ["Ufahamu", "Fasihi simulizi", "Fasihi andishi"]], ["Kuandika", ["Insha", "Barua na uandishi wa kiuamilifu"]], ["Sarufi", ["Ngeli", "Nyakati", "Vifungu"]]],
  Mathematics: [["Numbers", ["Integers", "Fractions and decimals", "Ratio, rate and percentage"]], ["Algebra", ["Expressions", "Equations", "Patterns"]], ["Measurement and geometry", ["Area and volume", "Angles and constructions", "Scale and similarity"]], ["Data handling", ["Data collection", "Averages", "Probability"]]],
  "Integrated Science": [["Mixtures, elements and compounds", ["Mixtures", "Acids, bases and indicators", "Elements and compounds"]], ["Living things and their environment", ["Cells", "Nutrition", "Ecology"]], ["Force and energy", ["Forces", "Heat and light", "Electricity and magnetism"]]],
  "Social Studies": [["People and relationships", ["Family and community", "Culture and identity", "Citizenship"]], ["Natural and built environments", ["Map work", "Weather and climate", "Resources"]], ["History and governance", ["Early societies", "Colonial experience", "Constitution and rights"]]],
  "Pre-Technical Studies": [["Safety and materials", ["Workshop safety", "Tools and materials", "Occupations"]], ["Communication and design", ["Technical drawing", "Computer literacy", "Design process"]], ["Entrepreneurship", ["Business ideas", "Money and records", "Consumer awareness"]]],
  "Agriculture and Nutrition": [["Crop production", ["Soil", "Crop establishment", "Pests and diseases"]], ["Animal production", ["Domestic animals", "Feeds and nutrition", "Animal health"]], ["Food and nutrition", ["Nutrients", "Food hygiene", "Meal planning"]]],
  "Creative Arts and Sports": [["Creative arts", ["Drawing and painting", "Craft", "Music and drama"]], ["Movement and games", ["Athletics", "Team games", "Dance"]], ["Health and safety", ["Fitness", "Fair play", "Personal wellbeing"]]],
  "Computer Science": [["Computer systems", ["Hardware and software", "Data representation", "Digital citizenship"]], ["Programming", ["Algorithms", "Sequence and selection", "Iteration"]], ["Networks and safety", ["Internet services", "Cyber safety", "Digital communication"]]],
  "Christian Religious Education": [["The Bible and its message", ["Selected texts", "Teachings", "Applying scripture"]], ["Christian living", ["Relationships", "Moral choices", "Service"]], ["Religion and society", ["Community", "Respect", "Responsible citizenship"]]],
  "Islamic Religious Education": [["Qur'an and Hadith", ["Selected passages", "Meanings", "Hadith"]], ["Faith and worship", ["Articles of faith", "Pillars of Islam", "Prayer"]], ["Islamic living", ["Moral conduct", "Family and community", "Responsibility"]]],
  "Hindu Religious Education": [["Beliefs and teachings", ["Sacred texts", "Stories and teachings", "Reflection"]], ["Worship and practice", ["Prayer", "Festivals", "Symbols"]], ["Values and community", ["Respect", "Service", "Living responsibly"]]],
};
const senior: Record<string, Spec[]> = {
  English: junior.English!, Kiswahili: junior.Kiswahili!, Mathematics: [["Numbers and algebra", ["Indices and logarithms", "Sequences", "Functions and equations"]], ["Geometry and measurement", ["Trigonometry", "Vectors", "Mensuration"]], ["Data and probability", ["Statistics", "Probability", "Modelling"]]],
  Biology: [["Cell biology", ["Cell structure", "Cell physiology", "Chemicals of life"]], ["Ecology and classification", ["Classification", "Ecology", "Evolution"]], ["Human physiology", ["Nutrition", "Transport", "Respiration", "Coordination"]]],
  Chemistry: [["Matter and atomic structure", ["Atomic structure", "Periodic table", "Bonding"]], ["Chemical reactions", ["Stoichiometry", "Acids and bases", "Electrochemistry"]], ["Organic chemistry", ["Hydrocarbons", "Alkanols", "Polymers"]]],
  Physics: [["Mechanics", ["Measurement", "Motion", "Forces and energy"]], ["Waves and optics", ["Waves", "Sound", "Light and lenses"]], ["Electricity and magnetism", ["Current electricity", "Electrostatics", "Magnetism"]]],
  "Computer Science": junior["Computer Science"]!,
  Agriculture: [["Crop production", ["Soil management", "Crop husbandry", "Pests and diseases"]], ["Animal production", ["Animal husbandry", "Nutrition", "Health"]], ["Agribusiness", ["Farm records", "Markets", "Sustainable practice"]]],
  "Business Studies": [["Business and enterprise", ["Entrepreneurship", "Forms of business", "Business growth"]], ["Resources and operations", ["Money", "People and production", "Stock"]], ["Markets and records", ["Demand and supply", "Marketing", "Bookkeeping"]]],
  "History and Citizenship": [["History and evidence", ["Sources", "Early societies", "Kenya's past"]], ["Citizenship and governance", ["Rights and responsibilities", "Constitution", "Public institutions"]], ["Society and heritage", ["Culture", "National identity", "Contemporary issues"]]],
  Geography: [["Map skills and fieldwork", ["Maps and scale", "Fieldwork", "Geospatial tools"]], ["Physical environments", ["Weather and climate", "Landforms", "Water systems"]], ["People, resources and development", ["Population", "Settlements", "Sustainable development"]]],
  "Christian Religious Education": junior["Christian Religious Education"]!, "Islamic Religious Education": junior["Islamic Religious Education"]!, "Home Science": [["Food, nutrition and health", ["Food groups", "Meal planning", "Food safety"]], ["Home and family", ["Family wellbeing", "Consumer choices", "Home management"]], ["Textiles and design", ["Materials", "Clothing care", "Construction skills"]]],
  "Sports Science": [["Movement and performance", ["Training principles", "Fitness testing", "Performance analysis"]], ["Health and wellbeing", ["Nutrition", "Recovery", "Injury prevention"]], ["Sport and society", ["Rules", "Teamwork", "Ethics"]]],
  "Fine Arts": [["Drawing and observation", ["Line and form", "Perspective", "Figure drawing"]], ["Materials and processes", ["Colour", "Printmaking", "Sculpture"]], ["Art history and presentation", ["Art traditions", "Critique", "Portfolio"]]],
  "Music and Dance": [["Creating and performing", ["Singing", "Instruments", "Composition"]], ["Music skills", ["Rhythm", "Pitch", "Notation"]], ["Context and appreciation", ["Musical traditions", "Listening", "Performance reflection"]]],
};

function makeDesign(subject: string, band: "junior" | "senior", grades: string[], specs: Spec[]): KicdDesign {
  const strands: KicdStrand[] = specs.map(([name, children], index) => ({
    id: `${index + 1}.0`,
    strand: name,
    subStrands: children.map((title, childIndex) => ({ id: `${index + 1}.${childIndex + 1}`, title })),
  }));
  const topics: KicdTopic[] = strands.flatMap((strand, strandIndex) => strand.subStrands.map((sub, childIndex) => ({
    term: (["Term 1", "Term 2", "Term 3"] as const)[(strandIndex + childIndex) % 3]!,
    topic: sub.title,
    subtopic: `Key concepts and application in ${sub.title.toLowerCase()}`,
    strand: `${strand.id} ${strand.strand}`,
  })));
  return {
    subject,
    band,
    grades,
    strands,
    topics,
    confidence: "medium",
    lessonsPerWeek: "Follow the school timetable and the current pathway allocation.",
    note: `Secondary ${band === "junior" ? "Junior School" : "Senior School"} starter design aligned to the KICD/CBC learning-area structure. Confirm the current grade PDF and school pathway before final approval.`,
    sources: SOURCES,
  };
}

export const SECONDARY_DESIGNS: KicdDesign[] = [
  ...Object.entries(junior).map(([subject, specs]) => makeDesign(subject, "junior", J, specs)),
  ...Object.entries(senior).map(([subject, specs]) => makeDesign(subject, "senior", S, specs)),
];
