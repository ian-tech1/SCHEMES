import assert from "node:assert/strict";
import { test } from "node:test";
import type { Brief } from "./ai.server.ts";
import { requireAiDocumentQuality } from "./ai-quality-gates.ts";
import { createLocalDraft } from "./local-generator.server.ts";

const base: Brief = {
  kind: "notes", levelLabel: "Junior School", grade: "Grade 9", subject: "Mathematics", strand: "Algebra",
  substrand: "Linear equations", substrands: ["One-step equations", "Equations with brackets"],
  term: "Term 1", year: 2026, weekFrom: 1, weekTo: 2, lessonsPerWeek: 5, pathway: "", startFrom: "Week 1", endAt: "Week 2",
  stream: "", schoolName: "Test School", depth: "full", textbooks: "", assessmentMethods: ["observation", "exercise"], lessonMinutes: 40,
  selectedTopics: [{ strand: "Algebra", topic: "Linear equations", pagesFrom: "", pagesTo: "", subtopics: [{ title: "Solving one-step equations", pagesFrom: "", pagesTo: "" }] }],
};

test("local full mathematics notes pass the same strict completeness gate", () => {
  const brief: Brief = { ...base, kind: "notes" };
  const draft = createLocalDraft(brief);
  requireAiDocumentQuality(brief, draft);
  const output = draft as { sections: unknown[]; tryThis: string[]; answerKey: string[]; answerKeyNote: string };
  assert.equal(output.sections.length, 6);
  assert.equal(output.tryThis.length, 12);
  assert.equal(output.answerKey.length, output.tryThis.length);
  assert.match(output.answerKeyNote, /model solutions/i);
});

test("local lesson plan has complete timing, differentiated support and assessment", () => {
  const brief: Brief = { ...base, kind: "lesson", focusWeek: 1, focusLesson: 2 };
  const draft = createLocalDraft(brief);
  requireAiDocumentQuality(brief, draft);
  const output = draft as { steps: { minutes: number }[]; support: string; extension: string; assessment: string };
  assert.equal(output.steps.reduce((sum, step) => sum + step.minutes, 0), brief.lessonMinutes);
  assert.ok(output.support.length > 30);
  assert.ok(output.extension.length > 30);
  assert.ok(output.assessment.length > 30);
});

test("local CBE scheme is scoped to selected topics and includes every requested week and lesson", () => {
  const brief: Brief = { ...base, kind: "scheme" };
  const draft = createLocalDraft(brief);
  requireAiDocumentQuality(brief, draft);
  const output = draft as { weeks: { week: number }[]; lessonLines: { week: number; lesson: number; substrand: string }[]; overview: string };
  const selected = new Set(["Linear equations", "Solving one-step equations", "One-step equations", "Equations with brackets"]);
  assert.deepEqual(output.weeks.map((week) => week.week), [1, 2]);
  assert.equal(output.lessonLines.length, 10);
  assert.ok(output.lessonLines.every((lesson) => selected.has(lesson.substrand)));
  assert.match(output.overview, /selected scope/i);
});

test("local standard exam paper has complete answers and marking guidance", () => {
  const brief: Brief = { ...base, kind: "revision", questionCount: 8, questionTypes: ["mcq", "structured"], assessmentMode: "practice", depth: "summary" };
  const draft = createLocalDraft(brief);
  requireAiDocumentQuality(brief, draft);
  const output = draft as { questions: { type: string; options: string[]; answer: string; marking: string }[] };
  assert.equal(output.questions.length, 8);
  assert.ok(output.questions.every((question) => question.answer && question.marking));
  assert.ok(output.questions.filter((question) => question.type === "mcq").every((question) => question.options.length === 4));
});

test("local KJSEA-format practice is structurally exact and prominently non-official", () => {
  const brief: Brief = { ...base, kind: "revision", questionCount: 40, assessmentMode: "kjsea-format", depth: "full" };
  const draft = createLocalDraft(brief);
  requireAiDocumentQuality(brief, draft);
  const output = draft as { questions: { type: string; marks: number; options: string[]; prompt: string; answer: string; marking: string }[]; instructions: string; qualityNotice: string };
  assert.equal(output.questions.length, 40);
  assert.equal(output.questions.slice(0, 20).filter((q) => q.type === "mcq").length, 20);
  assert.equal(output.questions.slice(20).filter((q) => q.type === "structured").length, 20);
  assert.equal(output.questions.reduce((sum, q) => sum + q.marks, 0), 100);
  assert.ok(output.questions.slice(0, 20).every((q) => q.options.length === 4 && q.marks === 1));
  assert.ok(output.questions.slice(20).every((q) => /\(a\)/.test(q.prompt) && /\(b\)/.test(q.prompt)));
  assert.match(output.instructions, /not a KNEC/i);
  assert.match(output.qualityNotice, /not a factual answer-validated paper or an authentic KNEC past paper/i);
});
