export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type DocKind = "scheme" | "lesson" | "notes" | "revision" | "exam";
export type QuestionType = "mcq" | "short" | "structured" | "true-false" | "fill-blank" | "practical";
export type TopicSubtopic = { title: string; pagesFrom: string; pagesTo: string };
export type TopicSelection = {
  sourceGrade?: string;
  strand: string;
  topic: string;
  subtopics: TopicSubtopic[];
  pagesFrom: string;
  pagesTo: string;
};

export type PublicSettings = {
  tillNumber: string;
  tillName: string;
  priceKes: number;
  whatsapp: string;
  contactName: string;
  welcome: string;
  freeForAll: boolean;
  paymentMode: "instant" | "approve";
  schemeColumns: string[];
  defaultLessons: number;
  defaultMinutes: 40 | 80;
  defaultNoteDepth: "full" | "summary";
  defaultQuestionCount: number;
  defaultQuestionTypes: QuestionType[];
  /** Default line printed at the top of every downloaded page. */
  headerText: string;
  /** Default line printed at the foot of every downloaded page. */
  footerText: string;
  headerDefaultOn: boolean;
  footerDefaultOn: boolean;
  /** Small PNG/JPEG kept as a data URL and printed in the document header. */
  schoolLogo: string;
  /** Global permission switches owned by the admin desk. */
  teacherMayEditBranding: boolean;
  teacherMayHideBranding: boolean;
  /** Minutes a verified desk-key grant stays valid. */
  deskLockMinutes: number;
};

export type BrandingMode = "default" | "custom" | "off";
export type BrandingGrant = "inherit" | "allowed" | "blocked";

/**
 * The header/footer a teacher's documents actually print with, plus why.
 * Computed on the server, so a browser cannot grant itself permission.
 */
export type BrandingState = {
  headerMode: BrandingMode;
  footerMode: BrandingMode;
  headerText: string;
  footerText: string;
  effectiveHeaderText: string;
  effectiveFooterText: string;
  logoDataUrl: string;
  canEdit: boolean;
  canRemove: boolean;
  permissionNote: string;
};

export type Profile = {
  userId: string;
  role: "admin" | "deputy" | "teacher";
  displayName: string;
  email: string;
  phone: string;
  schoolName: string;
  schemeColumns: string[];
  useAdminColumns: boolean;
  headerMode: BrandingMode;
  footerMode: BrandingMode;
  headerText: string;
  footerText: string;
  brandingGrant: BrandingGrant;
  schoolLogo: string;
};

export type Me = {
  profile: Profile;
  settings: PublicSettings;
  downloadsFree: boolean;
  generatedToday: number;
  dailyLimit: number;
  branding: BrandingState;
};

/** Header/footer an export should print, already resolved for one teacher. */
export type DocumentBranding = {
  showHeader: boolean;
  showFooter: boolean;
  headerText: string;
  footerText: string;
  logoDataUrl: string;
};

export type AssessmentKind =
  | "written"
  | "oral"
  | "practical"
  | "project"
  | "observation"
  | "midterm"
  | "endterm";

/** One CBC assessment column in the marks book. */
export type AssessmentRecord = {
  id: number;
  title: string;
  grade: string;
  stream: string;
  subject: string;
  term: string;
  year: number;
  assessmentKind: AssessmentKind;
  totalMarks: number;
  taughtOn: string;
  note: string;
  updatedAt: string;
  learners: AssessmentScore[];
};

export type AssessmentScore = {
  rollNo: string;
  learnerName: string;
  marks: number | null;
  note: string;
};

/** CBC assessment level derived from a percentage score. */
export type CbaLevel = {
  key: "exceeding" | "meeting" | "approaching" | "below";
  label: string;
  short: string;
  band: string;
};

export type SavedFilter = {
  id: number;
  label: string;
  level: string;
  grade: string;
  subject: string;
  term: string;
  year: number | null;
  kind: string;
};

