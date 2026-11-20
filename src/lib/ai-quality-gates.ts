import type { Brief } from "./ai.server.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function list(value: Record<string, unknown> | null, key: string): unknown[] {
  const found = value?.[key];
  return Array.isArray(found) ? found : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function allText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(allText).join("\n");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(allText).join("\n");
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return record(value) ?? {};
}

function answerChecks(brief: Brief, output: Record<string, unknown>): string[] {
  if (brief.kind === "notes") {
    const minimum = brief.depth === "summary" ? 3 : 12;
    const maximum = brief.depth === "summary" ? 3 : 24;
    const practice = list(output, "tryThis").filter((item) => text(item));
    const answers = list(output, "answerKey").filter((item) => text(item));
    return practice.length >= minimum && practice.length <= maximum && answers.length === practice.length
      ? []
      : [`Notes require ${minimum} to ${maximum} practice prompts and the same number of matching answers.`];
  }
  if (brief.kind === "revision") {
    const questions = list(output, "questions").map(record);
    const missing = questions.filter((question) => !question || !text(question.prompt) || !text(question.answer) || !text(question.marking));
    const withoutFourOptions = questions.some((question) => question && /mcq|multiple.?choice/i.test(String(question.type)) && list(question, "options").length !== 4);
    return [
      ...(missing.length ? [`${missing.length} question(s) lack a prompt, answer, or marking guide.`] : []),
      ...(withoutFourOptions ? ["Each multiple-choice question needs exactly four options."] : []),
    ];
  }
  return [];
}

function structureChecks(brief: Brief, output: Record<string, unknown>): string[] {
  if (brief.kind === "notes") {
    const sections = list(output, "sections").map(record).filter((item): item is Record<string, unknown> => Boolean(item));
    const vocabulary = list(output, "vocabulary");
    const expectedSections = brief.depth === "summary" ? 2 : 6;
    const expectedVocabulary = brief.depth === "summary" ? 4 : 8;
    const failures: string[] = [];
    if (text(output.summary).length < 40) failures.push("Notes need a meaningful topic summary of at least 40 characters.");
    if (sections.length < expectedSections) failures.push(`Notes need at least ${expectedSections} developed sections.`);
    if (vocabulary.filter((item) => text(asRecord(item).term) && text(asRecord(item).meaning)).length < expectedVocabulary) failures.push(`Notes need at least ${expectedVocabulary} vocabulary terms with meanings.`);
    if (brief.depth === "full") {
      const thin = sections.filter((section) => list(section, "paragraphs").filter((paragraph) => text(paragraph)).length < 2);
      const noWorkedExamples = sections.filter((section) => list(section, "examples").filter((example) => text(example)).length < 5);
      if (thin.length) failures.push(`${thin.length} full-note section(s) have fewer than two teaching paragraphs.`);
      if (noWorkedExamples.length) failures.push(`${noWorkedExamples.length} full-note section(s) lack a worked/example item.`);
      if (list(output, "mistakes").length < 6) failures.push("Full notes need at least six topic-specific misconceptions with corrections.");
      if (list(output, "remember").filter((item) => text(item)).length < 8) failures.push("Full notes need at least eight recap/recall points.");
    }
    return failures;
  }
  if (brief.kind === "scheme") {
    const weeks = list(output, "weeks").map(record).filter((item): item is Record<string, unknown> => Boolean(item));
    const expectedWeeks = Math.max(0, brief.weekTo - brief.weekFrom + 1);
    const failures: string[] = [];
    if (weeks.length !== expectedWeeks) failures.push(`Scheme needs exactly ${expectedWeeks} requested week entries.`);
    if (weeks.some((week) => list(week, "outcomes").length < 3)) failures.push("Every scheme week needs at least three learner outcomes.");
    if (brief.compact) {
      if (weeks.some((week) => list(week, "lessonHints").length !== brief.lessonsPerWeek)) failures.push("Each compact scheme week needs one focus per scheduled lesson.");
    } else {
      const expectedLessons = expectedWeeks * brief.lessonsPerWeek;
      if (list(output, "lessonLines").length !== expectedLessons) failures.push(`Scheme needs exactly ${expectedLessons} lesson rows.`);
    }
    return failures;
  }
  if (brief.kind === "lesson") {
    const outcomes = list(output, "outcomes");
    const steps = list(output, "steps").map(record).filter((item): item is Record<string, unknown> => Boolean(item));
    const totalMinutes = steps.reduce((total, step) => total + (Number(step.minutes) || 0), 0);
    return [
      ...(outcomes.length < 3 ? ["A lesson needs at least three measurable learner outcomes."] : []),
      ...(steps.length < 3 ? ["A lesson needs multiple staged learning activities."] : []),
      ...(totalMinutes !== brief.lessonMinutes ? [`Lesson activity time totals ${totalMinutes}, not ${brief.lessonMinutes} minutes.`] : []),
    ];
  }
  const questions = list(output, "questions");
  const expectedQuestions = brief.assessmentMode === "kjsea-format" ? 40 : brief.questionCount ?? (brief.depth === "summary" ? 10 : 45);
  if (questions.length !== expectedQuestions) return [`Assessment needs exactly ${expectedQuestions} questions.`];
  return [];
}

