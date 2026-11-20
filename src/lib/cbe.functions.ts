import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { LEVELS, TERMS, bandOf, subjectsFor } from "@/lib/curriculum";
import { clampQuestionCount } from "@/lib/question-plan";
import { sanitizeColumns } from "@/lib/scheme-format";
import type { DocKind, GenInput, QuestionType, SchemeTextbook, TocPhoto, TopicSelection } from "@/lib/cbe-types";
import { AI_PROVIDERS, MAX_API_KEYS_PER_PROVIDER, type AiProvider } from "@/lib/ai-provider-types";
import { normalizeCurriculumPriceRule } from "@/lib/curriculum-pricing";

async function db() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function cleanGen(input: unknown): GenInput {
  const raw = asRecord(input);
  const kind = clip(raw.kind, 20) as DocKind;
  if (!["scheme", "lesson", "notes", "revision", "exam"].includes(kind)) {
    throw new Error("Choose what to write.");
  }
  const level = clip(raw.level, 20);
  const levelOk = LEVELS.some((item) => item.id === level);
  if (!levelOk) throw new Error("Choose primary, junior school or senior school.");
  const grades = LEVELS.find((item) => item.id === level)?.grades ?? [];
  const grade = clip(raw.grade, 20);
  const gradeList = grades as readonly string[];
  if (!gradeList.includes(grade)) throw new Error("Choose a grade in that level.");
  const subject = clip(raw.subject, 80);
  if (subject.length < 2) throw new Error("Enter the learning area.");
  const known = subjectsFor(level, grade);
  if (subject.length > 80) throw new Error("Shorten the learning area.");
  if (level === "primary" && bandOf(grade) && !known.includes(subject) && subject.toLowerCase() !== "physical and health education") {
    throw new Error(`${subject} is not one of the ${bandOf(grade)!.label} learning areas (${bandOf(grade)!.range}). Pick the area your timetable actually uses — at ${bandOf(grade)!.label} that list is set by the KICD lesson allocation.`);
  }
  if (!known.includes(subject) && !subjectsFor(level).includes(subject)) {
    // Junior/Senior keep their own list; anything still unknown is a custom area.
    void known;
  }
  const assessmentMode = raw.assessmentMode === "cumulative" || raw.assessmentMode === "kjsea-format" ? raw.assessmentMode : "practice";
  if (assessmentMode === "kjsea-format" && (!(["revision", "exam"] as string[]).includes(kind) || level !== "junior" || grade !== "Grade 9" || !subject.toLowerCase().includes("math"))) {
    throw new Error("KJSEA-format simulation is currently available only for Grade 9 Mathematics revision papers.");
  }
  const strand = clip(raw.strand, 120);
  const substrand = clip(raw.substrand, 120);
  if (strand.length < 2 || substrand.length < 2) {
    throw new Error("Enter the strand and the sub-strand.");
  }
  const term = clip(raw.term, 20);
  if (!TERMS.includes(term)) throw new Error("Choose the term.");
  const year = Number(raw.year);
  if (!Number.isInteger(year) || year < 2024 || year > 2035) throw new Error("Choose a valid year.");
  const weekFrom = Number(raw.weekFrom);
  const weekTo = Number(raw.weekTo);
  if (!Number.isInteger(weekFrom) || !Number.isInteger(weekTo) || weekFrom < 1 || weekTo > 14 || weekTo < weekFrom) {
    throw new Error("Weeks should run from 1 to 14, and the end week cannot come first.");
  }
  if (weekTo - weekFrom + 1 > 13) throw new Error("One scheme can cover at most 13 weeks. Split the term.");
  const lessonsPerWeek = Number(raw.lessonsPerWeek);
  if (!Number.isInteger(lessonsPerWeek) || lessonsPerWeek < 1 || lessonsPerWeek > 6) {
    throw new Error("Lessons per week should be between 1 and 6.");
  }
  const depth = raw.depth === "summary" ? "summary" : "full";
  // A real Kenyan paper runs long: a Grade 4-6 end-of-term paper comfortably
  // needs 45+ items, and booklet revision goes to 100. The ladder is the same
  // one the desk settings and the generator share.
  const questionCount = clampQuestionCount(raw.questionCount ?? (depth === "summary" ? 10 : 45), depth);
  const parentId = raw.parentId == null || raw.parentId === "" ? undefined : Number(raw.parentId);
  if (parentId !== undefined && (!Number.isInteger(parentId) || parentId < 1)) {
    throw new Error("That scheme link is not valid.");
  }
  const focusWeek = raw.focusWeek == null || raw.focusWeek === "" ? undefined : Number(raw.focusWeek);
  const focusLesson = raw.focusLesson == null || raw.focusLesson === "" ? undefined : Number(raw.focusLesson);
  const substrands = Array.isArray(raw.substrands)
    ? raw.substrands.map((item) => clip(item, 120)).filter((item) => item.length >= 2).slice(0, 12)
    : [];
  const selectedTopics: TopicSelection[] = Array.isArray(raw.selectedTopics)
    ? raw.selectedTopics.slice(0, 36).map((item) => {
        const topic = asRecord(item);
        const children = Array.isArray(topic.subtopics) ? topic.subtopics.slice(0, 24).map((child) => {
          const subtopic = asRecord(child);
          return {
            title: clip(subtopic.title, 100),
            pagesFrom: clip(subtopic.pagesFrom, 5).replace(/\D/g, ""),
            pagesTo: clip(subtopic.pagesTo, 5).replace(/\D/g, ""),
          };
        }).filter((child) => child.title.length >= 2) : [];
        const title = clip(topic.topic, 100);
        return {
          sourceGrade: clip(topic.sourceGrade, 20) || undefined,
          strand: clip(topic.strand, 100) || strand,
          topic: title,
          pagesFrom: clip(topic.pagesFrom, 5).replace(/\D/g, ""),
          pagesTo: clip(topic.pagesTo, 5).replace(/\D/g, ""),
          subtopics: children,
        };
      }).filter((topic) => topic.topic.length >= 2)
    : [];
  const allowedQuestionTypes: QuestionType[] = ["mcq", "short", "structured", "true-false", "fill-blank", "practical"];
  const questionTypes = Array.isArray(raw.questionTypes)
    ? [...new Set(raw.questionTypes.filter((type): type is QuestionType => typeof type === "string" && allowedQuestionTypes.includes(type as QuestionType)))].slice(0, 6)
    : ["mcq", "short", "structured"];
  const cleanChoiceList = (value: unknown, max: number, length: number): string[] => Array.isArray(value)
    ? [...new Set(value.map((item) => clip(item, length)).filter(Boolean))].slice(0, max)
    : [];
  const textbooks = cleanBooks(raw.textbooks);
  const tocPhotos = cleanPhotos(raw.tocPhotos);
  const assessmentMethods = Array.isArray(raw.assessmentMethods)
    ? raw.assessmentMethods.map((item) => clip(item, 40)).filter(Boolean).slice(0, 6)
    : [];
  return {
    kind,
    parentId,
    level,
    grade,
    subject,
    strand,
    substrand,
    substrands,
    selectedTopics,
    term,
    year,
    weekFrom,
    weekTo,
    lessonsPerWeek,
    pathway: clip(raw.pathway, 60),
    startFrom: clip(raw.startFrom, 240),
    endAt: clip(raw.endAt, 240),
    stream: clip(raw.stream, 40),
    focusWeek: focusWeek !== undefined && Number.isInteger(focusWeek) ? focusWeek : undefined,
    focusLesson: focusLesson !== undefined && Number.isInteger(focusLesson) && focusLesson >= 1 && focusLesson <= 6 ? focusLesson : undefined,
    questionCount,
    questionTypes: (questionTypes.length ? questionTypes : ["short"]) as QuestionType[],
    questionDifficulty: raw.questionDifficulty === "foundation" || raw.questionDifficulty === "standard" || raw.questionDifficulty === "stretch" ? raw.questionDifficulty : "balanced",
    assessmentMode: kind === "revision" || kind === "exam" ? assessmentMode : undefined,
    depth,
    teacherGuidance: clip(raw.teacherGuidance, 500),
    includeCompetencies: cleanChoiceList(raw.includeCompetencies, 7, 80),
    includeValues: cleanChoiceList(raw.includeValues, 7, 40),
    includePcis: cleanChoiceList(raw.includePcis, 8, 80),
    columns: sanitizeColumns(raw.columns),
    textbooks,
    lessonMinutes: Number(raw.lessonMinutes) === 80 ? 80 : 40,
    termStart: /^\d{4}-\d{2}-\d{2}$/.test(clip(raw.termStart, 10)) ? clip(raw.termStart, 10) : "",
    halfTermStart: /^\d{4}-\d{2}-\d{2}$/.test(clip(raw.halfTermStart, 10)) ? clip(raw.halfTermStart, 10) : "",
    halfTermEnd: /^\d{4}-\d{2}-\d{2}$/.test(clip(raw.halfTermEnd, 10)) ? clip(raw.halfTermEnd, 10) : "",
    reflectionMode: raw.reflectionMode === "prompt" ? "prompt" : "blank",
    coverNote: clip(raw.coverNote, 180),
    assessmentMethods,
    showApproval: raw.showApproval !== false,
    safetyNote: Boolean(raw.safetyNote),
    tocPhotos,
    rememberColumns: Boolean(raw.rememberColumns),
    learners: clampCount(raw.learners, 80),
    boys: clampCount(raw.boys, 80),
    girls: clampCount(raw.girls, 80),
    hodName: clip(raw.hodName, 80),
    preparedOn: /^\d{4}-\d{2}-\d{2}$/.test(clip(raw.preparedOn, 10)) ? clip(raw.preparedOn, 10) : "",
    doubleLesson: clampCount(raw.doubleLesson, 6),
    homeworkDay: clip(raw.homeworkDay, 20),
    room: clip(raw.room, 40),
  };
}

