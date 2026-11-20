import test from "node:test";
import assert from "node:assert/strict";
import {
  assessmentGuidance,
  pathwaySubjects,
  subjectFitsPathway,
  subjectsForPathway,
} from "./secondary-quality.ts";

test("Senior pathway subject filters stay useful and editable", () => {
  assert.ok(pathwaySubjects("STEM").includes("Physics"));
  assert.ok(subjectsForPathway("senior", "Grade 10", "STEM").includes("Physics"));
  assert.equal(subjectFitsPathway("Physics", "STEM"), true);
  assert.equal(subjectFitsPathway("Fine Arts", "STEM"), false);
});

test("Junior subjects are not incorrectly removed by a pathway", () => {
  const subjects = subjectsForPathway("junior", "Grade 8", "STEM");
  assert.ok(subjects.includes("Social Studies"));
  assert.ok(subjects.includes("Computer Science"));
});

test("secondary paper guidance names the grade and reasoning focus", () => {
  assert.match(assessmentGuidance("junior", "Grade 9", 50), /Grade 9/);
  assert.match(assessmentGuidance("senior", "Grade 11", 60), /analysis/);
});