function rubricChecks(brief: Brief, output: Record<string, unknown>): string[] {
  if (brief.kind === "revision") {
    const questions = list(output, "questions").map(record).filter((item): item is Record<string, unknown> => Boolean(item));
    const marks = questions.reduce((sum, question) => sum + Math.max(0, Number(question.marks) || 0), 0);
    if (brief.assessmentMode === "kjsea-format") {
      const mcq = questions.slice(0, 20);
      const structured = questions.slice(20);
      const rightMix = mcq.every((question) => /mcq|multiple.?choice/i.test(String(question.type)) && Number(question.marks) === 1 && list(question, "options").length === 4)
        && structured.length === 20
        && structured.every((question, offset) => /structured/i.test(String(question.type)) && Number(question.marks) === [4, 4, 4, 4, 4, 4, 3, 3, 5, 5, 5, 4, 4, 4, 4, 4, 4, 3, 4, 4][offset] && /\(a\)/i.test(text(question.prompt)) && /\(b\)/i.test(text(question.prompt)));
      if (questions.length !== 40 || marks !== 100 || !rightMix) return ["KJSEA-format practice must follow the 2026 paper: Section A is 20 one-mark multiple-choice items, and Section B is 20 structured items in five tasks whose marks add to 80."];
    }
    if (brief.assessmentMode !== "kjsea-format" && (marks < questions.length || marks > questions.length * 5)) return ["Assessment marks are outside the requested paper's valid range."];
    return [];
  }
  if (brief.kind === "lesson") {
    const phases = list(output, "steps").map(record).filter((item): item is Record<string, unknown> => Boolean(item));
    return phases.some((phase) => !text(phase.teacher) || !text(phase.learners)) ? ["Every lesson phase must say what both teacher and learners do."] : [];
  }
  return [];
}

/**
 * Local gates are deterministic checks, not a no-key language model. They run
 * before accepting a provider response so a short or structurally incomplete
 * response can fall through to the next configured key/provider.
 */
export function auditAiDocument(brief: Brief, value: unknown): { passed: boolean; gates: { name: string; passed: boolean; detail: string }[] } {
  const output = record(value);
  const corpus = allText(value);
  const placeholder = /\b(?:lorem ipsum|insert (?:text|answer|content) here|\[add (?:content|answer)|todo:|coming soon)\b/i.test(corpus);
  const withoutExplicitNegations = corpus.replace(/\b(?:not|never)\s+(?:been\s+)?(?:officially\s+)?(?:approved(?:\s+or\s+(?:officially\s+)?issued)?|issued)(?:\s+by\s+(?:KICD|KNEC))?\b/gi, " ");
  const falselyOfficial = /\b(?:officially issued|officially approved|approved by (?:KICD|KNEC)|issued by (?:KICD|KNEC)|this is an official KNEC paper)\b/i.test(withoutExplicitNegations);
  const structural = structureChecks(brief, output ?? {});
  const answers = answerChecks(brief, output ?? {});
  const rubric = rubricChecks(brief, output ?? {});
  const jsonLength = (() => { try { return JSON.stringify(value).length; } catch { return 0; } })();
  const gates = [
    { name: "Structured output", passed: Boolean(output), detail: output ? "One JSON object returned." : "Expected a JSON object." },
    { name: "Grade and subject scope", passed: Boolean(brief.grade.trim() && brief.subject.trim() && brief.strand.trim()), detail: "Generation request includes grade, subject, and strand." },
    { name: "No template placeholders", passed: !placeholder, detail: placeholder ? "Remove placeholder or template text." : "No obvious unfinished template placeholders." },
    { name: "Document completeness", passed: structural.length === 0, detail: structural.join(" ") || "Requested sections/rows/questions are present." },
    { name: "Teaching depth", passed: brief.kind !== "notes" || (list(output, "sections").length >= (brief.depth === "full" ? 6 : 2)), detail: brief.kind === "notes" ? "Notes depth checked for requested mode." : "Not a notes document." },
    { name: "Worked practice and answer key", passed: answers.length === 0, detail: answers.join(" ") || (brief.kind === "notes" || brief.kind === "revision" ? "Practice items have matching answers/marking." : "Not an assessment document.") },
    { name: "CBE activity or marking rubric", passed: rubric.length === 0, detail: rubric.join(" ") || "Activities or marking details meet the structural checks." },
    { name: "Official-source honesty", passed: !falselyOfficial, detail: falselyOfficial ? "Generated content must not claim KICD/KNEC issued or approved it." : "No false official-issue/approval claim detected." },
    { name: "Export readiness", passed: jsonLength > 2 && jsonLength < 1_500_000, detail: jsonLength > 2 && jsonLength < 1_500_000 ? "Output is within the safe JSON-size limit." : "Output is empty or too large to store safely." },
  ];
  return { passed: gates.every((gate) => gate.passed), gates };
}

export function requireAiDocumentQuality(brief: Brief, value: unknown): void {
  const audit = auditAiDocument(brief, value);
  if (!audit.passed) {
    const failed = audit.gates.filter((gate) => !gate.passed).map((gate) => `${gate.name}: ${gate.detail}`);
    throw new Error(`AI response failed built-in quality checks (${failed.join("; ")}).`);
  }
}
