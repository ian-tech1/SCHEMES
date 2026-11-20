export type CurriculumPriceRule = {
  grade: string;
  subject: string;
  priceKes: number;
  updatedAt?: string;
};

export const MAX_CURRICULUM_PRICE_KES = 20_000;
const GRADE = /^Grade (?:[1-9]|1[0-2])$/;

export function normalizeCurriculumPriceRule(input: unknown): CurriculumPriceRule {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const grade = typeof raw.grade === "string" ? raw.grade.trim() : "";
  const subject = typeof raw.subject === "string" ? raw.subject.trim().replace(/\s+/g, " ") : "";
  const price = Number(raw.priceKes);
  if (!GRADE.test(grade)) throw new Error("Choose a valid grade from Grade 1 to Grade 12.");
  if (subject.length < 2 || subject.length > 80) throw new Error("Learning area must be 2 to 80 characters.");
  if (!Number.isSafeInteger(price) || price < 0 || price > MAX_CURRICULUM_PRICE_KES) {
    throw new Error(`Set a whole-number price from KES 0 to KES ${MAX_CURRICULUM_PRICE_KES}.`);
  }
  return { grade, subject, priceKes: price };
}

export function effectiveCurriculumPrice(globalPriceKes: number, rule?: Pick<CurriculumPriceRule, "priceKes"> | null): number {
  const value = rule ? rule.priceKes : globalPriceKes;
  return Number.isFinite(value) ? Math.max(0, Math.min(MAX_CURRICULUM_PRICE_KES, Math.round(value))) : 0;
}

export function curriculumSetIsFree(priceKes: number): boolean {
  return priceKes <= 0;
}
