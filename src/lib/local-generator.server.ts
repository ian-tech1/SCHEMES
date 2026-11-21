import type { Brief } from "./ai.server.ts";
import type { ResearchSource } from "./web-research.server.ts";
import { lessonFocusAt } from "./curriculum-content.ts";
import { KJSEA_QUESTION_COUNT, kjseaMarksAt, kjseaTaskLabel } from "./question-plan.ts";

function scope(brief: Brief): string[] {
  const selected = (brief.selectedTopics ?? []).flatMap((row) => [row.topic, ...row.subtopics.map((child) => child.title)]);
  return [...new Set([...selected, brief.substrand, ...brief.substrands].map((item) => item.trim()).filter(Boolean))];
}


function schemePlan(brief: Brief): { strand: string; topic: string; subtopic: string; pagesFrom: string; pagesTo: string }[] {
  const fromSelected = (brief.selectedTopics ?? []).flatMap((row) => {
    const titles = row.subtopics.length ? row.subtopics.map((child) => child.title) : [row.topic];
    return titles.filter(Boolean).map((label) => ({
      strand: row.strand || brief.strand,
      topic: row.topic || label,
      subtopic: label,
      pagesFrom: "",
      pagesTo: "",
    }));
  });
  const seen = new Set(fromSelected.flatMap((item) => [item.subtopic, item.topic]));
  const extras = [brief.substrand, ...brief.substrands]
    .map((item) => item.trim())
    .filter((item) => item && !seen.has(item))
    .map((label) => ({ strand: brief.strand, topic: label, subtopic: label, pagesFrom: "", pagesTo: "" }));
  const plan = [...fromSelected, ...extras];
  return plan.length ? plan : [{ strand: brief.strand || "Strand", topic: brief.subject, subtopic: brief.substrand || brief.subject, pagesFrom: "", pagesTo: "" }];
}

function schemeFocus(brief: Brief, index: number, total: number) {
  const plan = schemePlan(brief);
  return lessonFocusAt(plan, index, total) ?? plan[0]!;
}

function topicAt(brief: Brief, index: number): string {
  const topics = scope(brief);
  return topics[index % Math.max(1, topics.length)] || brief.strand || brief.subject;
}

function openExcerpt(sources: ResearchSource[]): ResearchSource | undefined {
  return sources.find((source) => source.excerpt && source.excerpt.length > 80);
}

function schemeDraft(brief: Brief) {
  const weekCount = Math.max(1, brief.weekTo - brief.weekFrom + 1);
  const source = openExcerpt(brief.researchSources ?? []);
  const totalLessons = weekCount * brief.lessonsPerWeek;
  const weeks = Array.from({ length: weekCount }, (_, index) => {
    const week = brief.weekFrom + index;
    const planned = schemeFocus(brief, index * brief.lessonsPerWeek, totalLessons);
    const focus = planned.subtopic;
    return {
      week,
      focus,
      outcomes: [
        `Identify the key terms and examples in ${focus} from the teacher-approved learning source.`,
        `Explain one idea in ${focus} using a clear example and evidence from the lesson material.`,
        `Apply the taught process for ${focus} to a new classroom or community task and explain the result.`,
      ],
      inquiry: [`How can a learner explain ${focus} using evidence from the approved learning material?`, `Where might the class observe or apply ${focus} safely in a familiar setting?`],
      experiences: [
        `The teacher identifies the selected learning outcome and models how to find a supporting example in the approved source.`,
        `Learners work in pairs to record key vocabulary and one example for ${focus}, then explain their choice.`,
        `Learners complete an individual transfer task; the teacher checks the evidence and gives one next-step prompt.`,
      ],
      competencies: ["Communication and collaboration", "Critical thinking and problem solving"],
      values: ["Responsibility", "Respect"],
      pcis: [],
      resources: ["Current KICD curriculum design linked in the library", source?.title || "Teacher-approved textbook or source text", "Exercise books and locally available learning materials"],
      assessment: `Review each learner's recorded example, explanation and application of ${focus}; note who needs a modelled next step.`,
      lessonHints: Array.from({ length: brief.lessonsPerWeek }, (_, lessonIndex) => {
        const lesson = schemeFocus(brief, index * brief.lessonsPerWeek + lessonIndex, totalLessons);
        return `${lesson.strand} — ${lesson.subtopic}: ${["identify and discuss", "model and practise", "apply and explain", "review and reflect"][lessonIndex % 4]}`;
      }),
      homework: `Find or review one example of ${focus} in the approved material and write what evidence supports the explanation.`,
    };
  });
  const lessonLines = brief.compact ? [] : Array.from({ length: totalLessons }, (_, index) => {
    const weekIndex = Math.floor(index / brief.lessonsPerWeek);
    const planned = schemeFocus(brief, index, totalLessons);
    const focus = planned.subtopic;
    return {
      strand: planned.strand,
      topic: planned.topic,
      substrand: focus,
      pagesFrom: "",
      pagesTo: "",
      outcomes: [
        `Identify one defining feature of ${focus} in the approved learning material and record it accurately.`,
        `Explain a worked example of ${focus} with a suitable vocabulary term and the reasoning used.`,
        `Apply the class method for ${focus} in a new task and present evidence that supports the response.`,
      ],
      experiences: [
        `Teacher models one example of ${focus}; learners note the steps and identify the evidence used.`,
        `Pairs complete a second task, compare reasoning and revise one response using peer feedback.`,
      ],
      inquiry: [`How can the class show that its example of ${focus} is accurate?`],
      resources: [source?.title || "Teacher-approved text", "Learner exercise book", "Locally available examples or materials"],
      assessment: `Check the learner's recorded example, reasoning and evidence for ${focus}; give specific feedback on one next step.`,
      week: brief.weekFrom + weekIndex,
      lesson: (index % brief.lessonsPerWeek) + 1,
    };
  });
  return {
    overview: `Locally structured CBE scheme for ${brief.grade} ${brief.subject}, based only on the teacher-selected scope: ${scope(brief).join(", ") || brief.substrand}. Confirm exact outcomes, pacing and materials against the current KICD design before teaching.`,
    csl: `Learners identify a safe, locally available example related to ${brief.substrand} and explain how the lesson connects to responsible participation in the community.`,
    weeks,
    lessonLines,
  };
}

