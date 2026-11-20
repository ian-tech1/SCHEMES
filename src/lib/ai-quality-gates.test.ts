import assert from "node:assert/strict";
import { test } from "node:test";
import { auditAiDocument } from "./ai-quality-gates.ts";
import type { Brief } from "./ai.server.ts";

function brief(overrides: Partial<Brief>): Brief {
  return {
    kind: "notes", levelLabel: "Junior School", grade: "Grade 9", subject: "Mathematics",
    strand: "Numbers", substrand: "Fractions", substrands: [], term: "Term 1", year: 2026,
    weekFrom: 1, weekTo: 1, lessonsPerWeek: 1, pathway: "", startFrom: "", endAt: "",
    stream: "", schoolName: "Example School", depth: "summary", textbooks: "",
    assessmentMethods: [], lessonMinutes: 40, ...overrides,
  } as Brief;
}

const shortNotes = {
  summary: "Learners identify a main idea and use details as evidence in a short passage.",
  vocabulary: [
    { term: "idea", meaning: "a thought or message" },
    { term: "detail", meaning: "a supporting fact" },
    { term: "passage", meaning: "a short piece of writing" },
    { term: "infer", meaning: "work out meaning from clues" },
  ],
  sections: [
    { heading: "Identify the idea", paragraphs: ["Read the whole passage.", "Ask what most sentences explain."], examples: ["A passage about a seed's growth has plant growth as its main idea."] },
    { heading: "Use details", paragraphs: ["Details support the central idea.", "Explain how a sentence connects to the main idea."], examples: ["A sentence about roots taking in water is a supporting detail."] },
  ],
  tryThis: ["Name the main idea.", "Find one supporting detail.", "Explain an inference."],
  answerKey: ["The central point.", "A relevant sentence from the passage.", "A reasonable inference linked to a clue."],
  remember: ["Read the whole text.", "Look for supporting facts.", "Explain your thinking."],
};

test("nine quality gates accept a complete summary resource", () => {
  const audit = auditAiDocument(brief({}), shortNotes);
  assert.equal(audit.gates.length, 9);
  assert.equal(audit.passed, true, audit.gates.filter((gate) => !gate.passed).map((gate) => `${gate.name}: ${gate.detail}`).join("; "));
});

test("full-note gate rejects outlines and incomplete answers", () => {
  const audit = auditAiDocument(brief({ depth: "full" }), shortNotes);
  assert.equal(audit.passed, false);
  assert.equal(audit.gates.find((gate) => gate.name === "Document completeness")?.passed, false);
  assert.equal(audit.gates.find((gate) => gate.name === "Teaching depth")?.passed, false);
  assert.equal(audit.gates.find((gate) => gate.name === "Worked practice and answer key")?.passed, false);
});

test("KJSEA-format practice is checked for the 2026 paper layout and 100 marks, not official status", () => {
  const sectionB = [4, 4, 4, 4, 4, 4, 3, 3, 5, 5, 5, 4, 4, 4, 4, 4, 4, 3, 4, 4];
  const questions = [
    ...Array.from({ length: 20 }, (_, index) => ({ number: index + 1, type: "mcq", marks: 1, prompt: `Choose the correct answer for item ${index + 1}.`, options: ["A", "B", "C", "D"], answer: "A", marking: "One mark for A." })),
    ...sectionB.map((marks, index) => ({ number: index + 21, type: "structured", marks, prompt: `Task item ${index + 21}.\n(a) State the first step. (2 marks)\n(b) Complete the working. (${marks - 2} marks)`, answer: "A complete worked solution.", marking: "Award marks for method and answer." })),
  ];
  const audit = auditAiDocument(brief({ kind: "revision", assessmentMode: "kjsea-format", questionCount: 40 }), { instructions: "Generated practice, not an official KNEC paper.", questions });
  assert.equal(audit.passed, true, audit.gates.filter((gate) => !gate.passed).map((gate) => `${gate.name}: ${gate.detail}`).join("; "));
});

test("quality gates reject invented official approval and unfinished templates", () => {
  const bad = { ...shortNotes, answerKey: ["A", "B", "C"], summary: "This is an official KNEC paper. Insert answer here." };
  const audit = auditAiDocument(brief({}), bad);
  assert.equal(audit.gates.find((gate) => gate.name === "Official-source honesty")?.passed, false);
  assert.equal(audit.gates.find((gate) => gate.name === "No template placeholders")?.passed, false);
});

test("truthful non-official disclaimers pass while positive approval claims remain blocked", () => {
  const negative = auditAiDocument(brief({}), { ...shortNotes, notice: "This is not officially approved or issued by KICD or KNEC." });
  assert.equal(negative.gates.find((gate) => gate.name === "Official-source honesty")?.passed, true);

  const positive = auditAiDocument(brief({}), { ...shortNotes, notice: "This resource was officially approved by KICD." });
  assert.equal(positive.gates.find((gate) => gate.name === "Official-source honesty")?.passed, false);
});
