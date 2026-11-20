export type StudioField = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
};

export type StudioDraft = {
  title: string;
  lines: string[];
};

export type StudioTool = {
  id: string;
  title: string;
  blurb: string;
  fields: StudioField[];
  build: (input: Record<string, string>) => StudioDraft;
};

function val(input: Record<string, string>, key: string, fallback: string): string {
  const value = input[key]?.trim();
  return value || fallback;
}

function head(lines: string[], title: string, input: Record<string, string>): void {
  lines.push(title);
  lines.push(`School: ${val(input, "school", "School name")}`);
  lines.push(`Learning area: ${val(input, "subject", "Learning area")} · Grade ${val(input, "grade", "7")} · ${val(input, "term", "Term 1")} ${val(input, "year", "2026")}`);
  lines.push(`Teacher: ${val(input, "teacher", "Teacher")} · Stream: ${val(input, "stream", "—")}`);
  lines.push("");
}

const shared: StudioField[] = [
  { key: "school", label: "School", placeholder: "Mukuyu JSS" },
  { key: "teacher", label: "Teacher", placeholder: "Your name" },
  { key: "subject", label: "Learning area", placeholder: "Mathematics" },
  { key: "grade", label: "Grade", placeholder: "7" },
  { key: "stream", label: "Stream", placeholder: "East" },
  { key: "term", label: "Term", placeholder: "Term 1" },
  { key: "year", label: "Year", placeholder: "2026" },
];

function withTopic(extra: StudioField[]): StudioField[] {
  return [
    ...shared,
    { key: "strand", label: "Strand", placeholder: "Numbers" },
    { key: "substrand", label: "Sub-strand", placeholder: "Fractions" },
    ...extra,
  ];
}