/** Everything a receipt prints with, resolved server-side. */
export type ReceiptInfo = {
  receiptNo: string;
  issuedOn: string;
  amountKes: number;
  tillNumber: string;
  tillName: string;
  mpesaCode: string;
  status: string;
  verified: boolean;
  paidBy: string;
  school: string;
  phone: string;
  contactName: string;
  contactPhone: string;
  whatsapp: string;
  itemLabel: string;
  items: string[];
  merchantRequestId: string;
  checkoutRequestId: string;
};

export type DocMeta = {
  id: number;
  packId: string;
  kind: DocKind;
  title: string;
  level: string;
  grade: string;
  subject: string;
  strand: string;
  substrand: string;
  term: string;
  year: number;
  weekFrom: number;
  weekTo: number;
  lessonsPerWeek: number;
  pathway: string;
  schoolName: string;
  teacherName: string;
  phone: string;
  stream: string;
  startFrom: string;
  endAt: string;
  createdAt: string;
  unlocked: boolean;
  /** Effective price for this document's grade/learning area (0 means free). */
  priceKes: number;
  favorite: boolean;
};

/** One row of the teaching tracker for a scheme (taught tick + reflection). */
export type LessonProgress = {
  week: number;
  lesson: number;
  taught: boolean;
  reflection: string;
};

/** How much of one document has been taught, for library badges. */
export type ProgressSummary = {
  documentId: number;
  taught: number;
  total: number;
};

export type SchemeWeek = {
  week: number;
  focus: string;
  outcomes: string[];
  inquiry: string[];
  experiences: string[];
  competencies: string[];
  values: string[];
  pcis: string[];
  resources: string[];
  assessment: string;
  lessonHints: string[];
  homework: string;
};

export type PlanningQualityCheck = { id: string; label: string; passed: boolean; detail: string };
export type PlanningQualityReport = { source: string; notice: string; checks: PlanningQualityCheck[] };
export type GenerationProvenance = {
  mode: "ai" | "web-assisted-local" | "local-template" | "mixed";
  label: string;
  notice: string;
  sources: { title: string; url: string; license: string; retrievedAt: string; retrieval: "live" | "catalogued-link" }[];
  licenseNotice?: string;
};

export type SchemeTextbook = {
  title: string;
  publisher: string;
  pagesFrom: string;
  pagesTo: string;
  guide: "learner" | "teacher";
};

export type TocPhoto = {
  caption: string;
  dataUrl: string;
};

export type SchemeLesson = {
  week: number;
  lesson: number;
  dateLabel: string;
  strand: string;
  substrand: string;
  outcomes: string[];
  experiences: string[];
  inquiry: string[];
  resources: string[];
  assessment: string;
  reflection: string;
  competencies: string[];
  values: string[];
  pcis: string[];
  homework: string;
  minutes: number;
};

export type SchemeBody = {
  overview: string;
  csl: string;
  weeks: SchemeWeek[];
  lessons: SchemeLesson[];
  columns: string[];
  textbooks: SchemeTextbook[];
  bookLine: string;
  termStart: string;
  halfTermStart?: string;
  halfTermEnd?: string;
  lessonMinutes: number;
  reflectionMode: "blank" | "prompt";
  coverNote: string;
  safetyNote: string;
  showApproval: boolean;
  tocPhotos: TocPhoto[];
  learners: number;
  boys: number;
  girls: number;
  hodName: string;
  preparedOn: string;
  doubleLesson: number;
  homeworkDay: string;
  room: string;
  topicSelections?: TopicSelection[];
  qualityReport?: PlanningQualityReport;
  generationProvenance?: GenerationProvenance;
};

export type LessonBody = {
  duration: string;
  weekLabel: string;
  outcomes: string[];
  inquiry: string[];
  resources: string[];
  steps: { phase: string; minutes: number; teacher: string; learners: string }[];
  support: string;
  extension: string;
  assessment: string;
  rubric: { level: string; descriptor: string }[];
  homework: string;
  reflection: string;
  priorKnowledge?: string;
  successCriteria?: string[];
  competencies?: string[];
  values?: string[];
  pcis?: string[];
  qualityReport?: PlanningQualityReport;
  generationProvenance?: GenerationProvenance;
};