function clampCount(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(max, n);
}

function cleanBooks(value: unknown): SchemeTextbook[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((item) => {
    const book = asRecord(item);
    const title = clip(book.title, 80);
    if (title.length < 2) return null;
    const pagesFrom = clip(book.pagesFrom, 8).replace(/[^\d]/g, "");
    const pagesTo = clip(book.pagesTo, 8).replace(/[^\d]/g, "");
    return {
      title,
      publisher: clip(book.publisher, 80),
      pagesFrom,
      pagesTo,
      guide: book.guide === "teacher" ? "teacher" as const : "learner" as const,
    };
  }).filter((book): book is SchemeTextbook => book !== null);
}

function cleanPhotos(value: unknown): TocPhoto[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2).map((item) => {
    const photo = asRecord(item);
    const dataUrl = typeof photo.dataUrl === "string" ? photo.dataUrl : "";
    if (!dataUrl.startsWith("data:image/") || dataUrl.length > 180_000) return null;
    return { caption: clip(photo.caption, 80) || "Table of contents", dataUrl };
  }).filter((photo): photo is TocPhoto => photo !== null);
}

export const getPublicDesk = createServerFn({ method: "GET" }).handler(async () => {
  const { publicDesk } = await import("@/lib/cbe.server");
  return publicDesk(await db());
});

