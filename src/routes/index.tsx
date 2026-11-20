import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  Download,
  FileText,
  GraduationCap,
  Library,
  MessagesSquare,
  School,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { buttonClass } from "@/components/bits";
import { getPublicDesk } from "@/lib/cbe.functions";
import { IAN_NAME, IAN_PHONE_DISPLAY, IAN_PHONE_TEL, waLink } from "@/lib/contact";
import type { PublicSettings } from "@/lib/cbe-types";
import { DEFAULT_SCHEME_COLUMNS } from "@/lib/scheme-format";
import { DEFAULT_FOOTER_TEXT, DEFAULT_HEADER_TEXT } from "@/lib/branding";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

const FALLBACK: PublicSettings = {
  tillNumber: "",
  tillName: IAN_NAME,
  priceKes: 50,
  whatsapp: "254723278526",
  contactName: IAN_NAME,
  welcome:
    "Karibu. Name the grade, the learning area, and where the scheme should start and stop.",
  freeForAll: false,
  paymentMode: "instant",
  schemeColumns: DEFAULT_SCHEME_COLUMNS,
  defaultLessons: 5,
  defaultMinutes: 40,
  defaultNoteDepth: "full",
  defaultQuestionCount: 45,
  defaultQuestionTypes: ["mcq", "short", "structured"],
  headerText: DEFAULT_HEADER_TEXT,
  footerText: DEFAULT_FOOTER_TEXT,
  headerDefaultOn: true,
  footerDefaultOn: true,
  schoolLogo: "",
  teacherMayEditBranding: false,
  teacherMayHideBranding: false,
  deskLockMinutes: 30,
};

const MORE = [
  ["One row per lesson", "Five lessons a week means five rows, not one block for the week."],
  ["Strand on every row", "Strand and sub-strand sit on each lesson, as in the staffroom table."],
  ["Several sub-strands", "List them. They are shared across the lessons in order."],
  ["Choose the columns", "Hide competencies or homework. Week and lesson stay."],
  ["Admin default table", "The admin sets the school format. Teachers start from that."],
  ["Your own format", "A teacher can save a different set of columns."],
  ["Textbook list", "Champions, KLB, Oxford, Spotlight, Longhorn and others."],
  ["A book you type", "If the book is missing, add the title and publisher."],
  ["Name and pages", "The book and the page for that lesson print on the scheme."],
  ["Contents photo", "Upload a photo of the table of contents. It stays with the scheme."],
  ["Full notes", "Notes are written out. A summary only if you ask for one."],
  ["Long revision", "Choose 15 to 100 questions, with a full marking scheme and section layout."],
  ["Champions header", "School, teacher, year and term with the number of weeks."],
  ["Week dates", "Give the first Monday. Each week shows its dates."],
  ["Single or double", "40 minutes or 80 minutes on the scheme."],
  ["Approval lines", "Teacher, HOD and deputy sign under the table."],
  ["Taught ticks", "Mark a lesson as taught. It stays on this phone."],
  ["Assessment methods", "Observation, oral, practical, peer feedback and more."],
  ["Blank reflection", "The reflection column is left open for handwriting."],
  ["WhatsApp the cover", "Send the school, book and weeks without the whole file."],
];