export const STUDIO_TOOLS: StudioTool[] = [
  {
    id: "observation",
    title: "Lesson observation record",
    blurb: "A head-of-department form for one observed lesson, with evidence lines and a feedback conference.",
    fields: withTopic([{ key: "date", label: "Date", placeholder: "14 November 2026" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "LESSON OBSERVATION RECORD", input);
      lines.push(`Date: ${val(input, "date", "—")} · Strand: ${val(input, "strand", "—")} · Sub-strand: ${val(input, "substrand", "—")}`);
      lines.push("");
      lines.push("1. Lesson intention");
      lines.push("The specific learning outcome was visible to learners and matched the scheme row for this lesson.");
      lines.push("");
      lines.push("2. Evidence");
      lines.push("Introduction: how prior knowledge was checked.");
      lines.push("Development: inquiry question, learner activity, and resources in use.");
      lines.push("Application: what learners produced, said, or demonstrated.");
      lines.push("Conclusion: how the outcome was checked before the lesson ended.");
      lines.push("");
      lines.push("3. Core competencies observed");
      lines.push("Communication, critical thinking, collaboration, citizenship, learning to learn, self-efficacy, digital literacy.");
      lines.push("");
      lines.push("4. Feedback conference");
      lines.push("Strength to keep. One change before the next lesson. Agreement on support needed.");
      lines.push("");
      lines.push("Observer signature ____________  Teacher signature ____________");
      return { title: `Observation ${val(input, "subject", "lesson")}`, lines };
    },
  },
  {
    id: "rubric",
    title: "CBC performance rubric",
    blurb: "Exceeds, meets, approaches and below expectation, written for one sub-strand.",
    fields: withTopic([]),
    build: (input) => {
      const skill = val(input, "substrand", "the sub-strand");
      const lines: string[] = [];
      head(lines, "PERFORMANCE RUBRIC", input);
      lines.push(`Strand: ${val(input, "strand", "—")} · Sub-strand: ${skill}`);
      lines.push("");
      lines.push(`EE — Exceeds expectation. The learner explains ${skill} accurately, applies it in a new situation, and helps a peer correct a mistake.`);
      lines.push(`ME — Meets expectation. The learner completes the class task on ${skill} with only occasional prompts and can state the idea in their own words.`);
      lines.push(`AE — Approaches expectation. The learner attempts ${skill} and succeeds on some steps when the teacher models the first one.`);
      lines.push(`BE — Below expectation. The learner cannot yet complete the first step of ${skill} without working through a concrete example with the teacher.`);
      lines.push("");
      lines.push("Use the same task for the whole class. Record the level, not a percentage, unless the assessment is a scored paper.");
      return { title: `Rubric ${skill}`, lines };
    },
  },
  {
    id: "reflection",
    title: "Weekly reflection journal",
    blurb: "Five short prompts so the reflection column is filled before the schemes file is closed.",
    fields: shared,
    build: (input) => {
      const lines: string[] = [];
      head(lines, "WEEKLY REFLECTION JOURNAL", input);
      for (const prompt of [
        "Which specific learning outcome was actually achieved, and what is the evidence?",
        "Which learners needed a second explanation, and what concrete material helped?",
        "Which core competency showed up in learner talk, not only in the plan?",
        "What will change in the next lesson: time, grouping, example, or question?",
        "What should the head of department know before the next week begins?",
      ]) {
        lines.push(prompt);
        lines.push("");
        lines.push("________________________________________________________________");
        lines.push("");
      }
      return { title: `Reflection ${val(input, "subject", "week")}`, lines };
    },
  },
  {
    id: "coverage",
    title: "Competency coverage map",
    blurb: "A one-page check that the term is not only content, but competencies, values and PCIs.",
    fields: withTopic([]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "COMPETENCY COVERAGE MAP", input);
      lines.push(`Focus sub-strand: ${val(input, "substrand", "—")}`);
      lines.push("");
      for (const row of [
        ["Communication and collaboration", "Learners explain a step to a partner and correct one another."],
        ["Critical thinking and problem solving", "Learners choose a method and say why it fits the question."],
        ["Imagination and creativity", "Learners make a second example that was not on the board."],
        ["Citizenship", "The example is taken from the local community, market, farm or school."],
        ["Digital literacy", "A safe, teacher-supervised digital tool is used only if the school has it."],
        ["Learning to learn", "Learners record one thing they still need to practise."],
        ["Self-efficacy", "A learner who struggled earlier leads a short recap."],
        ["Values", "Respect, responsibility, integrity, unity, love, peace, patriotism — name the one this lesson can honestly claim."],
        ["PCIs", "Health, environment, safety, or life skills — one pertinent issue tied to the content, not a slogan."],
      ]) {
        lines.push(`${row[0]}: ${row[1]}`);
        lines.push("Covered this term?  Yes / Not yet    Lesson number ______");
        lines.push("");
      }
      return { title: "Competency coverage map", lines };
    },
  },
  {
    id: "term-plan",
    title: "Term week planner",
    blurb: "Thirteen week rows with strand, inquiry and assessment, ready to copy into the scheme.",
    fields: withTopic([{ key: "weeks", label: "Number of weeks", placeholder: "13" }]),
    build: (input) => {
      const weeks = Math.max(1, Math.min(14, Number(val(input, "weeks", "13")) || 13));
      const lines: string[] = [];
      head(lines, "TERM WEEK PLANNER", input);
      lines.push(`Strand: ${val(input, "strand", "—")} · Opening sub-strand: ${val(input, "substrand", "—")}`);
      lines.push("");
      for (let week = 1; week <= weeks; week += 1) {
        lines.push(`Week ${week}`);
        lines.push("Sub-strand: ____________________  Lessons: 1  2  3  4  5");
        lines.push("Inquiry question: ________________________________________");
        lines.push("Assessment this week: observation / oral / written / practical / peer");
        lines.push("");
      }
      return { title: `Term planner ${val(input, "subject", "")}`.trim(), lines };
    },
  },
  {
    id: "remedial",
    title: "Remedial support plan",
    blurb: "A class plan for learners approaching or below expectation. No admission numbers required.",
    fields: withTopic([{ key: "gap", label: "The gap", placeholder: "Cannot compare fractions with different denominators" }]),
    build: (input) => {
      const gap = val(input, "gap", "the identified gap");
      const lines: string[] = [];
      head(lines, "REMEDIAL SUPPORT PLAN", input);
      lines.push(`Gap: ${gap}`);
      lines.push(`Linked sub-strand: ${val(input, "substrand", "—")}`);
      lines.push("");
      lines.push("Group. Learners who showed AE or BE on the same task. Do not publish names on a wall chart.");
      lines.push("Time. Two twenty-minute sessions this week, inside the lesson or immediately after, with the teacher present.");
      lines.push("Materials. Concrete objects first, then a diagram, then the symbolic form used in the course book.");
      lines.push("Session 1. Model one worked example. Learners repeat the steps aloud. Stop when the first step is secure.");
      lines.push("Session 2. A parallel example. The learner explains the step before writing the answer.");
      lines.push("Check. A three-item exit task. Record EE, ME, AE or BE. Plan the next lesson only after that record.");
      lines.push("Home link. One short practice the household can support without new content. No paid workbook is required.");
      return { title: "Remedial support plan", lines };
    },
  },
  {
    id: "homework",
    title: "Homework pack",
    blurb: "Three tasks with time, success criteria and a parent note that does not demand a new textbook.",
    fields: withTopic([]),
    build: (input) => {
      const topic = val(input, "substrand", "today's sub-strand");
      const lines: string[] = [];
      head(lines, "HOMEWORK PACK", input);
      lines.push(`Topic: ${topic}`);
      lines.push("");
      lines.push("Task 1 — Recall (10 minutes). Write the meaning of the key word from the lesson and one example from home or school.");
      lines.push("Task 2 — Practice (15 minutes). Four items like the class examples. Show the working, not only the answer.");
      lines.push("Task 3 — Explain (10 minutes). Tell someone at home how you knew the answer to the last item. Write one sentence they said back.");
      lines.push("");
      lines.push("Success. The learner can complete task 2 without copying a neighbour's book the next morning.");
      lines.push("Parent note. Please ask your child to explain task 3. You do not need to teach a new method. Sign here ________.");
      return { title: `Homework ${topic}`, lines };
    },
  },
  {
    id: "circular",
    title: "Parent circular",
    blurb: "A one-page note about what the class is learning and how a family can help.",
    fields: withTopic([{ key: "when", label: "Dates", placeholder: "Week of 16 November" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "NOTE TO PARENTS AND GUARDIANS", input);
      lines.push(`Dates: ${val(input, "when", "this week")}`);
      lines.push("");
      lines.push(`This week Grade ${val(input, "grade", "7")} is learning ${val(input, "substrand", "the current sub-strand")} in ${val(input, "subject", "the learning area")}, under the strand ${val(input, "strand", "—")}.`);
      lines.push("In class, learners will answer a key inquiry question, use the course book, and show what they can do before the lesson ends.");
      lines.push("At home, ask your child to teach you one idea from the lesson. Ten minutes is enough. Please send the book back each morning.");
      lines.push("If your child is finding the work difficult, write a short note in the exercise book. The teacher will plan a short support session. There is no extra fee for that support.");
      lines.push("");
      lines.push(`Teacher: ${val(input, "teacher", "—")}    Sign ________    Date ________`);
      return { title: "Parent circular", lines };
    },
  },
  {
    id: "pbl",
    title: "Project planner",
    blurb: "A project with a driving question, milestones, roles and a public product.",
    fields: withTopic([{ key: "question", label: "Driving question", placeholder: "How can our class reduce waste at break?" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "PROJECT PLAN", input);
      lines.push(`Driving question: ${val(input, "question", "What can our class investigate in this sub-strand?")}`);
      lines.push(`Curriculum link: ${val(input, "strand", "—")} / ${val(input, "substrand", "—")}`);
      lines.push("");
      lines.push("Week 1. Agree the question, the audience, and what 'good' looks like.");
      lines.push("Week 2. Gather evidence from the school or local area. Record sources.");
      lines.push("Week 3. Build the product: a poster, a model, a short oral report, or a demonstration.");
      lines.push("Week 4. Present to another class or the parents' meeting. Collect one piece of feedback and revise.");
      lines.push("");
      lines.push("Roles. Researcher, recorder, materials, presenter. Rotate so one learner does not do all the talking.");
      lines.push("Assessment. Content accuracy, teamwork, and whether the product answers the driving question. Use EE, ME, AE, BE.");
      return { title: "Project plan", lines };
    },
  },
  {
    id: "csl",
    title: "Community service plan",
    blurb: "A CSL activity tied to a learning outcome, with safety, consent and a reflection.",
    fields: withTopic([{ key: "service", label: "Service", placeholder: "Sorting waste at the school kitchen" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "COMMUNITY SERVICE LEARNING PLAN", input);
      lines.push(`Activity: ${val(input, "service", "a service linked to the sub-strand")}`);
      lines.push(`Curriculum link: ${val(input, "substrand", "—")}`);
      lines.push("");
      lines.push("Need. State the real need in one sentence, based on what learners observed, not a guessed slogan.");
      lines.push("Safety. Teacher present. No work on a road, no handling of unknown chemicals, no contact with a stranger unsupervised.");
      lines.push("Consent. Tell the head teacher and the families before learners leave the compound. Keep the group together.");
      lines.push("During. Learners do the service, then record what changed and what did not.");
      lines.push("After. Each learner writes: what I did, who it helped, what I would do differently, which value I practised.");
      lines.push("This is school community service learning. It is not a fundraiser and it is not a substitute for the lesson.");
      return { title: "CSL plan", lines };
    },
  },
  {
    id: "blueprint",
    title: "Assessment blueprint",
    blurb: "A table of specification: outcomes, marks, and question types that add up.",
    fields: withTopic([{ key: "marks", label: "Total marks", placeholder: "50" }]),
    build: (input) => {
      const total = Math.max(10, Math.min(100, Number(val(input, "marks", "50")) || 50));
      const recall = Math.round(total * 0.3);
      const apply = Math.round(total * 0.4);
      const reason = total - recall - apply;
      const lines: string[] = [];
      head(lines, "ASSESSMENT BLUEPRINT", input);
      lines.push(`Paper total: ${total} marks · Sub-strand: ${val(input, "substrand", "—")}`);
      lines.push("");
      lines.push(`Remember and understand — ${recall} marks — short items and definitions from the taught lessons only.`);
      lines.push(`Apply — ${apply} marks — worked items in the same form as class practice.`);
      lines.push(`Reason — ${reason} marks — one item where the learner must explain a choice or correct an error.`);
      lines.push("");
      lines.push("Do not test a sub-strand that is not on the scheme for this period.");
      lines.push("Include the marking points before the paper is duplicated.");
      lines.push("Time guide: about one minute per mark, plus five minutes to read.");
      return { title: "Assessment blueprint", lines };
    },
  },
  {
    id: "item",
    title: "Question with marking scheme",
    blurb: "One structured item, its marks, and acceptable answers a colleague can mark from.",
    fields: withTopic([{ key: "focus", label: "What the item checks", placeholder: "Adding fractions with the same denominator" }]),
    build: (input) => {
      const focus = val(input, "focus", val(input, "substrand", "the taught idea"));
      const lines: string[] = [];
      head(lines, "QUESTION AND MARKING SCHEME", input);
      lines.push(`Checks: ${focus}`);
      lines.push("");
      lines.push("Item.");
      lines.push(`A learner is asked to use ${focus} on a short classroom situation. Write the question you will actually give, with the numbers or text filled in.`);
      lines.push("(a) State or calculate the first step. (2 marks)");
      lines.push("(b) Complete the task and show working. (3 marks)");
      lines.push("(c) Explain why that method fits. (2 marks)");
      lines.push("");
      lines.push("Marking scheme.");
      lines.push("(a) 1 mark for the correct first step, 1 mark for the correct label or unit.");
      lines.push("(b) 1 mark for method, 1 mark for correct working, 1 mark for the answer.");
      lines.push("(c) 2 marks for a reason that names the idea, not only 'because it is correct'.");
      lines.push("Accept an equivalent method if the working is sound. Do not award the answer mark without working when working was required.");
      return { title: "Question and marking scheme", lines };
    },
  },
  {
    id: "delivery",
    title: "Lesson delivery log",
    blurb: "A register of lessons taught, shifted, or not taught, for the schemes file.",
    fields: shared,
    build: (input) => {
      const lines: string[] = [];
      head(lines, "LESSON DELIVERY LOG", input);
      lines.push("Week | Lesson | Sub-strand | Taught / shifted / not taught | Reason | Date");
      for (let week = 1; week <= 6; week += 1) {
        for (let lesson = 1; lesson <= 5; lesson += 1) {
          lines.push(`${week} | ${lesson} |  |  |  |`);
        }
      }
      lines.push("");
      lines.push("A shifted lesson is still owed. Do not tick it as taught until it has been taught.");
      return { title: "Lesson delivery log", lines };
    },
  },
  {
    id: "cover",
    title: "Scheme cover sheet",
    blurb: "The front page a head teacher expects: school, teacher, weeks, book and approval lines.",
    fields: withTopic([
      { key: "book", label: "Course book", placeholder: "Champions, pages" },
      { key: "weeks", label: "Weeks", placeholder: "1 to 9" },
    ]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "SCHEME OF WORK — COVER", input);
      lines.push(`Strand focus: ${val(input, "strand", "—")}`);
      lines.push(`Sub-strand focus: ${val(input, "substrand", "—")}`);
      lines.push(`Weeks covered: ${val(input, "weeks", "1 to —")}`);
      lines.push(`Course book: ${val(input, "book", "—")}`);
      lines.push("");
      lines.push("This scheme follows the Competency Based Curriculum structure used in the school: one row per lesson, strand and sub-strand on every row, specific learning outcomes, key inquiry questions, learning experiences, competencies, values, PCIs, resources and assessment.");
      lines.push("It is a teacher planning document. It is not issued by KICD or KNEC.");
      lines.push("");
      lines.push("Prepared by ______________________  Date __________");
      lines.push("Head of department ______________  Date __________");
      lines.push("Deputy head teacher _____________  Date __________");
      return { title: "Scheme cover", lines };
    },
  },
  {
    id: "robotics",
    title: "Robotics and coding starter",
    blurb: "A safe Pre-Technical starter: sequence, sensor, and a classroom robot task. No attack content.",
    fields: withTopic([]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "ROBOTICS AND CODING STARTER", input);
      lines.push("Learning area fit: Pre-Technical Studies or Integrated Science, as timetabled. Use only school-owned kits or paper algorithms if there is no kit.");
      lines.push("");
      lines.push("Outcome. By the end of the lesson, the learner should be able to write a short sequence that moves a robot or a drawn 'robot' from a start square to a marked square, and explain one sensor the sequence depends on.");
      lines.push("Inquiry. What must the robot check before it turns?");
      lines.push("Experience. In pairs, write forward, turn and stop commands. Test on a grid. Change one command when the path fails. If a kit exists, the teacher switches it on and learners do not open the battery or the casing.");
      lines.push("Safety. No mains wiring. No instructions for breaking into a computer, a network, a phone or a website. Digital literacy here means creating a sequence, not attacking a system.");
      lines.push("Assessment. EE follows the grid and explains the sensor. ME completes the path. AE completes it after one correction. BE needs the teacher to walk the first two squares with them.");
      return { title: "Robotics and coding starter", lines };
    },
  },
  {
    id: "menu",
    title: "Differentiated learning menu",
    blurb: "Three ways into the same outcome: concrete, pictorial, and independent.",
    fields: withTopic([]),
    build: (input) => {
      const topic = val(input, "substrand", "the sub-strand");
      const lines: string[] = [];
      head(lines, "DIFFERENTIATED LEARNING MENU", input);
      lines.push(`Same outcome for every learner: show understanding of ${topic}.`);
      lines.push("");
      lines.push("Support. Concrete materials and a completed example. The learner copies the structure, then changes one number or one fact.");
      lines.push("Core. The class task from the course book. Working must be shown. A partner may discuss, not dictate the answer.");
      lines.push("Stretch. A new situation that still uses only ${topic}. The learner must say why their method still works.".replace("${topic}", topic));
      lines.push("");
      lines.push("Do not give the stretch group new content from next term. Do not give the support group a different, easier outcome that was never taught.");
      return { title: "Learning menu", lines };
    },
  },
  {
    id: "briefing",
    title: "Staff briefing note",
    blurb: "A half-page for the staff meeting: what is being taught, what is stuck, what is needed.",
    fields: withTopic([{ key: "need", label: "What you need", placeholder: "Chalkboard ruler, or a double lesson on Thursday" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "STAFF BRIEFING NOTE", input);
      lines.push(`Now teaching: ${val(input, "strand", "—")} — ${val(input, "substrand", "—")}.`);
      lines.push("On track if this week's five lessons are taught. Behind if more than one lesson was shifted.");
      lines.push(`Stuck point: name the item most of the class missed, not a list of learner names.`);
      lines.push(`Request: ${val(input, "need", "no extra resource this week")}.`);
      lines.push("Assessment due: state the date of the next written or practical check.");
      lines.push("");
      lines.push("This note stays in the department file. It is not a report to parents.");
      return { title: "Staff briefing", lines };
    },
  },
  {
    id: "revision-time",
    title: "Revision timetable",
    blurb: "A two-week revision grid that names the sub-strand, the paper, and the evening follow-up.",
    fields: shared.concat([{ key: "focus", label: "Revision focus", placeholder: "Term 1 strands" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "REVISION TIMETABLE", input);
      lines.push(`Focus: ${val(input, "focus", "the strands already taught")}`);
      lines.push("");
      lines.push("Day | Lesson slot | Sub-strand to revisit | Practice (minutes) | Check");
      for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
        lines.push(`${day} week 1 |  |  | 20 | Exit question`);
        lines.push(`${day} week 2 |  |  | 20 | Marked item`);
      }
      lines.push("");
      lines.push("Revise only what was taught. A revision paper is not an official KNEC paper.");
      return { title: "Revision timetable", lines };
    },
  },
  {
    id: "oral",
    title: "Oral assessment script",
    blurb: "Questions a teacher can ask aloud, with what to listen for.",
    fields: withTopic([]),
    build: (input) => {
      const topic = val(input, "substrand", "the sub-strand");
      const lines: string[] = [];
      head(lines, "ORAL ASSESSMENT SCRIPT", input);
      lines.push(`Topic: ${topic}`);
      lines.push("");
      lines.push("1. Ask the learner to say the key word and point to an example. Listen for the correct word, not a long speech.");
      lines.push("2. Ask them to do the first step of the class method. Listen for the step in the right order.");
      lines.push("3. Ask why that step comes first. A correct reason is one that uses the idea from the lesson.");
      lines.push("4. Ask a second learner to agree or add one missing piece. This checks collaboration without turning it into a chorus answer.");
      lines.push("");
      lines.push("Record EE if all four are secure, ME if 2 and 3 are secure, AE if only 1 is secure, BE if 1 is not yet secure.");
      lines.push("Ask quietly. Do not announce the level to the class.");
      return { title: "Oral assessment script", lines };
    },
  },
  {
    id: "safety",
    title: "Practical safety sheet",
    blurb: "A science or pre-technical practical sheet: hazards, controls, and what to do if something spills.",
    fields: withTopic([{ key: "practical", label: "Practical", placeholder: "Testing conductivity with a cell, bulb and leads" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "PRACTICAL SAFETY SHEET", input);
      lines.push(`Practical: ${val(input, "practical", val(input, "substrand", "the practical"))}`);
      lines.push("");
      lines.push("Before. Teacher checks the apparatus. Broken glass, frayed leads and leaking cells are removed. Learners tie back hair and keep bags off the bench.");
      lines.push("During. Small groups. One job each. No tasting. No mains sockets unless the practical is a teacher demonstration of a safe, insulated device.");
      lines.push("Hazard. Name the real hazard of this practical (heat, sharp edge, chemical splash, or small parts) and the control (goggles, tray, distance, or teacher-only step).");
      lines.push("If something spills or breaks. Stop. Teacher clears it. Learners do not pick up broken glass with bare hands. Wash skin with water if a laboratory liquid touches it, then tell the deputy.");
      lines.push("After. Apparatus returned complete. Benches wiped. Learners state one safety rule they used.");
      lines.push("This sheet is ordinary laboratory safety. It does not describe weapons, break-ins, or how to defeat a lock or a network.");
      return { title: "Practical safety sheet", lines };
    },
  },
  {
    id: "values",
    title: "Values and PCI note",
    blurb: "One honest link from the lesson to a value and a pertinent contemporary issue.",
    fields: withTopic([{ key: "pci", label: "PCI you can actually teach", placeholder: "Water use at the school tap" }]),
    build: (input) => {
      const lines: string[] = [];
      head(lines, "VALUES AND PCI NOTE", input);
      lines.push(`Sub-strand: ${val(input, "substrand", "—")}`);
      lines.push(`Value: choose one the activity really requires — respect, responsibility, integrity, love, unity, peace, or patriotism.`);
      lines.push(`PCI: ${val(input, "pci", "a pertinent issue learners can see at school")}.`);
      lines.push("");
      lines.push("How it appears in the lesson. Write the moment, not a slogan. Example: learners share apparatus and return it complete (responsibility), while measuring water wasted at the tap (environmental PCI).");
      lines.push("What will not be claimed. Do not write every value on every row. A scheme that lists all values on every lesson cannot be supervised.");
      lines.push("Evidence. What the teacher will see or hear if the value was practised.");
      return { title: "Values and PCI note", lines };
    },
  },
];

export function toolById(id: string): StudioTool | undefined {
  return STUDIO_TOOLS.find((tool) => tool.id === id);
}