export const getMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { loadMe } = await import("@/lib/cbe.server");
    return loadMe(await db(), context.userId);
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { displayName: string; phone: string; schoolName: string }) => ({
    displayName: clip(input?.displayName, 80),
    phone: clip(input?.phone, 20),
    schoolName: clip(input?.schoolName, 120),
  }))
  .handler(async ({ context, data }) => {
    const { saveProfile } = await import("@/lib/cbe.server");
    return saveProfile(await db(), context.userId, data);
  });

export const saveSchemeLayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { useAdminColumns: boolean; schemeColumns: string[] }) => ({
    useAdminColumns: Boolean(input?.useAdminColumns),
    schemeColumns: sanitizeColumns(input?.schemeColumns),
  }))
  .handler(async ({ context, data }) => {
    const { saveSchemeLayout: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { secret: string }) => clip(input?.secret, 256))
  .handler(async ({ context, data }) => {
    const { claimAdmin: claim } = await import("@/lib/cbe.server");
    return claim(await db(), context.userId, data);
  });

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listDocuments: list } = await import("@/lib/cbe.server");
    return list(await db(), context.userId);
  });

export const getDocument = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error("Missing document.");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { readDocument } = await import("@/lib/cbe.server");
    return readDocument(await db(), context.userId, data);
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error("Missing document.");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { removeDocument } = await import("@/lib/cbe.server");
    return removeDocument(await db(), context.userId, data);
  });