function lessonDraft(brief: Brief) {
  const topic = topicAt(brief, 0);
  const source = openExcerpt(brief.researchSources ?? []);
  const duration = brief.lessonMinutes;
  const intro = Math.max(4, Math.round(duration * 0.15));
  const development = Math.round(duration * 0.4);
  const application = Math.round(duration * 0.3);
  const conclusion = duration - intro - development - application;
  return {
    duration: `${duration} minutes`,
    weekLabel: `Week ${brief.focusWeek ?? brief.weekFrom}${brief.focusLesson ? ` · Lesson ${brief.focusLesson}` : ""}`,
    outcomes: [
      `By the end of the lesson, the learner should be able to identify key terms or features of ${topic} in the approved learning material.`,
      `By the end of the lesson, the learner should be able to explain one example of ${topic} using evidence and suitable vocabulary.`,
      `By the end of the lesson, the learner should be able to apply the class method for ${topic} in a new task and describe the reasoning used.`,
    ],
    inquiry: [`How can learners use the approved material to explain ${topic}?`, `Where could a safe, familiar example of ${topic} be observed or applied?`],
    resources: [source?.title || "Teacher-approved text", "Learner exercise books", "Locally available examples or materials"],
    steps: [
      { phase: "Introduction", minutes: intro, teacher: `Connect the previous lesson to ${topic}, state the selected outcome, and ask learners to notice one relevant example in the approved text.`, learners: "Share prior ideas, listen to the focus, and record one question about the topic." },
      { phase: "Development", minutes: development, teacher: `Model how to identify a feature of ${topic}, find evidence in the approved source, and explain an example step by step.`, learners: "Annotate the example, identify the evidence, and rehearse an explanation with a partner." },
      { phase: "Application", minutes: application, teacher: `Set one supported task and one extension using ${topic}; circulate, check learners' working, and give precise feedback.`, learners: "Complete the task individually or in pairs, record reasoning, and compare the response with the stated success criteria." },
      { phase: "Conclusion", minutes: conclusion, teacher: "Use an exit question to check the outcome, address one observed misconception, and record who needs follow-up.", learners: "Summarise one idea, cite the evidence or method used, and write one next-step question." },
    ],
    support: `Provide a worked example for ${topic}, pre-teach essential vocabulary, and use a guided first step before independent work.`,
    extension: `Ask learners to create a new example of ${topic}, justify the method, and identify evidence that could disprove the explanation.`,
    assessment: `Collect the written example and explanation; check accuracy against the current KICD design and the approved class text.`,
    rubric: [
      { level: "Exceeds Expectations", descriptor: "Explains the idea accurately, uses relevant evidence, and transfers the method to a new example independently." },
      { level: "Meets Expectations", descriptor: "Identifies the main idea and completes the task with a clear example and suitable reasoning." },
      { level: "Approaches Expectations", descriptor: "Shows part of the idea but needs prompts to connect the example with the evidence or method." },
      { level: "Below Expectations", descriptor: "Needs a modelled first step, vocabulary support and a shorter guided task before trying independently." },
    ],
    homework: `Review the selected ${topic} passage or class example and write two sentences: one accurate idea and the evidence that supports it.`,
    reflection: "Which learner evidence showed the outcome was met? Which step or vocabulary needs reteaching?",
    priorKnowledge: `Learners should be able to describe a familiar example related to ${topic} and use the key terms already taught in class.`,
    successCriteria: [`Names a relevant feature of ${topic}.`, "Supports the explanation with evidence from an approved learning source.", "Completes the task and explains one reasoning step."],
    competencies: ["Communication and collaboration", "Critical thinking and problem solving"],
    values: ["Responsibility", "Respect"],
    pcis: [],
  };
}

