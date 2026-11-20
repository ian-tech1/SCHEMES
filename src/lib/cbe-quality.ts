/** Local KICD/CBE checks applied after the model writes, so a weak draft is corrected before it is saved. */

const COMPETENCIES = [
  "Communication and collaboration",
  "Critical thinking and problem solving",
  "Imagination and creativity",
  "Citizenship",
  "Digital literacy",
  "Learning to learn",
  "Self-efficacy",
];

const VALUES = ["Love", "Responsibility", "Respect", "Unity", "Peace", "Patriotism", "Integrity"];

const PCIS = [
  "Life skills",
  "Health education",
  "Gender",
  "Citizenship",
  "Learner support",
  "Environmental education",
  "Financial literacy",
  "Safety",
];

function clean(value: string): string {
  return value
    .replace(/\bjunior secondary\b/gi, "junior school")
    .replace(/KICD circular\s*[A-Z0-9/-]+/gi, "the curriculum design")
    .replace(/\s+/g, " ")
    .trim();
}

export function polishOutcome(raw: string, topic: string): string {
  let line = clean(raw).replace(/^by the end of the lesson,?\s*/i, "");
  line = line.replace(/^the learner should be able to\s*/i, "");
  if (!line) line = `explain and use the main idea in ${topic}`;
  if (!/[.]$/.test(line)) line = `${line}.`;
  return `By the end of the lesson, the learner should be able to ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

export function polishOutcomes(items: string[], topic: string, minutes: number): string[] {
  const cap = minutes >= 70 ? 5 : 3;
  const out = items.map((item) => polishOutcome(item, topic)).filter(Boolean);
  const extras = [
    `identify the key vocabulary used in ${topic}.`,
    `carry out the main skill in ${topic} and record the result.`,
    `apply ${topic} in a familiar Kenyan classroom or home example.`,
  ];
  for (const extra of extras) {
    if (out.length >= 3) break;
    out.push(polishOutcome(extra, topic));
  }
  return out.slice(0, Math.max(3, Math.min(cap, out.length || 3)));
}

export function polishInquiry(items: string[], topic: string): string[] {
  const openers = ["How", "Why", "Where", "What happens if", "When"];
  const out = items.slice(0, 3).map((item, index) => {
    let line = clean(item).replace(/\?+$/, "");
    const closed = /^(is|are|do|does|did|can|name|list|state)\b/i.test(line);
    if (closed || line.length < 12) {
      line = `${openers[index % openers.length]} does ${topic} show up in everyday life`;
    }
    if (!/^(how|why|where|what|when|which)\b/i.test(line)) {
      line = `How can learners explain ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
    }
    return `${line}?`;
  });
  if (out.length < 2) {
    out.push(`How is ${topic} used in a Kenyan home, market or school?`);
    out.push(`What happens if a learner skips one step in ${topic}?`);
  }
  return out.slice(0, 3);
}

export function polishExperiences(items: string[], topic: string): string[] {
  const out = items.slice(0, 4).map((item) => {
    let line = clean(item);
    if (!/\b(learner|pair|group|record|practise|practice|discuss|write|measure|draw)\b/i.test(line)) {
      line = `${line} Learners then try the step in pairs and record one result for ${topic}.`;
    }
    return line;
  });
  if (out.length < 2) {
    out.push(`In pairs, learners discuss one local example of ${topic} and write the key word in their books.`);
    out.push(`Learners complete a short task on ${topic}, compare answers and correct one mistake.`);
  }
  return out.slice(0, 4);
}

export function polishAssessment(raw: string, topic: string): string {
  let line = clean(raw);
  if (!line) line = `Observe the exercise on ${topic} and note who is approaching, meeting or exceeding expectations.`;
  if (!/\b(approach|meet|exceed|book|oral|observ)/i.test(line)) {
    line = `${line} Record evidence in the exercise book or from an oral response.`;
  }
  return line;
}