export const generateDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanGen)
  .handler(async ({ context, data }) => {
    const { generateDocument: generate } = await import("@/lib/cbe.server");
    return generate(await db(), context.userId, data);
  });

export const startPackStk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { packId: string; phone: string }) => ({
    packId: clip(input?.packId, 80),
    phone: clip(input?.phone, 20),
  }))
  .handler(async ({ context, data }) => {
    const { startPackStk: start } = await import("@/lib/cbe.server");
    return start(await db(), context.userId, data.packId, data.phone);
  });

export const refreshPackPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { packId: string }) => ({ packId: clip(input?.packId, 80) }))
  .handler(async ({ context, data }) => {
    const { refreshPackPayment: refresh } = await import("@/lib/cbe.server");
    return refresh(await db(), context.userId, data.packId);
  });

export const payForPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { packId: string; mpesaCode: string }) => ({
    packId: clip(input?.packId, 80),
    mpesaCode: clip(input?.mpesaCode, 32),
  }))
  .handler(async ({ context, data }) => {
    const { payForPack: pay } = await import("@/lib/cbe.server");
    return pay(await db(), context.userId, data.packId, data.mpesaCode);
  });

export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listMyPayments: list } = await import("@/lib/cbe.server");
    return list(await db(), context.userId);
  });

export const getAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { adminOverview } = await import("@/lib/cbe.server");
    return adminOverview(await db(), context.userId);
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    tillNumber: string;
    tillName: string;
    priceKes: number;
    whatsapp: string;
    contactName: string;
    welcome: string;
    freeForAll: boolean;
    paymentMode: "instant" | "approve";
    dailyGenLimit: number;
    schemeColumns: string[];
    defaultLessons: number;
    defaultMinutes: 40 | 80;
    defaultNoteDepth: "full" | "summary";
    defaultQuestionCount: number;
    defaultQuestionTypes: QuestionType[];
  }) => ({
    tillNumber: clip(input?.tillNumber, 20),
    tillName: clip(input?.tillName, 60),
    priceKes: Number(input?.priceKes),
    whatsapp: clip(input?.whatsapp, 20),
    contactName: clip(input?.contactName, 60),
    welcome: clip(input?.welcome, 400),
    freeForAll: Boolean(input?.freeForAll),
    paymentMode: input?.paymentMode === "approve" ? "approve" as const : "instant" as const,
    dailyGenLimit: Number(input?.dailyGenLimit),
    schemeColumns: sanitizeColumns(input?.schemeColumns),
    defaultLessons: Number(input?.defaultLessons),
    defaultMinutes: Number(input?.defaultMinutes) === 80 ? 80 as const : 40 as const,
    defaultNoteDepth: input?.defaultNoteDepth === "summary" ? "summary" as const : "full" as const,
    defaultQuestionCount: Number(input?.defaultQuestionCount),
    defaultQuestionTypes: (Array.isArray(input?.defaultQuestionTypes)
      ? [...new Set(input.defaultQuestionTypes.filter((type): type is QuestionType => ["mcq", "short", "structured", "true-false", "fill-blank", "practical"].includes(type)))]
      : ["mcq", "short", "structured"]) as QuestionType[],
  }))
  .handler(async ({ context, data }) => {
    const { saveSettings } = await import("@/lib/cbe.server");
    return saveSettings(await db(), context.userId, data);
  });

export const setTeacherRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; role: "admin" | "deputy" | "teacher" }) => ({
    userId: clip(input?.userId, 100),
    role: input?.role === "admin" ? "admin" as const : input?.role === "deputy" ? "deputy" as const : "teacher" as const,
  }))
  .handler(async ({ context, data }) => {
    const { setTeacherRole: setRole } = await import("@/lib/cbe.server");
    return setRole(await db(), context.userId, data.userId, data.role);
  });

export const changeAdminPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { current: string; next: string }) => ({
    current: clip(input?.current, 40),
    next: clip(input?.next, 40),
  }))
  .handler(async ({ context, data }) => {
    const { changeAdminPin: change } = await import("@/lib/cbe.server");
    return change(await db(), context.userId, data.current, data.next);
  });