function noteFamily(brief: Brief, topic: string): "math" | "science" | "language" | "faith" | "social" | "skill" {
  const blob = `${brief.subject} ${brief.strand} ${topic}`.toLowerCase();
  if (/math|algebra|number|geometry|mensuration|statistic|ratio|percent|equation|integer/.test(blob)) return "math";
  if (/science|biology|chemistry|physics|agric|health|environment/.test(blob)) return "science";
  if (/english|kiswahili|language|literature|gramm|composition|writing/.test(blob)) return "language";
  if (/cre\b|ire\b|hre|christian|islam|religious|bible|quran/.test(blob)) return "faith";
  if (/social|history|geography|citizen|people|population|life skills/.test(blob)) return "social";
  return "skill";
}

function noteVocabulary(topic: string, family: ReturnType<typeof noteFamily>) {
  const shared = [
    { term: topic, meaning: `The idea this sub-strand teaches. A learner should be able to define it and give an example.` },
    { term: "Example", meaning: "A particular case that shows how the idea works." },
    { term: "Non-example", meaning: "A case that looks close but does not belong, used to show the boundary of the idea." },
  ];
  const extra = family === "math"
    ? [
        { term: "Working", meaning: "Every step written in order, not only the final figure." },
        { term: "Unit", meaning: "The measure that belongs with the answer, such as cm, kg or KSh." },
        { term: "Check", meaning: "A second method, such as substitution or estimation, used to test the answer." },
        { term: "Term", meaning: "One number or expression in a calculation or a sequence." },
        { term: "Operation", meaning: "Add, subtract, multiply or divide, or the rule the question asks for." },
      ]
    : family === "science"
      ? [
          { term: "Observation", meaning: "What you see, hear or measure, written before you explain it." },
          { term: "Variable", meaning: "The one thing you change in a fair test, while other things stay the same." },
          { term: "Safety", meaning: "The rule that keeps the learner, the class and the materials from harm." },
          { term: "Evidence", meaning: "The reading or observation that supports the conclusion." },
          { term: "Conclusion", meaning: "What the evidence allows you to say, and no more." },
        ]
      : family === "language"
        ? [
            { term: "Word class", meaning: "The group a word belongs to, such as noun, verb or adjective." },
            { term: "Sentence", meaning: "A group of words that makes a complete thought." },
            { term: "Context", meaning: "The words around a word, which help you find its meaning." },
            { term: "Paragraph", meaning: "A group of sentences about one idea." },
            { term: "Audience", meaning: "The person the writing or speech is meant for." },
          ]
        : family === "faith"
          ? [
              { term: "Belief", meaning: "What a faith community holds to be true about God and how people should live." },
              { term: "Value", meaning: "A habit of living, such as honesty or care, that the lesson asks the learner to practise." },
              { term: "Consequence", meaning: "The result that follows a choice." },
              { term: "Community", meaning: "The people the learner lives, worships or learns with." },
              { term: "Source", meaning: "The story, teaching or class text the point comes from. Do not invent a verse." },
            ]
          : family === "social"
            ? [
                { term: "Cause", meaning: "What brings a situation about." },
                { term: "Effect", meaning: "What follows from a situation." },
                { term: "Community", meaning: "The people and place the learner belongs to." },
                { term: "Evidence", meaning: "A fact from the class text or a local example that supports the point." },
                { term: "Responsibility", meaning: "The part a learner, a family or a leader is expected to play." },
              ]
            : [
                { term: "Material", meaning: "What you use to make or repair the item." },
                { term: "Tool", meaning: "What you use to shape, measure or join the material." },
                { term: "Step", meaning: "One action in the method, done in order." },
                { term: "Safety", meaning: "How you hold, store and use the tool so nobody is hurt." },
                { term: "Finish", meaning: "How you judge that the piece is complete, neat and fit for use." },
              ];
  return [...shared, ...extra];
}