function keepKnown(items: string[], allowed: string[]): string[] {
  const found: string[] = [];
  for (const item of items) {
    const low = item.trim().toLowerCase();
    if (!low) continue;
    const hit = allowed.find((name) => low.includes(name.toLowerCase()) || name.toLowerCase().includes(low));
    if (hit) found.push(hit);
  }
  return [...new Set(found)].slice(0, 3);
}

export function polishLinks(input: { competencies?: string[]; values?: string[]; pcis?: string[] }) {
  return {
    competencies: keepKnown(input.competencies ?? [], COMPETENCIES),
    values: keepKnown(input.values ?? [], VALUES),
    pcis: keepKnown(input.pcis ?? [], PCIS),
  };
}

export function balanceSteps<T extends { phase: string; minutes: number; teacher: string; learners: string }>(
  steps: T[],
  minutes: number,
): T[] {
  const names = ["Introduction", "Development", "Application", "Conclusion"];
  const next = steps.slice(0, 4).map((step, index) => ({
    ...step,
    phase: names[index] ?? step.phase,
    teacher: clean(step.teacher),
    learners: clean(step.learners) || "Learners answer, record and compare one example.",
  }));
  const total = next.reduce((sum, step) => sum + step.minutes, 0) || 1;
  let used = 0;
  return next.map((step, index) => {
    const share = index === next.length - 1 ? minutes - used : Math.max(3, Math.round((step.minutes / total) * minutes));
    used += share;
    return { ...step, minutes: Math.max(3, share) };
  });
}

export function polishQuestions<T extends { prompt: string; marks: number; options: string[]; answer: string; marking: string; type: string }>(
  questions: T[],
): T[] {
  const seen = new Set<string>();
  return questions.map((question) => {
    const type = question.type.toLowerCase();
    const options = type === "mcq" ? question.options.filter(Boolean).slice(0, 4) : [];
    while (type === "mcq" && options.length < 4) options.push("None of these is supported by the lesson.");
    const labelled = type === "mcq"
      ? options.map((option, index) => /^[A-D][.)]/i.test(option) ? option : `${String.fromCharCode(65 + index)}. ${option}`)
      : [];
    let prompt = clean(question.prompt);
    if (prompt.length < 40) prompt = `${prompt} Use a familiar classroom or home example and show the working.`;
    const key = prompt.toLowerCase();
    if (seen.has(key)) prompt = `${prompt} Give a different example from the one already used.`;
    seen.add(prompt.toLowerCase());
    const marks = Math.max(1, question.marks || 1);
    const answer = question.answer || "See the worked method in the notes.";
    const marking = question.marking?.toLowerCase().startsWith("award")
      ? question.marking
      : `Award the ${marks} mark(s) for a correct idea, working or evidence. ${question.marking || ""}`.trim();
    return { ...question, prompt, options: labelled, marks, answer, marking };
  });
}

export function polishNotes(notes: {
  summary: string;
  vocabulary: { term: string; meaning: string }[];
  sections: { heading: string; paragraphs: string[]; examples: string[] }[];
  tryThis: string[];
  remember: string[];
  mistakes?: string[];
}, _topic: string) {
  // Sanitize only: missing content is rejected by the server-side normalizer,
  // never manufactured from a local starter or generic filler template.
  return {
    summary: notes.summary.trim(),
    vocabulary: notes.vocabulary.filter((item) => item.term.trim() && item.meaning.trim()),
    sections: notes.sections.filter((section) => section.heading.trim()).map((section) => ({
      heading: section.heading.trim(),
      paragraphs: section.paragraphs.map((value) => value.trim()).filter(Boolean),
      examples: section.examples.map((value) => value.trim()).filter(Boolean),
    })),
    tryThis: notes.tryThis.map((value) => value.trim()).filter(Boolean),
    remember: notes.remember.map((value) => value.trim()).filter(Boolean),
    mistakes: (notes.mistakes ?? []).map((value) => value.trim()).filter(Boolean),
  };
}