export const createGrant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { kind: "teacher" | "school"; teacherUserId?: string; schoolName?: string; note?: string }) => ({
    kind: input?.kind === "school" ? "school" as const : "teacher" as const,
    teacherUserId: clip(input?.teacherUserId, 80),
    schoolName: clip(input?.schoolName, 120),
    note: clip(input?.note, 140),
  }))
  .handler(async ({ context, data }) => {
    const { addGrant } = await import("@/lib/cbe.server");
    return addGrant(await db(), context.userId, data);
  });

export const diagnoseDesk = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { diagnoseDesk: diagnose } = await import("@/lib/cbe.server");
    return diagnose(await db(), context.userId);
  });

export const clearStuckPayments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { clearStuckPayments: clear } = await import("@/lib/cbe.server");
    return clear(await db(), context.userId);
  });

export const deleteGrant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error("Missing grant.");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { removeGrant } = await import("@/lib/cbe.server");
    return removeGrant(await db(), context.userId, data);
  });

export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; status: "paid" | "revoked" | "pending" }) => {
    const id = Number(input?.id);
    if (!Number.isInteger(id) || id < 1) throw new Error("Missing payment.");
    const status: "paid" | "revoked" | "pending" =
      input?.status === "revoked" || input?.status === "pending" ? input.status : "paid";
    return { id, status };
  })
  .handler(async ({ context, data }) => {
    const { setPaymentStatus } = await import("@/lib/cbe.server");
    return setPaymentStatus(await db(), context.userId, data.id, data.status);
  });

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listCalendarEvents: list } = await import("@/lib/cbe.server");
    return list(await db(), context.userId);
  });

export const saveCalendarEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: number; kind: string; title: string; startsOn: string; endsOn: string; note?: string; completed?: boolean }) => {
    const kind = ["term", "half-term", "holiday", "staff-day", "exam"].includes(input?.kind) ? input.kind as "term" | "half-term" | "holiday" | "staff-day" | "exam" : "term";
    const startsOn = clip(input?.startsOn, 10);
    const endsOn = clip(input?.endsOn, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) throw new Error("Choose valid start and end dates.");
    if (endsOn < startsOn) throw new Error("The end date cannot come before the start date.");
    return { id: input?.id ? Number(input.id) : undefined, kind, title: clip(input?.title, 100), startsOn, endsOn, note: clip(input?.note, 240), completed: Boolean(input?.completed) };
  })
  .handler(async ({ context, data }) => {
    const { saveCalendarEvent: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error("Missing calendar event.");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { deleteCalendarEvent: remove } = await import("@/lib/cbe.server");
    return remove(await db(), context.userId, data);
  });

/* ── Favourites, duplicates and the teaching tracker ─────────────────────── */

function documentId(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error("Missing document.");
  return n;
}

export const setFavorite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; favorite: boolean }) => ({
    id: documentId(input?.id),
    favorite: Boolean(input?.favorite),
  }))
  .handler(async ({ context, data }) => {
    const { setFavorite: set } = await import("@/lib/cbe.server");
    return set(await db(), context.userId, data.id, data.favorite);
  });

export const duplicateDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: number; term?: string; year?: number; weekFrom?: number; weekTo?: number }) => {
    const year = input?.year == null ? undefined : Number(input.year);
    const weekFrom = input?.weekFrom == null ? undefined : Number(input.weekFrom);
    const weekTo = input?.weekTo == null ? undefined : Number(input.weekTo);
    return {
      id: documentId(input?.id),
      term: clip(input?.term, 20) || undefined,
      year: year !== undefined && Number.isInteger(year) ? year : undefined,
      weekFrom: weekFrom !== undefined && Number.isInteger(weekFrom) ? weekFrom : undefined,
      weekTo: weekTo !== undefined && Number.isInteger(weekTo) ? weekTo : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    const { duplicateDocument: copy } = await import("@/lib/cbe.server");
    return copy(await db(), context.userId, data.id, data);
  });

export const getLessonProgress = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(documentId)
  .handler(async ({ context, data }) => {
    const { listProgress } = await import("@/lib/cbe.server");
    return listProgress(await db(), context.userId, data);
  });