function teachingParagraphs(family: ReturnType<typeof noteFamily>, strand: string, topic: string): string[] {
  if (family === "math") {
    return [
      `STRAND: ${strand}. SUB-STRAND: ${topic}. Meaning. ${topic} is the idea the class uses to move from a question to a checked answer. Three cases belong: a direct calculation, a word problem, and a reverse check. A guess with no working does not belong.`,
      `Importance of ${topic}. It is used to buy and to give change. It is used to measure a school field or a room. It is used to compare two results. It prepares the next sub-strand in the same strand.`,
      `Steps. 1. Write what is given and what is asked. 2. Choose the rule for ${topic}. 3. Show every line, including the sign and the unit. 4. Check by substitution or by estimation. 5. Write the answer on its own line.`,
      `Where signs are part of ${topic}, two like signs give a positive result and two unlike signs give a negative result. If the topic is not about signs, name the operation and keep the unit.`,
      `A Kenyan case. Use shillings, a school field, a market mass or a class score only when the numbers fit ${topic}. The place changes. The rule does not.`,
      `Go further than the textbook. After the answer, say how you checked it, and name the mistake a learner makes if a step is skipped.`,
    ];
  }
  if (family === "science") {
    return [
      `STRAND: ${strand}. SUB-STRAND: ${topic}. Meaning. ${topic} is studied by looking, measuring and explaining. State what it is in one sentence before you list its parts.`,
      `Parts or ideas under ${topic}. Name each part in its own sentence. Say what that part does. Do not mix two parts in one line.`,
      `Importance in daily life. It helps in health, when a learner explains a safe habit. It helps on the farm, when a learner explains a growing condition. It helps at home, when a learner explains a material or a machine. It helps the class decide using evidence, not a guess.`,
      `A fair look at ${topic}. Change one thing. Keep the other things the same. Record what you observe. Then say what the record supports.`,
      `Safety. Name the hazard for this sub-strand, the protective habit, and what to do if something spills, breaks or gets too hot.`,
      `Go further. Write the observation first and the conclusion second. A conclusion that the record does not support is not yet a conclusion.`,
    ];
  }
  if (family === "language") {
    return [
      `STRAND: ${strand}. SUB-STRAND: ${topic}. Meaning. Give the class one sentence they can copy: what ${topic} is, and what job it does in a sentence or a text.`,
      `Groups. Sort examples into the groups that belong to ${topic}. Persons, places, things and ideas is one useful sort when the sub-strand is about naming words. Use the groups that fit this sub-strand if it is not about naming words.`,
      `Examples you can see and examples you cannot see. A desk is a thing you can point at. Courage is an idea you cannot point at. Both can still be the language item if the definition allows it.`,
      `In a sentence. Show ${topic} inside a short Kenyan classroom sentence, then point at the word or the part that does the work.`,
      `Why it matters. A learner who can name ${topic} can choose the right word, punctuate, and answer a comprehension item without guessing.`,
      `Go further. Give one non-example and say why it does not belong. Then set a five-item exercise the learner does with the book closed.`,
    ];
  }
  if (family === "faith") {
    return [
      `STRAND: ${strand}. SUB-STRAND: ${topic}. Meaning. ${topic} is taught from the class text. Write the meaning in one sentence. Do not invent a verse or a page from a commercial booklet.`,
      `Main points. State three things a learner should underline. Each point is its own sentence. Name the story or teaching only as the class text gives it.`,
      `Why it matters. It guides a choice at school. It guides how a learner treats a classmate. It guides care for the community. It asks for a habit, not only a definition.`,
      `Causes or reasons, where the sub-strand has them. List each reason on its own line. If the sub-strand is not about causes, list the parts of the teaching instead.`,
      `Consequences. A good choice and a harmful choice do not end the same way. State both results in the learner's own words.`,
      `Go further. Add the value the class can practise this week, and the mistake of copying a point without saying what it asks the learner to do.`,
    ];
  }
  if (family === "social") {
    return [
      `STRAND: ${strand}. SUB-STRAND: ${topic}. Meaning. ${topic} is about people, place or community life. Define it in one sentence a Grade learner can copy.`,
      `Main points. Give four points. Each point is one sentence. Use a Kenyan county, school or local activity only as an illustration, not as a fact you have not checked.`,
      `Causes. Say what brings the situation about. Keep each cause separate.`,
      `Effects. Say what follows for families, for learners and for the place. Separate a helpful effect from a harmful one.`,
      `Responsibility. Name what a learner can do, what a family can do, and what a leader can do. Do not stop at the definition.`,
      `Go further. Ask the learner to support one point with evidence from the class text or from a visit, and to say what would count as a weak claim.`,
    ];
  }
  return [
    `STRAND: ${strand}. SUB-STRAND: ${topic}. Meaning. ${topic} is a practical idea. Say what is made, repaired, drawn or performed, and what "done well" looks like.`,
    `Materials and tools. Name what is needed. Say which tool does which job. A learner should not start until the list is complete.`,
    `Steps. Write the method in order. One action is one sentence. Do not skip the measuring or the marking out.`,
    `Safety. How the tool is held, where the hands stay, and how the piece is stored when the lesson ends.`,
    `A school task. Make or plan one item that uses ${topic}. Say who will use it and how you will know it is fit for use.`,
    `Go further. Judge the work on accuracy, finish and safety, not only on whether it was completed.`,
  ];
}

