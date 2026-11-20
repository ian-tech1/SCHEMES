import assert from "node:assert/strict";
import { test } from "node:test";
import { checkLessonCompleteness, checkSchemeCompleteness } from "./planning-quality.ts";
import type { LessonBody, SchemeBody } from "./cbe-types";

const week = (number: number) => ({ week: number, focus: "Topic", outcomes: ["Learners solve a problem"], inquiry: ["How can we test the answer?"], experiences: ["Explore"], competencies: ["Critical thinking"], values: ["Respect"], pcis: [], resources: ["Local materials"], assessment: "Observe and ask", lessonHints: ["Introduction"], homework: "Practise" });
const lessonRow = (weekNo: number, lesson: number) => ({ week: weekNo, lesson, dateLabel: "", strand: "Numbers", substrand: "Operations", outcomes: ["Outcome"], experiences: ["Activity"], inquiry: ["Question"], resources: ["Book"], assessment: "Exit task", reflection: "", competencies: [], values: [], pcis: [], homework: "", minutes: 40 });

test("scheme completeness checks recognise a fully populated scheme but still show a review notice", () => {
  const body = { weeks: [week(1), week(2)], lessons: Array.from({ length: 6 }, (_, index) => lessonRow(Math.floor(index / 3) + 1, index % 3 + 1)), reflectionMode: "blank", columns: ["reflection"] } as unknown as SchemeBody;
  const report = checkSchemeCompleteness(body, { weekFrom: 1, weekTo: 2, lessonsPerWeek: 3 });
  assert.ok(report.checks.every((item) => item.passed), JSON.stringify(report.checks));
  assert.match(report.notice, /not an official approval/);
});

test("scheme completeness flags missing weeks and underspecified rows", () => {
  const report = checkSchemeCompleteness({ weeks: [week(1)], lessons: [lessonRow(1, 1)], reflectionMode: "prompt", columns: [] } as unknown as SchemeBody, { weekFrom: 1, weekTo: 2, lessonsPerWeek: 3 });
  assert.equal(report.checks.find((item) => item.id === "weeks")?.passed, false);
  assert.equal(report.checks.find((item) => item.id === "lesson-count")?.passed, false);
  assert.equal(report.checks.find((item) => item.id === "reflection")?.passed, false);
});

test("lesson completeness verifies outcomes, timed sequence, assessment, and differentiation", () => {
  const body: LessonBody = {
    duration: "40 minutes", weekLabel: "Week 1 · Lesson 1", outcomes: ["Solve"], inquiry: ["Why?"], resources: ["Ruler"],
    steps: [{ phase: "Start", minutes: 5, teacher: "Ask", learners: "Respond" }, { phase: "Explore", minutes: 25, teacher: "Guide", learners: "Solve" }, { phase: "Review", minutes: 10, teacher: "Check", learners: "Explain" }],
    support: "Use counters", extension: "Create another example", assessment: "Exit ticket", rubric: [{ level: "Secure", descriptor: "Explains method" }], homework: "Try a question", reflection: "", competencies: ["Critical thinking"],
  };
  const report = checkLessonCompleteness(body);
  assert.ok(report.checks.every((item) => item.passed), JSON.stringify(report.checks));
});
