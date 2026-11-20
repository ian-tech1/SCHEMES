import type { GenInput, LessonBody, PlanningQualityReport, SchemeBody } from "./cbe-types";

const SOURCE = "Ministry of Education, Guidelines for Implementation of Junior Secondary Education (2023), §4.8; KICD curriculum design framework.";
const NOTICE = "These are completeness checks, not an official approval or proof of curriculum accuracy. The teacher and HOD should confirm exact outcomes, pacing, local template requirements, learner needs, and resources against the current KICD design and school policy.";
const populated = (items: unknown[] | undefined) => Boolean(items?.some((item) => typeof item === "string" && item.trim().length > 0));
const check = (id: string, label: string, passed: boolean, detail: string) => ({ id, label, passed, detail });

export function checkSchemeCompleteness(body: SchemeBody, input: Pick<GenInput, "weekFrom" | "weekTo" | "lessonsPerWeek">): PlanningQualityReport {
  const expectedWeeks = Math.max(1, input.weekTo - input.weekFrom + 1);
  const expectedLessons = expectedWeeks * Math.max(1, input.lessonsPerWeek);
  const weeks = (body.weeks ?? []).filter((week) => week.week >= input.weekFrom && week.week <= input.weekTo);
  const lessons = (body.lessons ?? []).filter((lesson) => lesson.week >= input.weekFrom && lesson.week <= input.weekTo);
  const hasOutcomes = weeks.length > 0 && weeks.every((week) => populated(week.outcomes));
  const hasExperiences = weeks.length > 0 && weeks.every((week) => populated(week.experiences));
  const hasInquiry = weeks.length > 0 && weeks.every((week) => populated(week.inquiry));
  const hasResourcesAssessment = weeks.length > 0 && weeks.every((week) => populated(week.resources) && Boolean(week.assessment?.trim()));
  const hasReflection = body.reflectionMode === "blank" || (body.columns ?? []).includes("reflection");
  const hasCurriculumLinks = weeks.some((week) => populated(week.competencies) || populated(week.values) || populated(week.pcis));
  return {
    source: SOURCE,
    notice: NOTICE,
    checks: [
      check("weeks", "Term weeks are represented", weeks.length === expectedWeeks, `${weeks.length} of ${expectedWeeks} requested weeks have entries.`),
      check("outcomes", "Specific learning outcomes are listed", hasOutcomes, "Review that each weekly outcome matches the current grade-specific KICD curriculum design."),
      check("experiences", "Learning experiences are planned", hasExperiences, "Check that activities make the selected content teachable in your class and time allocation."),
      check("inquiry", "Key inquiry questions are included", hasInquiry, "Review that questions are open enough to support learner investigation and discussion."),
      check("resources-assessment", "Resources and assessment are identified", hasResourcesAssessment, "Confirm resources are available and assessment produces evidence for the intended outcomes."),
      check("lesson-count", "Every scheduled lesson has a scheme row", lessons.length === expectedLessons, `${lessons.length} lesson rows found; ${expectedLessons} are expected for ${expectedWeeks} week(s) at ${input.lessonsPerWeek} lesson(s) per week.`),
      check("reflection", "Reflection is available for the teacher", hasReflection, "A reflection column or blank teacher-completion field should be retained and completed after teaching."),
      check("curriculum-links", "Competencies, values or PCIs were considered", hasCurriculumLinks, "Integrate relevant core competencies, values and pertinent contemporary issues without forcing an unrelated item into every lesson."),
    ],
  };
}

export function checkLessonCompleteness(body: LessonBody): PlanningQualityReport {
  const duration = Number.parseInt(body.duration, 10) || 40;
  const minutes = (body.steps ?? []).reduce((sum, step) => sum + Math.max(0, step.minutes || 0), 0);
  const hasSteps = (body.steps?.length ?? 0) >= 3 && body.steps!.every((step) => Boolean(step.teacher?.trim() && step.learners?.trim() && step.minutes > 0));
  return {
    source: SOURCE,
    notice: NOTICE,
    checks: [
      check("outcomes", "Lesson-specific outcomes are stated", populated(body.outcomes), "Check that each outcome is observable and suitable for the lesson duration."),
      check("sequencing", "Teachable lesson steps and time allocation are present", hasSteps && minutes === duration, `Steps total ${minutes} minutes; the lesson is planned for ${duration} minutes.`),
      check("inquiry-resources", "Inquiry questions and resources are identified", populated(body.inquiry) && populated(body.resources), "Verify resources are accessible, safe, and appropriate for the learners and environment."),
      check("assessment", "Assessment evidence is included", Boolean(body.assessment?.trim()) && populated(body.rubric?.map((item) => item.descriptor)), "Use the assessment and criteria to check progress against the stated learning outcomes."),
      check("differentiation", "Support and extension are planned", Boolean(body.support?.trim() && body.extension?.trim()), "Adapt activities for learner needs, abilities, backgrounds, and available support."),
      check("extended-learning", "Homework or an extension opportunity is stated", Boolean(body.homework?.trim() || body.extension?.trim()), "Ensure any extended-learning activity is curriculum-linked and practical for learners."),
      check("curriculum-links", "Relevant competencies, values and PCIs are considered", Boolean(body.competencies?.length || body.values?.length || body.pcis?.length), "Integrate only links that genuinely fit the activity; review whether any relevant links are missing."),
    ],
  };
}