function teachingExamples(family: ReturnType<typeof noteFamily>, strand: string, topic: string, count: number): string[] {
  return Array.from({ length: count }, (_, offset) => {
    const e = offset + 1;
    if (family === "math" && /integer|directed|negative/i.test(topic)) {
      const a = -3 - e;
      const b = 4 + e;
      return `Example ${e}. Evaluate ${a} + ${b}.\n1. Start at ${a} on the number line.\n2. Move ${b} steps to the right.\n3. ${a} + ${b} = ${a + b}.\nAnswer: ${a + b}`;
    }
    if (family === "math" && /equation|linear|algebra/i.test(topic)) {
      const x = 2 + e;
      const coeff = 2 + (e % 3);
      return `Example ${e}. Solve ${coeff}x + ${e} = ${coeff * x + e}.\n1. Subtract ${e} from both sides.\n2. Divide by ${coeff}.\n3. x = ${x}.\n4. Check: ${coeff}(${x}) + ${e} = ${coeff * x + e}.\nAnswer: x = ${x}`;
    }
    if (family === "math" && /ratio|rate|percent/i.test(topic)) {
      const marked = 200 * e;
      const percent = 5 * e;
      const discount = (marked * percent) / 100;
      return `Example ${e}. A shop offers ${percent}% off an item marked KSh ${marked}.\n1. Discount = KSh ${discount}.\n2. Amount paid = KSh ${marked - discount}.\nAnswer: KSh ${marked - discount}`;
    }
    if (family === "math") {
      const a = 12 + e;
      const b = 3 + (e % 4);
      return `Example ${e}. A class uses ${a} items in groups of ${b} while studying ${topic}.\n1. ${a} ÷ ${b} = ${Math.floor(a / b)} groups, remainder ${a % b}.\n2. State what the remainder means in the story.\nAnswer: ${Math.floor(a / b)} groups, remainder ${a % b}.`;
    }
    if (family === "language") {
      return `Example ${e}. Read: "The learners in ${strand} wrote about ${topic}."\n1. Name the naming words.\n2. Say what job ${topic} does in the sentence.\nAnswer: learners is a naming word; ${topic} is the idea the sentence is about.`;
    }
    if (family === "science") {
      return `Example ${e}. A class investigates ${topic}.\n1. They change one thing and keep the rest the same.\n2. They write the observation before the conclusion.\nAnswer: the fair test has one change, and the conclusion follows the record.`;
    }
    if (family === "faith") {
      return `Example ${e}. A learner explains ${topic} to a classmate.\n1. Give the meaning in one sentence.\n2. Name one habit it asks for at school.\nAnswer: the meaning is stated, and the habit is practical.`;
    }
    if (family === "social") {
      return `Example ${e}. Use ${topic} to explain one change in a Kenyan school community.\n1. State one cause.\n2. State one effect.\nAnswer: the cause and the effect are different sentences, and both stay on ${topic}.`;
    }
    return `Example ${e}. Plan a short task on ${topic} in ${strand}.\n1. List the materials.\n2. Write the first three steps.\n3. Name the safety point.\nAnswer: materials, order and safety are all present.`;
  });
}

function notesDraft(brief: Brief) {
  const plan = schemePlan(brief);
  const ordered = plan.map((item) => ({ strand: item.strand || brief.strand, label: item.subtopic }));
  const primary = ordered[0]?.label || brief.substrand || brief.strand || brief.subject;
  const family = noteFamily(brief, primary);
  const full = brief.depth !== "summary";

  const summary = full
    ? `${brief.grade} ${brief.subject}. STRAND: ${brief.strand}. These notes follow the teaching-notes order: the strand, then each sub-strand, then the meaning, the importance, the parts or steps, worked examples, and an exercise. They go further than a short textbook page by adding the check and the mistake to avoid. Finish one strand before the next. Confirm every fact against the current curriculum design and the approved class text before you print.`
    : `Short notes for ${primary}.`;

  const contents = ordered.slice(0, full ? 12 : 3).map((item, index) => ({
    strand: item.strand || "Strand",
    substrand: item.label,
    page: 3 + index * 2,
  }));

  const sections = ordered.slice(0, full ? 8 : 2).map((item, idx) => {
    const topic = item.label;
    const sectionFamily = noteFamily(brief, `${topic} ${item.strand}`);
    return {
      heading: `STRAND: ${item.strand}    ${idx + 1}. ${topic}`,
      paragraphs: teachingParagraphs(sectionFamily, item.strand, topic),
      examples: teachingExamples(sectionFamily, item.strand, topic, full ? 5 : 1),
    };
  });

  const tryThis = full
    ? Array.from({ length: 12 }, (_, i) => {
        const label = ordered[i % Math.max(1, ordered.length)]?.label ?? primary;
        if (family === "math") return `Exercise ${i + 1}. Solve a fresh item on ${label}. Show every line and write the answer with the unit.`;
        if (family === "language") return `Exercise ${i + 1}. Write one sentence that uses ${label}, then underline the part that does the work.`;
        if (family === "science") return `Exercise ${i + 1}. State the meaning of ${label}, then one observation that would support it.`;
        if (family === "faith") return `Exercise ${i + 1}. Give the meaning of ${label} and one habit it asks for at school.`;
        if (family === "social") return `Exercise ${i + 1}. Give one cause and one effect of ${label}.`;
        return `Exercise ${i + 1}. List the materials, the first three steps and one safety point for ${label}.`;
      })
    : [
        `Question 1. Give one clear example of ${primary}.`,
        `Question 2. Explain the method you used.`,
        `Question 3. State the unit or the evidence for your answer.`,
      ];

  const answerKey = full
    ? tryThis.map((item, i) => `Answer ${i + 1}. ${item.replace(/^Exercise \d+\. /, "")} The model answer names the idea, shows the step or the evidence, and stops when the question is answered.`)
    : [`Answer 1. A clear example of ${primary}.`, `Answer 2. The method in the correct order.`, `Answer 3. The unit or the evidence is stated.`];

  return {
    summary,
    objectives: full
      ? [
          `By the end of these notes, the learner should be able to define ${primary} and state its importance.`,
          `By the end of these notes, the learner should be able to apply the correct method or rule to solve problems on ${primary}.`,
          `By the end of these notes, the learner should be able to show complete working and check the answer.`,
        ]
      : [`Understand the main idea of ${primary}.`],
    prerequisite: `The learner should already know basic number operations, the use of units, and how to read a simple word problem.`,
    contents,
    vocabulary: noteVocabulary(primary, family).slice(0, full ? 8 : 4),
    sections,
    tryThis,
    answerKey,
    answerKeyNote: "Model solutions for the teacher. Check every figure, unit and example against the approved text before marking.",
    remember: full
      ? [
          "Read the contents and finish one strand before you start the next.",
          "Read the definition, then the importance and the rules.",
          "Work every example with a pencil before you look at the answer.",
          "Do the exercise and check your working against the answer key.",
          "Always write the unit in the final answer.",
          "Show every line of working, not only the final figure.",
          "Check by substitution or estimation before you move on.",
          "Keep the sub-strands of one strand together in your exercise book.",
        ]
      : ["Check the selected topic.", "Show your working."],
    mistakes: full
      ? [
          "Skipping steps — show every line of working.",
          "Forgetting the unit — include KSh, cm, kg or the correct unit.",
          "Using the wrong rule — go back to the definition and the list of methods.",
          "Not checking the answer — substitute or estimate before you finish.",
          "Mixing two strands in one working — finish the current strand first.",
          "Copying an example without changing the numbers — write a new calculation.",
        ]
      : ["Skipping the reasoning."],
  };
}