export const saveLessonProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { documentId: number; week: number; lesson: number; taught: boolean; reflection: string }) => ({
    documentId: documentId(input?.documentId),
    week: Number(input?.week),
    lesson: Number(input?.lesson),
    taught: Boolean(input?.taught),
    reflection: clip(input?.reflection, 240),
  }))
  .handler(async ({ context, data }) => {
    const { saveProgress } = await import("@/lib/cbe.server");
    return saveProgress(await db(), context.userId, data);
  });

export const getProgressSummary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { progressSummary } = await import("@/lib/cbe.server");
    return progressSummary(await db(), context.userId);
  });

export const getAiProviderStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { aiProviderStatusForOwner } = await import("@/lib/cbe.server");
    return aiProviderStatusForOwner(await db(), context.userId);
  });

export const saveAiProviderSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = asRecord(input);
    const rawKeys = asRecord(raw.keys);
    const rawRemove = asRecord(raw.remove);
    const keys = Object.fromEntries(AI_PROVIDERS.map((provider) => {
      const value = rawKeys[provider] ?? raw[provider];
      const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return [provider, values.slice(0, MAX_API_KEYS_PER_PROVIDER).map((key) => clip(key, 4096)).filter(Boolean)];
    })) as Partial<Record<AiProvider, string[]>>;
    const remove = Object.fromEntries(AI_PROVIDERS.map((provider) => [provider,
      (Array.isArray(rawRemove[provider]) ? rawRemove[provider] as unknown[] : [])
        .map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < MAX_API_KEYS_PER_PROVIDER),
    ])) as Partial<Record<AiProvider, number[]>>;
    const preferred = AI_PROVIDERS.includes(raw.preferred as AiProvider) ? raw.preferred as AiProvider : "manus";
    const clear = Array.isArray(raw.clear) ? [...new Set(raw.clear.filter((item): item is AiProvider => AI_PROVIDERS.includes(item as AiProvider)))] : [];
    return { preferred, keys, remove, collaborativeReview: raw.collaborativeReview !== false, clear };
  })
  .handler(async ({ context, data }) => {
    const { saveAiProviderSettings: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });

export const probeAiProviderKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = asRecord(input);
    if (!AI_PROVIDERS.includes(raw.provider as AiProvider)) throw new Error("Choose a supported provider.");
    const apiKey = clip(raw.apiKey, 4096);
    const savedIndex = raw.savedIndex == null ? undefined : Number(raw.savedIndex);
    if (savedIndex !== undefined && (!Number.isInteger(savedIndex) || savedIndex < 0 || savedIndex >= MAX_API_KEYS_PER_PROVIDER)) {
      throw new Error("Choose a valid saved-key position.");
    }
    if (Boolean(apiKey) === (savedIndex !== undefined)) throw new Error("Choose one staged key or one saved key to test.");
    return { provider: raw.provider as AiProvider, apiKey: apiKey || undefined, savedIndex };
  })
  .handler(async ({ context, data }) => {
    const { probeAiProviderKeyForOwner } = await import("@/lib/cbe.server");
    return probeAiProviderKeyForOwner(await db(), context.userId, data);
  });

export const getCurriculumPriceRules = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listCurriculumPriceRulesForOwner } = await import("@/lib/cbe.server");
    return listCurriculumPriceRulesForOwner(await db(), context.userId);
  });

export const saveCurriculumPriceRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => normalizeCurriculumPriceRule(input))
  .handler(async ({ context, data }) => {
    const { saveCurriculumPriceRule: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });

export const removeCurriculumPriceRule = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = asRecord(input);
    const rule = normalizeCurriculumPriceRule({ grade: raw.grade, subject: raw.subject, priceKes: 0 });
    return { grade: rule.grade, subject: rule.subject };
  })
  .handler(async ({ context, data }) => {
    const { removeCurriculumPriceRule: remove } = await import("@/lib/cbe.server");
    return remove(await db(), context.userId, data);
  });

export const generateLessonPlanPack = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(documentId)
  .handler(async ({ context, data }) => {
    const { generateLessonPlanPack: generate } = await import("@/lib/cbe.server");
    return generate(await db(), context.userId, data);
  });