const FEATURES = [
  ["Week-by-week CBE schemes", "Outcomes, inquiry, experiences, competencies, values and PCIs."],
  ["Lesson plans", "A 40-minute lesson with introduction, development, application and conclusion."],
  ["Learner notes", "Vocabulary, explanations and examples in the language of the learning area."],
  ["Revision papers", "Choose question types, number and difficulty; include a marking scheme you can hide while projecting."],
  ["PDF download", "A landscape scheme or a portrait lesson, notes or paper."],
  ["Word download", "Edit the file in Word before you print for the office."],
  ["Both in one zip", "PDF and Word together, one tap."],
  ["Your library", "Schemes stay on your account. Search them by grade, subject or term."],
  ["Till payment", "The price is set by the admin. Paste the M-Pesa code to unlock the files."],
  ["Free when granted", "Everyone, one teacher, or a whole school can be released from the till."],
  ["Common strands", "Pick a usual strand, or type the exact one in your design."],
  ["Senior pathways", "Tag STEM, Social Sciences, or Arts and Sports Science."],
  ["Performance rubric", "Exceeds, Meets, Approaches and Below Expectations on the lesson plan."],
  ["Support and extension", "A task for learners who need help, and one for those who are ahead."],
  ["Homework", "Every scheme week carries a short home task."],
  ["Remix", "Open a saved scheme and write the next term from the same strand."],
  ["Class on the cover", "School, stream, teacher and phone print on the first page."],
  ["Who paid", "The admin desk lists every code, teacher, school and amount."],
  ["Revenue by school", "A simple chart of what each school has paid."],
  ["WhatsApp the admin", "One tap reaches IAN TECH when a till or a scheme needs a human."],
  ["Writing limit", "A daily cap protects the desk. The admin can raise it."],
  ["Approve or instant", "Codes can unlock at once, or wait until you confirm the SMS."],
  ["Revoke a code", "If a code is not on your M-Pesa statement, take the download back."],
  ["Print the page", "Project the notes, hide the answers, and print what is on screen."],
  ["Choose several topics", "Select topics and subtopics for a scheme, then add any missing strand or lesson focus."],
  ["Smart Minds page references", "Grade 7 Term 3 Mathematics can cite the supplied Smart Minds learner’s book by topic and lesson."],
  ["Junior curriculum browser", "Grade 7, 8 and 9 learning areas, strands and sub-strands are grouped under one Junior School path."],
  ["Senior pathway filter", "Filter Grade 10, 11 and 12 subject starters by STEM, Social Sciences, or Arts and Sports Science."],
  ["Secondary verification", "Every secondary starter design carries a confidence label, source link and teacher verification reminder."],
  ["Mixed-grade secondary papers", "Build cumulative Junior or Senior papers from the exact source grades and topics already taught."],
  ["Secondary library folders", "Find resources by school level, band, grade, subject, term, year and resource type."],
  ["Write without a scheme", "Create notes, a lesson plan or revision paper directly from selected topics; no parent scheme is required."],
  ["Choose question formats", "Select several question styles, count and difficulty, with answers and marking guidance."],
  ["Three or more outcomes", "Each scheme lesson row has at least three specific outcomes. Add competencies, values and PCIs only when you choose."],
  ["Safer admin access", "The first administrator is set up once with a private server secret; no shared starter PIN is bundled."],
];

const GREETINGS = [
  "Karibu. The staffroom table can be ready before the meeting starts.",
  "Good to see you. Name the grade and the strand. The weeks will follow.",
  "A new term starts with a clear scheme. Start with one sub-strand.",
  "Five lessons a week means five rows. The strand stays on every row.",
  "Bring the book you use. Champions, KLB, Oxford, or one you type yourself.",
  "Notes and revision are written in full, unless you ask for a short summary.",
  "One till payment opens the PDF and the Word file for that set.",
  "The head of department can sign under the table. Leave the reflection blank until you teach.",
];