type OfflineMath = { prompt: string; answer: string; marking: string; correct?: string; distractors?: string[] };

function mathItem(topic: string, index: number): OfflineMath | null {
  const n = index % 6;
  if (/percent|percentage|discount|rate/i.test(topic)) {
    const amount = 240 + n * 120;
    const percent = [15, 20, 25, 30, 10, 40][n]!;
    const value = amount * percent / 100;
    return { prompt: `Calculate ${percent}% of KSh ${amount}. Show the percentage conversion and calculation.`, correct: `KSh ${value}`, distractors: [`KSh ${amount - value}`, `KSh ${value + 10}`, `KSh ${amount / percent}`], answer: `${percent}% = ${percent}/100. Then ${percent}/100 × ${amount} = KSh ${value}.`, marking: `1 mark for converting ${percent}% to ${percent}/100; 1 mark for multiplying by ${amount}; 1 mark for KSh ${value}.` };
  }
  if (/fraction/i.test(topic)) {
    const items = [
      { a: "1/2", b: "1/3", answer: "5/6", work: "3/6 + 2/6 = 5/6" },
      { a: "3/4", b: "1/8", answer: "5/8", work: "6/8 − 1/8 = 5/8" },
      { a: "2/5", b: "1/10", answer: "1/2", work: "4/10 + 1/10 = 5/10 = 1/2" },
      { a: "7/8", b: "1/4", answer: "5/8", work: "7/8 − 2/8 = 5/8" },
      { a: "2/3", b: "1/6", answer: "5/6", work: "4/6 + 1/6 = 5/6" },
      { a: "5/6", b: "1/3", answer: "1/2", work: "5/6 − 2/6 = 3/6 = 1/2" },
    ][n]!;
    return { prompt: `Calculate ${items.a} + ${items.b} if the second fraction is positive, or ${items.a} − ${items.b} if the second fraction is subtracted. Use the operation stated by your teacher: ${n % 2 ? "subtract" : "add"}.`, correct: items.answer, distractors: ["1/6", "7/8", "3/4"], answer: `${items.a} ${n % 2 ? "−" : "+"} ${items.b}: ${items.work}.`, marking: "1 mark for a common denominator; 1 mark for the correct numerator operation; 1 mark for simplifying the final fraction." };
  }
  if (/ratio|proportion/i.test(topic)) {
    const total = 84 + n * 12;
    const a = 3 + (n % 2);
    const b = 4 + (n % 3);
    const first = total * a / (a + b);
    const second = total - first;
    return { prompt: `Share ${total} counters in the ratio ${a}:${b}. Find both shares and show the total number of parts.`, correct: `${first} and ${second}`, distractors: [`${second} and ${first}`, `${total / a} and ${total / b}`, `${a} and ${b}`], answer: `Total parts = ${a} + ${b} = ${a + b}. One part = ${total}/${a + b} = ${total / (a + b)}. Shares: ${a} × ${total / (a + b)} = ${first} and ${b} × ${total / (a + b)} = ${second}.`, marking: `1 mark for ${a + b} total parts; 1 mark for the value of one part; 1 mark for the shares ${first} and ${second}.` };
  }
  if (/algebra|equation|linear|factoris/i.test(topic)) {
    const items = [
      { eq: "3x + 5 = 20", x: 5, work: "3x = 15, so x = 5" },
      { eq: "4x − 7 = 13", x: 5, work: "4x = 20, so x = 5" },
      { eq: "5(x − 2) = 20", x: 6, work: "x − 2 = 4, so x = 6" },
      { eq: "2x + 9 = 25", x: 8, work: "2x = 16, so x = 8" },
      { eq: "7x − 6 = 29", x: 5, work: "7x = 35, so x = 5" },
      { eq: "3(x + 4) = 27", x: 5, work: "x + 4 = 9, so x = 5" },
    ][n]!;
    return { prompt: `Solve ${items.eq} and verify the value by substitution.`, correct: `x = ${items.x}`, distractors: [`x = ${items.x + 1}`, `x = ${items.x - 1}`, `x = ${items.x * 2}`], answer: `${items.work}. Check: substitute x = ${items.x} into the original equation and confirm both sides are equal.`, marking: "1 mark for an equivalent equation; 1 mark for the correct value of x; 1 mark for checking by substitution." };
  }
  if (/area|perimeter|mensuration/i.test(topic)) {
    const length = 12 + n;
    const width = 7 + (n % 3);
    const area = length * width;
    const perimeter = 2 * (length + width);
    const askArea = /area/i.test(topic) || !/perimeter/i.test(topic);
    const value = askArea ? area : perimeter;
    return { prompt: `A rectangle is ${length} cm long and ${width} cm wide. Find its ${askArea ? "area" : "perimeter"} and include the correct unit.`, correct: `${value} cm${askArea ? "²" : ""}`, distractors: [`${perimeter} cm²`, `${area + length} cm`, `${length + width} cm`], answer: askArea ? `Area = length × width = ${length} × ${width} = ${area} cm².` : `Perimeter = 2 × (length + width) = 2 × (${length} + ${width}) = ${perimeter} cm.`, marking: "1 mark for choosing the correct formula; 1 mark for substitution; 1 mark for the correct value and unit." };
  }
  if (/mean|average|data|statistics/i.test(topic)) {
    const values = [4 + n, 7 + n, 9 + n, 10 + n];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return { prompt: `Find the mean of ${values.join(", ")}. Show the total and number of values.`, correct: String(mean), distractors: [String(mean + 1), String(values.length), String(values.reduce((sum, value) => sum + value, 0))], answer: `Total = ${values.reduce((sum, value) => sum + value, 0)}. Divide by ${values.length}: mean = ${mean}.`, marking: "1 mark for adding the values; 1 mark for dividing by the number of values; 1 mark for the correct mean." };
  }
  if (/probability/i.test(topic)) {
    return { prompt: `A fair six-sided die is rolled. What is the probability of getting an even number? Show the favourable outcomes and total outcomes.`, correct: "1/2", distractors: ["1/6", "2/3", "3/4"], answer: "Even outcomes are 2, 4 and 6: 3 favourable outcomes out of 6. Probability = 3/6 = 1/2.", marking: "1 mark for identifying the three even outcomes; 1 mark for 3/6; 1 mark for simplifying to 1/2." };
  }
  if (/indices|index|exponent|power/i.test(topic)) {
    return { prompt: "Simplify 2³ × 2⁴. State the index law used and evaluate the result.", correct: "2⁷ = 128", distractors: ["2¹² = 4096", "4⁷ = 16384", "2⁷ = 64"], answer: "For powers with the same base, add indices: 2³ × 2⁴ = 2⁽³⁺⁴⁾ = 2⁷ = 128.", marking: "1 mark for adding the indices; 1 mark for writing 2⁷; 1 mark for evaluating 128." };
  }
  if (/sequence|pattern/i.test(topic)) {
    const start = 4 + n;
    const step = 3 + (n % 3);
    const terms = [start, start + step, start + 2 * step, start + 3 * step];
    return { prompt: `The sequence begins ${terms.join(", ")}. Find the next term and state the rule.`, correct: String(terms[3]! + step), distractors: [String(terms[3]! + 1), String(terms[3]! * 2), String(terms[3]! - step)], answer: `The difference is ${step} each time. Add ${step} to ${terms[3]}: the next term is ${terms[3]! + step}.`, marking: "1 mark for identifying the common difference; 1 mark for applying the rule; 1 mark for the correct next term." };
  }
  if (/angle|triangle|geometry/i.test(topic)) {
    const a = 45 + n;
    const b = 65;
    const missing = 180 - a - b;
    return { prompt: `Two interior angles of a triangle are ${a}° and ${b}°. Find the third angle and show the angle-sum rule.`, correct: `${missing}°`, distractors: [`${180 - a}°`, `${a + b}°`, `${360 - a - b}°`], answer: `Angles in a triangle sum to 180°. Third angle = 180° − ${a}° − ${b}° = ${missing}°.`, marking: `1 mark for stating the 180° rule; 1 mark for correct subtraction; 1 mark for ${missing}°.` };
  }
  return null;
}