export const enqueueGeneration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanGen)
  .handler(async ({ context, data }) => {
    const { enqueueDocumentGeneration } = await import("@/lib/generation-queue.server");
    return enqueueDocumentGeneration(await db(), context.userId, data);
  });

function cleanJobId(value: unknown): string {
  const id = clip(value, 80);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("That writing job ID is not valid.");
  return id;
}

export const getGenerationJob = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(cleanJobId)
  .handler(async ({ context, data }) => {
    const { readGenerationJob } = await import("@/lib/generation-queue.server");
    return readGenerationJob(await db(), context.userId, data);
  });

export const runGenerationJob = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanJobId)
  .handler(async ({ context, data }) => {
    const { processOwnGenerationJob } = await import("@/lib/generation-queue.server");
    return processOwnGenerationJob(await db(), context.userId, data);
  });


/* ── Header / footer branding ─────────────────────────────────────────────── */
const brandingShape = (value: unknown) => asRecord(value);
function cleanTeacherBranding(value: unknown) {
  const raw = asRecord(value);
  return {
    headerMode: clip(raw.headerMode, 12),
    footerMode: clip(raw.footerMode, 12),
    headerText: clip(raw.headerText, 120),
    footerText: clip(raw.footerText, 120),
    schoolLogo: typeof raw.schoolLogo === "string" ? raw.schoolLogo : "",
  };
}
function cleanDeskBranding(value: unknown) {
  return {
    headerText: clip(asRecord(value).headerText, 120),
    footerText: clip(asRecord(value).footerText, 120),
    headerDefaultOn: asRecord(value).headerDefaultOn === true,
    footerDefaultOn: asRecord(value).footerDefaultOn === true,
    teacherMayEditBranding: asRecord(value).teacherMayEditBranding === true,
    teacherMayHideBranding: asRecord(value).teacherMayHideBranding === true,
    schoolLogo: typeof asRecord(value).schoolLogo === "string" ? asRecord(value).schoolLogo : "",
  };
}
export const saveTeacherBranding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanTeacherBranding)
  .handler(async ({ context, data }) => {
    const { saveTeacherBranding: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });
export const adminSaveBranding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanDeskBranding)
  .handler(async ({ context, data }) => {
    const { adminSaveBranding: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });
export const setBrandingGrant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(brandingShape)
  .handler(async ({ context, data }) => {
    const { setBrandingGrant: apply } = await import("@/lib/cbe.server");
    return apply(await db(), context.userId, clip(data.targetId, 100), data.grant);
  });

/* ── Desk access ──────────────────────────────────────────────────────────── */
export const adminDeskStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { adminDeskStatus: status } = await import("@/lib/cbe.server");
    return status(await db(), context.userId);
  });
export const verifyDeskKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(brandingShape)
  .handler(async ({ context, data }) => {
    const { verifyDeskKey: verify } = await import("@/lib/cbe.server");
    const hint = typeof data.deviceHint === "string" ? data.deviceHint.slice(0, 80) : "";
    return verify(await db(), context.userId, typeof data.secret === "string" ? data.secret : "", hint);
  });
export const revokeDeskAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { revokeDeskAccess: revoke } = await import("@/lib/cbe.server");
    return revoke(await db(), context.userId);
  });
export const rotateDeskKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(brandingShape)
  .handler(async ({ context, data }) => {
    const { rotateDeskKey: rotate } = await import("@/lib/cbe.server");
    return rotate(await db(), context.userId, data.current, data.next);
  });

/* ── Receipts ─────────────────────────────────────────────────────────────── */
function cleanPaymentId(value: unknown): { id: number; asAdmin: boolean } {
  const raw = asRecord(value);
  const id = Math.round(Number(raw.id));
  if (!Number.isInteger(id) || id < 1) throw new Error("Choose a payment.");
  return { id, asAdmin: raw.asAdmin === true };
}
export const getReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanPaymentId)
  .handler(async ({ context, data }) => {
    const { buildReceipt, isStaffUser } = await import("@/lib/cbe.server");
    if (data.asAdmin && !(await isStaffUser(await db(), context.userId))) {
      return { ok: false as const, error: "Only the admin desk can open another teacher's receipt." };
    }
    return buildReceipt(await db(), context.userId, data.id, data.asAdmin);
  });