export type LessonPlanPackBody = {
  summary: string;
  totalLessons: number;
  lessonPlans: { week: number; lesson: number; body: LessonBody }[];
  qualityReport?: PlanningQualityReport;
  generationProvenance?: GenerationProvenance;
};

export type NotesBody = {
  summary: string;
  /** What the learner should be able to do after reading the chapter. */
  objectives?: string[];
  /** What they should already know before this chapter. */
  prerequisite?: string;
  /** Estimated page for each strand / sub-strand so the learner can find it. */
  contents?: { strand: string; substrand: string; page: number }[];
  vocabulary: { term: string; meaning: string }[];
  sections: { heading: string; paragraphs: string[]; examples: string[] }[];
  tryThis: string[];
  answerKey?: string[];
  answerKeyNote?: string;
  remember: string[];
  mistakes?: string[];
  generationProvenance?: GenerationProvenance;
};

export type RevisionBody = {
  instructions: string;
  timeMinutes?: number;
  assessmentMode?: "practice" | "cumulative" | "kjsea-format";
  coverageGrades?: string[];
  totalMarks?: number;
  qualityNotice?: string;
  generationProvenance?: GenerationProvenance;
  questions: {
    number: number;
    type: string;
    marks: number;
    prompt: string;
    options: string[];
    answer: string;
    marking: string;
  }[];
};

export type GenInput = {
  kind: DocKind;
  /** Internal queue id used to make worker recovery idempotent. Never supplied by the browser validator. */
  generationJobId?: string;
  parentId?: number;
  level: string;
  grade: string;
  subject: string;
  strand: string;
  substrand: string;
  substrands: string[];
  selectedTopics?: TopicSelection[];
  term: string;
  year: number;
  weekFrom: number;
  weekTo: number;
  lessonsPerWeek: number;
  pathway: string;
  startFrom: string;
  endAt: string;
  stream: string;
  focusWeek?: number;
  focusLesson?: number;
  questionCount?: number;
  questionTypes?: QuestionType[];
  questionDifficulty?: "balanced" | "foundation" | "standard" | "stretch";
  assessmentMode?: "practice" | "cumulative" | "kjsea-format";
  depth: "full" | "summary";
  teacherGuidance?: string;
  includeCompetencies?: string[];
  includeValues?: string[];
  includePcis?: string[];
  columns: string[];
  textbooks: SchemeTextbook[];
  lessonMinutes: 40 | 80;
  termStart: string;
  halfTermStart?: string;
  halfTermEnd?: string;
  reflectionMode: "blank" | "prompt";
  coverNote: string;
  assessmentMethods: string[];
  showApproval: boolean;
  safetyNote: boolean;
  tocPhotos: TocPhoto[];
  rememberColumns: boolean;
  learners: number;
  boys: number;
  girls: number;
  hodName: string;
  preparedOn: string;
  doubleLesson: number;
  homeworkDay: string;
  room: string;
};

export type PaymentRow = {
  id: number;
  teacherName: string;
  schoolName: string;
  phone: string;
  amountKes: number;
  tillNumber: string;
  mpesaCode: string;
  status: string;
  packId: string;
  createdAt: string;
  verified: boolean;
  /** Office receipt number, issued once when the payment is first receipted. */
  receiptNo: string;
  /** What the payment unlocked, e.g. "Grade 5 Mathematics · Term 2 pack". */
  itemLabel: string;
  /** Number that actually paid the till, when it differs from the profile. */
  paidPhone: string;
  paidAmount: number | null;
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number | null;
  resultDescription: string;
  errorMessage: string;
  receiptIssuedOn: string;
};

export type CalendarEventKind = "term" | "half-term" | "holiday" | "staff-day" | "exam";

export type CalendarEvent = {
  id: number;
  kind: CalendarEventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  note: string;
  completed: boolean;
};