const distractorLabels = ["A", "B", "C", "D"];

function assessmentDraft(brief: Brief) {
  const isKjsea = brief.assessmentMode === "kjsea-format";
  const count = isKjsea ? KJSEA_QUESTION_COUNT : Math.max(1, brief.questionCount ?? (brief.depth === "summary" ? 10 : 45));
  const sources = brief.researchSources ?? [];
  const source = openExcerpt(sources);
  const math = /math/i.test(brief.subject);
  const topics = scope(brief);
  const questions = Array.from({ length: brief.chunk?.part ? brief.questionCount ?? count : count }, (_, index) => {
    const globalIndex = (brief.chunk?.fromNumber ?? 1) - 1 + index;
    const topic = topics[globalIndex % Math.max(1, topics.length)] || brief.substrand || brief.subject;
    const type = isKjsea ? (globalIndex < 20 ? "mcq" : "structured") : (brief.questionTypes?.length ? brief.questionTypes[globalIndex % brief.questionTypes.length] : "structured");
    const computed = math ? mathItem(topic, globalIndex) : null;
    const answer = computed?.answer ?? `Model criterion: the learner gives an accurate response about ${topic}, supports it with evidence or working from the approved material, and explains the reasoning. Accept a correct equivalent explanation.`;
    let marking = computed?.marking ?? `Award credit for a relevant, accurate explanation of ${topic}, supporting evidence from an approved class source, and clear reasoning. Teacher must supply topic-specific model facts before issuing this item.`;
    let prompt = computed?.prompt ?? `Using the approved class source for ${topic}, answer the question with accurate subject detail and show the evidence or working that supports the response. State any assumption you make.`;
    let options: string[] = [];
    let finalAnswer = answer;
    let marks = isKjsea ? kjseaMarksAt(globalIndex) : Math.max(1, Math.min(5, computed ? 3 : type === "structured" ? 4 : 2));
    if (isKjsea && type === "structured") {
      const partA = marks >= 5 ? 2 : marks === 3 ? 1 : 2;
      const partB = marks - partA;
      const stem = computed?.prompt ?? `Learners in a Junior School are solving a problem on ${topic}.`;
      prompt = `${kjseaTaskLabel(globalIndex)}.\n${stem}\n(a) State the rule or the first step, and show it. (${partA} mark${partA === 1 ? "" : "s"})\n(b) Finish the working and write the final answer with the unit. (${partB} marks)`;
      finalAnswer = `(a) The rule or first step for ${topic}.\n(b) ${answer}`;
      marking = `(a) ${partA} mark${partA === 1 ? "" : "s"} for the correct rule or first step. (b) ${partB} marks: ${marking}`;
    }
    if (type === "mcq") {
      const correct = computed?.correct ?? `An accurate response about ${topic} supported by the taught material and reasoning.`;
      const distractors = computed?.distractors ?? ["A response about an unrelated topic with no supporting evidence.", "A guess that does not explain the method or source used.", "A copied claim that has not been checked against the lesson material."];
      const choices = [correct, ...distractors].slice(0, 4);
      const correctIndex = globalIndex % 4;
      const rotated = Array.from({ length: 4 }, (_, choiceIndex) => choices[(choiceIndex - correctIndex + 4) % 4]!);
      options = rotated.map((choice, choiceIndex) => `${distractorLabels[choiceIndex]}. ${choice}`);
      finalAnswer = `${distractorLabels[correctIndex]}. ${correct}`;
      if (isKjsea) prompt = `Section A. ${prompt}`;
    }
    return {
      number: brief.chunk?.fromNumber ? brief.chunk.fromNumber + index : globalIndex + 1,
      type,
      marks,
      prompt,
      options,
      answer: finalAnswer,
      marking,
    };
  });
  return {
    instructions: isKjsea
      ? "School practice in the layout of the 2026 Kenya Junior School Education Assessment Mathematics paper. This is not a KNEC paper. Time: 2 hours. Answer all the questions in the spaces provided. Mathematical tables have been provided. Silent non-programmable electronic calculators may be used. Section A (20 marks): questions 1–20 are multiple choice. Choose the correct answer and write A, B, C or D in the answer grid. Section B (80 marks): questions 21–40. Show all the working in the spaces provided. Task 1 is questions 21–25 (20 marks). Task 2 is 26–28 (10 marks). Task 3 is 29–33 (23 marks). Task 4 is 34–38 (19 marks). Task 5 is 39–40 (8 marks). For π use 3.142 unless the question says otherwise."
      : "Teacher-created practice template. Check every subject fact, example, answer and mark against the current KICD design and approved class material before use.",
    timeMinutes: isKjsea ? 120 : Math.min(120, Math.max(20, Math.round(count * 1.8))),
    questions,
    qualityNotice: `Local ${source ? "web-source-assisted " : "structured "}teacher-editable practice template. ${source ? `It cites ${source.title}; source licensing and attribution are shown below.` : "The online reference lookup returned no usable open-source excerpt for this request."} It is not a factual answer-validated paper or an authentic KNEC past paper. No KICD or KNEC endorsement or approval is claimed. Replace generic items and verify all subject content before giving this to learners.`,
  };
}

/** Make a locally structured draft only after configured AI providers have failed. */
export function createLocalDraft(brief: Brief): Record<string, unknown> {
  if (brief.kind === "scheme") return schemeDraft(brief);
  if (brief.kind === "lesson") return lessonDraft(brief);
  if (brief.kind === "notes") return notesDraft(brief);
  return assessmentDraft(brief);
}