export const listReceipts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(brandingShape)
  .handler(async ({ context, data }) => {
    const { listReceipts: all, isStaffUser } = await import("@/lib/cbe.server");
    const asAdmin = data.asAdmin === true && (await isStaffUser(await db(), context.userId));
    return all(await db(), context.userId, asAdmin);
  });

/* ── Assessment records (marks book) ──────────────────────────────────────── */
function cleanAssessment(value: unknown) {
  const raw = asRecord(value);
  const kinds = ["written", "oral", "practical", "project", "observation", "midterm", "endterm"];
  const rows = Array.isArray(raw.learners) ? raw.learners.slice(0, 120).map((item) => asRecord(item)) : [];
  return {
    id: Number(raw.id) > 0 ? Math.round(Number(raw.id)) : undefined,
    title: clip(raw.title, 90),
    grade: clip(raw.grade, 20),
    stream: clip(raw.stream, 20),
    subject: clip(raw.subject, 60),
    term: clip(raw.term, 12),
    year: Number(raw.year) || new Date().getFullYear(),
    assessmentKind: kinds.includes(String(raw.assessmentKind)) ? String(raw.assessmentKind) : "written",
    totalMarks: Math.max(1, Math.min(200, Math.round(Number(raw.totalMarks) || 100))),
    taughtOn: clip(raw.taughtOn, 12),
    note: clip(raw.note, 200),
    learners: rows.map((row) => ({
      rollNo: clip(row.rollNo, 12),
      learnerName: clip(row.learnerName, 60),
      marks: row.marks === null || row.marks === "" || row.marks === undefined ? null : Number(row.marks),
      note: clip(row.note, 120),
    })),
  };
}
export const listAssessments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listAssessments: all } = await import("@/lib/cbe.server");
    return all(await db(), context.userId);
  });
export const saveAssessmentRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanAssessment)
  .handler(async ({ context, data }) => {
    const { saveAssessment: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });
export const deleteAssessmentRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error("Missing assessment record.");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { removeAssessment: remove } = await import("@/lib/cbe.server");
    return remove(await db(), context.userId, data);
  });
export const getAssessmentSummary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(brandingShape)
  .handler(async ({ context, data }) => {
    const { assessmentSummary } = await import("@/lib/cbe.server");
    return assessmentSummary(await db(), context.userId, {
      grade: clip(data.grade, 20),
      term: clip(data.term, 12),
      year: Number(data.year) || 0,
    });
  });

/* ── Saved library searches ───────────────────────────────────────────────── */
function cleanFilter(value: unknown) {
  const raw = asRecord(value);
  return {
    label: clip(raw.label, 60),
    level: clip(raw.level, 20),
    grade: clip(raw.grade, 20),
    subject: clip(raw.subject, 60),
    term: clip(raw.term, 12),
    year: raw.year ? Number(raw.year) : null,
    kind: clip(raw.kind, 20) || "all",
  };
}
export const listSavedFilters = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listSavedFilters: all } = await import("@/lib/cbe.server");
    return all(await db(), context.userId);
  });
export const saveSavedFilter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(cleanFilter)
  .handler(async ({ context, data }) => {
    const { saveSavedFilter: save } = await import("@/lib/cbe.server");
    return save(await db(), context.userId, data);
  });
export const removeSavedFilter = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: number) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) throw new Error("Missing saved search.");
    return n;
  })
  .handler(async ({ context, data }) => {
    const { removeSavedFilter: remove } = await import("@/lib/cbe.server");
    return remove(await db(), context.userId, data);
  });

export const getWriterDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { writerDesk } = await import("@/lib/teacher-writer.server");
    return writerDesk(await db(), context.userId);
  });

export const saveWriterKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { apiKey?: string }) => ({ apiKey: clip(input?.apiKey, 220) }))
  .handler(async ({ context, data }) => {
    const { saveTeacherWriterKey } = await import("@/lib/teacher-writer.server");
    return saveTeacherWriterKey(await db(), context.userId, data.apiKey);
  });

export const clearWriterKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { clearTeacherWriterKey } = await import("@/lib/teacher-writer.server");
    return clearTeacherWriterKey(await db(), context.userId);
  });