function NairobiNow() {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [line, setLine] = useState(0);
  useEffect(() => {
    setLine(Math.floor(Math.random() * GREETINGS.length));
    setReady(true);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const greet = window.setInterval(() => {
      setLine((current) => (current + 1) % GREETINGS.length);
    }, 8000);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(greet);
    };
  }, []);
  if (!ready) {
    return (
      <div className="mt-4 max-w-2xl rounded-xl border border-line bg-card px-4 py-3">
        <p className="text-sm font-semibold text-leaf">Nairobi</p>
        <p className="font-display text-2xl text-ink">Today</p>
        <p className="mt-2 text-ink/80">{GREETINGS[0]}</p>
      </div>
    );
  }
  const day = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", weekday: "long" }).format(now);
  const date = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("en-KE", { timeZone: "Africa/Nairobi", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(now);
  return (
    <div className="mt-4 max-w-2xl rounded-xl border border-line bg-card px-4 py-3">
      <p className="text-sm font-semibold text-leaf">{day}</p>
      <p className="font-display text-2xl text-ink">{date}</p>
      <p className="text-lg">{time} · Nairobi</p>
      <p className="mt-2 text-ink/80">{GREETINGS[line]}</p>
    </div>
  );
}

function Home() {
  const [settings, setSettings] = useState<PublicSettings>(FALLBACK);
  useEffect(() => {
    getPublicDesk().then(setSettings).catch(() => setSettings(FALLBACK));
  }, []);
  const chat = waLink(settings.whatsapp, "Hello IAN TECH, I need help with CBE schemes.");

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <p className="font-display text-xl text-ink">
            IANTECH <span className="text-leaf">SCHEMES</span>
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a className={buttonClass("ghost")} href={chat} target="_blank" rel="noreferrer">
              <MessagesSquare className="size-4" aria-hidden="true" />
              WhatsApp
            </a>
            <DeskLink />
            <Link to="/studio" className={buttonClass("ghost")}>Teacher studio</Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <p className="text-sm font-semibold tracking-wide text-leaf">Kenya CBE · Primary · Junior · Senior</p>
        <h1 className="mt-2 max-w-3xl font-display text-4xl leading-tight text-ink sm:text-6xl">
          The scheme is written before the staff meeting.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink/80">
          You enter the learning area, the strand, the sub-strand, and where to start and stop.
          The desk writes the weeks, then a lesson plan, learner notes and revision questions.
        </p>
        <NairobiNow />
        <p className="mt-4 max-w-2xl text-lg text-ink/80">{settings.welcome}</p>

        <section id="sign-in" className="mt-6 rounded-xl border border-line bg-ink p-5 text-paper">
          <p className="text-sm font-semibold tracking-wide text-gold">After the welcome</p>
          <h2 className="mt-1 font-display text-3xl">Sign in to open the materials</h2>
          <p className="mt-2 max-w-2xl text-sm text-paper/80">
            The welcome page is for everyone. After signing in, a teacher can write schemes or create notes, lesson plans and revision papers directly from selected topics without first generating a scheme.
          </p>
          <div className="mt-4">
            <DeskLink large />
          </div>
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Level title="Primary" text="Grades 1 to 6. Foundations, local materials, short clear outcomes." />
          <Level title="Junior school" text="Grades 7 to 9. Inquiry, PCIs, and community service learning." />
          <Level title="Senior school" text="Grades 10 to 12. Pathways, deeper content, exam-style revision." />
        </div>

        <section className="mt-10 overflow-hidden rounded-xl border border-line bg-card">
          <div className="bg-[#163254] px-4 py-3 text-[#f4efe4]">
            <p className="text-sm font-semibold">SCHEME OF WORK – CREATIVE ARTS GRADE 7 | TERM 3 | CHAMPIONS CREATIVE ARTS</p>
            <p className="mt-1 text-xs">School: Mukuyu JSS · Teacher: — · Year: 2026 · Term 3 (9 Weeks)</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#163254] text-[#f4efe4]">
                  {["WK", "LSN", "STRAND", "SUB-STRAND", "SPECIFIC LEARNING OUTCOMES", "KEY INQUIRY QUESTIONS", "LEARNING RESOURCES"].map((head) => (
                    <th key={head} className="border border-[#0f2340] px-2 py-2">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="align-top">
                  <td className="border border-line px-2 py-2">1</td>
                  <td className="border border-line px-2 py-2">1</td>
                  <td className="border border-line px-2 py-2">2.0 Creating and Performing</td>
                  <td className="border border-line px-2 py-2">2.7 Storytelling and Animation – Features of a narrative</td>
                  <td className="border border-line px-2 py-2">By the end of the lesson, the learner should be able to identify features of a narrative.</td>
                  <td className="border border-line px-2 py-2">What are the features of a good narrative?</td>
                  <td className="border border-line px-2 py-2">Champions Creative Arts G7 L.B. pg 91</td>
                </tr>
                <tr className="align-top bg-paper">
                  <td className="border border-line px-2 py-2">1</td>
                  <td className="border border-line px-2 py-2">2</td>
                  <td className="border border-line px-2 py-2">2.0 Creating and Performing</td>
                  <td className="border border-line px-2 py-2">2.7 Storytelling techniques</td>
                  <td className="border border-line px-2 py-2">By the end of the lesson, the learner should be able to identify storytelling techniques.</td>
                  <td className="border border-line px-2 py-2">Which techniques make storytelling engaging?</td>
                  <td className="border border-line px-2 py-2">Champions Creative Arts G7 L.B. pg 91–99</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-ink/60">Sample of the default table. A real scheme lists every lesson in the week.</p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-3xl">How a teacher uses it</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-4">
            <Step n="1" title="Open an account" text="Name, school, email and phone. Google or X also work." />
            <Step n="2" title="Name the slice" text="Subject, strand, sub-strand, term, year, start and end." />
            <Step n="3" title="Read it on the desk" text="The weeks appear in the CBE shape. Pay only when you download." />
            <Step n="4" title="Keep the files" text="PDF, Word, or both. Lesson, notes and revision share one payment." />
          </ol>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-2">
          <article className="rounded-xl border border-line bg-card p-4">
            <Wallet className="size-5 text-leaf" aria-hidden="true" />
            <h2 className="mt-2 font-display text-2xl">Pay the till, then download</h2>
            <p className="mt-2 text-sm text-ink/80">
              {settings.freeForAll
                ? "Downloads are free for every teacher right now."
                : `The baseline download price is KES ${settings.priceKes}${settings.tillNumber ? ` to till ${settings.tillNumber}` : ""}; a grade/learning-area rule may change the amount. Check the saved set for its final price. One confirmed payment unlocks that set and its related files.`}
            </p>
          </article>
          <article className="rounded-xl border border-line bg-card p-4">
            <ShieldCheck className="size-5 text-leaf" aria-hidden="true" />
            <h2 className="mt-2 font-display text-2xl">The admin desk</h2>
            <p className="mt-2 text-sm text-ink/80">
              {settings.contactName || IAN_NAME} sets the price, the till, the welcome note, and who never pays:
              every teacher, one teacher, or one school.
            </p>
          </article>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-3xl">New on the desk</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {MORE.map(([title, text]) => (
              <li key={title} className="rounded-xl border border-line bg-card px-4 py-3">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-ink/75">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-3xl">What the desk already does</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(([title, text]) => (
              <li key={title} className="rounded-xl border border-line bg-card px-4 py-3">
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-ink/75">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <IconRow icon={<BookOpen className="size-5" />} title="Schemes" text="Spread from your start point to your end point." />
          <IconRow icon={<ClipboardCheck className="size-5" />} title="Lessons" text="Timed steps a teacher can follow with a watch." />
          <IconRow icon={<FileText className="size-5" />} title="Notes and papers" text="Something learners can read, then something they can answer." />
          <IconRow icon={<Download className="size-5" />} title="Files" text="PDF, Word, or a zip of both." />
          <IconRow icon={<Library className="size-5" />} title="Saved" text="Come back next week. The scheme is still there." />
          <IconRow icon={<School className="size-5" />} title="Your school" text="The cover carries the school, class and your phone." />
        </section>
      </main>

      <footer className="border-t border-line bg-ink text-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-6 text-sm">
          <GraduationCap className="size-5 text-gold" aria-hidden="true" />
          <p>
            {IAN_NAME} · <a className="underline" href={`tel:${IAN_PHONE_TEL}`}>{IAN_PHONE_DISPLAY}</a>
          </p>
          <a className="underline" href={chat} target="_blank" rel="noreferrer">
            WhatsApp {settings.contactName || IAN_NAME}
          </a>
          <p className="text-paper/70">Nairobi · School documents, not KICD-issued papers.</p>
        </div>
      </footer>
    </div>
  );
}

function DeskLink({ large = false }: { large?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div className={`animate-pulse rounded-xl bg-ink/10 ${large ? "h-12 w-56" : "h-11 w-28"}`} />;
  if (user) {
    return (
      <Link to="/desk" className={buttonClass("leaf")}>
        Open my desk
      </Link>
    );
  }
  return (
    <Link to="/login" className={buttonClass("leaf")}>
      {large ? "Sign in and open the desk" : "Sign in"}
    </Link>
  );
}

function Level({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-xl border border-line bg-card p-4">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-1 text-sm text-ink/75">{text}</p>
    </article>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <li className="rounded-xl bg-ink p-4 text-paper">
      <p className="font-display text-3xl text-gold">{n}</p>
      <p className="mt-1 font-semibold">{title}</p>
      <p className="text-sm text-paper/80">{text}</p>
    </li>
  );
}

function IconRow({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="flex gap-3 rounded-xl border border-line bg-card p-4">
      <span className="text-leaf">{icon}</span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-ink/75">{text}</p>
      </div>
    </article>
  );
}
