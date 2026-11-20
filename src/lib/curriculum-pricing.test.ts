import assert from "node:assert/strict";
import test from "node:test";
import { curriculumSetIsFree, effectiveCurriculumPrice, normalizeCurriculumPriceRule } from "./curriculum-pricing.ts";

test("price rule requires a supported grade, a learning area, and a whole nonnegative KES price", () => {
  assert.deepEqual(normalizeCurriculumPriceRule({ grade: "Grade 9", subject: "Mathematics", priceKes: 120 }), {
    grade: "Grade 9", subject: "Mathematics", priceKes: 120,
  });
  assert.throws(() => normalizeCurriculumPriceRule({ grade: "Grade 13", subject: "Mathematics", priceKes: 1 }), /valid grade/);
  assert.throws(() => normalizeCurriculumPriceRule({ grade: "Grade 9", subject: "M", priceKes: 1 }), /2 to 80/);
  assert.throws(() => normalizeCurriculumPriceRule({ grade: "Grade 9", subject: "Mathematics", priceKes: -1 }), /whole-number price/);
  assert.throws(() => normalizeCurriculumPriceRule({ grade: "Grade 9", subject: "Mathematics", priceKes: 1.5 }), /whole-number price/);
});

test("a saved learning-area rule overrides the baseline; zero means free", () => {
  assert.equal(effectiveCurriculumPrice(75, { priceKes: 120 }), 120);
  assert.equal(effectiveCurriculumPrice(75, { priceKes: 0 }), 0);
  assert.equal(curriculumSetIsFree(0), true);
  assert.equal(curriculumSetIsFree(120), false);
});

test("an unconfigured learning area uses the existing global baseline price", () => {
  assert.equal(effectiveCurriculumPrice(75), 75);
  assert.equal(effectiveCurriculumPrice(-10), 0);
});
