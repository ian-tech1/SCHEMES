import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEVELS,
  PRIMARY_BANDS,
  bandBadge,
  bandIdOf,
  gradesFor,
  strandsFor,
  strandsProvenance,
  subjectsFor,
} from "./curriculum.ts";
import { DEFAULT_QUESTION_COUNT, QUESTION_COUNTS, clampQuestionCount } from "./question-plan.ts";

/**
 * KICD publishes Primary as two bands, and the bands are not the same list of
 * areas at different depths. Everything in the app that asks for a grade has to
 * agree with that split, so it is asserted here rather than left to the UI.
 */
test("Primary is categorised as Lower Primary then Upper Primary, in that order", () => {
  assert.deepEqual(PRIMARY_BANDS.map((band) => band.id), ["lower", "upper"]);
  assert.deepEqual([...PRIMARY_BANDS[0]!.grades], ["Grade 1", "Grade 2", "Grade 3"]);
  assert.deepEqual([...PRIMARY_BANDS[1]!.grades], ["Grade 4", "Grade 5", "Grade 6"]);
  assert.equal(bandIdOf("Grade 3"), "lower");
  assert.equal(bandIdOf("Grade 4"), "upper");
  assert.equal(bandIdOf("Grade 7"), "junior");
  assert.equal(bandIdOf("Grade 10"), "senior");
  assert.equal(bandBadge("Grade 5"), "Upper Primary · Grade 4 – 6");
  assert.deepEqual(gradesFor("primary", "lower"), ["Grade 1", "Grade 2", "Grade 3"]);
});

test("each Primary band carries its own learning areas, as printed in the designs", () => {
  const lower = subjectsFor("primary", "Grade 1");
  const upper = subjectsFor("primary", "Grade 6");
  // Environmental Activities and Creative Activities are the Lower Primary
  // carrier areas; they are not areas of their own at Upper Primary.
  assert.ok(lower.includes("Environmental Activities"));
  assert.ok(lower.includes("Creative Arts"));
  assert.ok(!upper.includes("Environmental Activities"));
  // Science and Technology, Social Studies and Agriculture and Nutrition only
  // appear from Grade 4, when they split out of Environmental Activities.
  for (const area of ["Science and Technology", "Social Studies", "Agriculture and Nutrition"]) {
    assert.ok(!lower.includes(area), `${area} is not a Lower Primary area`);
    assert.ok(upper.includes(area), `${area} is an Upper Primary area`);
  }
  // Pastoral Program Instruction is allocated in both bands.
  assert.ok(lower.includes("Pastoral Program Instruction"));
  assert.ok(upper.includes("Pastoral Program Instruction"));
  // Without a grade the picker stays backwards compatible with old documents.
  assert.ok(subjectsFor("primary").includes("Physical and Health Education"));
});

test("every learning area in every Primary grade offers strands to plan from", () => {
  for (const band of PRIMARY_BANDS) {
    for (const grade of band.grades) {
      for (const subject of band.subjects) {
        const strands = strandsFor(subject, grade);
        assert.ok(strands.length > 0, `${grade} ${subject} must offer at least one strand`);
        assert.ok(
          strands.every((entry) => entry.strand.length > 0 && entry.substrands.length > 0),
          `${grade} ${subject} strands must each carry sub-strands`,
        );
      }
    }
  }
});

test("Primary strands come off the published designs and keep their numbering", () => {
  const maths = strandsFor("Mathematics", "Grade 4");
  assert.ok(maths.length > 0);
  assert.match(maths[0]!.strand, /^\d+\.\d+\s\S/);
  assert.equal(strandsProvenance("Mathematics", "Grade 4"), "design");
  // A starter list is allowed where no strand table is published, but it must be
  // labelled as a starter and never passed off as a KICD design.
  assert.equal(strandsProvenance("Pastoral Program Instruction", "Grade 4"), "starter");
  assert.equal(strandsProvenance("Indigenous Language", "Grade 2"), "starter");
});

test("Junior and Senior areas have band-aware designs and topic coverage", () => {
  for (const level of ["junior", "senior"]) {
    for (const subject of subjectsFor(level)) {
      const strands = strandsFor(subject);
      assert.ok(strands.length > 0, `${level} ${subject} has starter strands`);
      assert.ok(strands.every((entry) => entry.strand.length > 0 && entry.substrands.length > 0));
    }
  }
  assert.equal(bandBadge("Grade 8"), "Junior School · Grade 7 – 9");
  assert.equal(bandBadge("Grade 11"), "Senior School · Grade 10 – 12");
  assert.ok(strandsFor("Biology", "Grade 10").length > 0);
  assert.ok(strandsFor("Integrated Science", "Grade 7").length > 0);
  assert.deepEqual(gradesFor("junior", "junior"), ["Grade 7", "Grade 8", "Grade 9"]);
  assert.deepEqual(gradesFor("senior", "senior"), ["Grade 10", "Grade 11", "Grade 12"]);
});

test("a paper can be set to more than 45 questions", () => {
  assert.equal(DEFAULT_QUESTION_COUNT, 45);
  assert.ok(QUESTION_COUNTS.full.includes(45), "45 is offered for a full paper");
  assert.equal(QUESTION_COUNTS.full[QUESTION_COUNTS.full.length - 1], 100);
  assert.equal(clampQuestionCount(45, "full"), 45);
  assert.equal(clampQuestionCount(47, "full"), 45);
  assert.equal(clampQuestionCount(500, "full"), 100);
  assert.equal(clampQuestionCount(2, "full"), 15);
  assert.ok(clampQuestionCount(45, "summary") <= QUESTION_COUNTS.summary[QUESTION_COUNTS.summary.length - 1]!);
});

test("the three levels are still listed in curriculum order", () => {
  assert.deepEqual(LEVELS.map((level) => level.id), ["primary", "junior", "senior"]);
  assert.deepEqual([...LEVELS[0]!.grades], ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"]);
});
