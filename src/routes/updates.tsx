import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { Panel, fieldClass } from "@/components/bits";

export const Route = createFileRoute("/updates")({ component: UpdatesPage });

const UPDATES = [
  "Practice papers now have a year, from 2019 to 2026.",
  "Grade 9 Mathematics for 2025 and 2026 uses the KJSEA layout: 20 multiple choice, then 20 structured items in five tasks.",
  "Connected AI keys are tried before the site generator, including current Grok and Gemini models.",
  "Notes follow teaching-notes order: strand, sub-strand, meaning, importance, steps, worked examples, exercise.",
  "Email and password login is the confirmed path. Google and X still open the Grok account.",
  "The paper front matter now has name, school, index number, tables and a calculator line.",
  "A rejected model no longer stops the next AI key.",
  "The site generator remains the backup when every key fails.",
  "Library still has search, folders, favourites, duplicates and saved filters.",
  "Desk search is Ctrl+K or the Search button.",
];

const TERM_DATES = [
  { term: "Term 1 2026", dates: "5 January – 3 April", note: "About 13 teaching weeks before the break." },
  { term: "Term 2 2026", dates: "4 May – 7 August", note: "Confirm the county opening circular before you print." },
  { term: "Term 3 2026", dates: "31 August – 23 October", note: "KJSEA practice sits in this term for Grade 9." },
];

function bandFor(score: number) {
  if (score >= 80) return "Exceeds Expectations";
  if (score >= 60) return "Meets Expectations";
  if (score >= 40) return "Approaches Expectations";
  return "Below Expectations";
}

function UpdatesPage() {
  return <AppShell><UpdatesBody /></AppShell>;
}

function UpdatesBody() {
  const [weeks, setWeeks] = useState(12);
  const [lessons, setLessons] = useState(5);
  const [score, setScore] = useState(72);
  const [learners, setLearners] = useState(40);
  const [boys, setBoys] = useState(18);
  const slots = weeks * lessons;
  const girls = Math.max(0, learners - boys);
  const band = useMemo(() => bandFor(score), [score]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-4xl">Updates</h1>
        <p className="mt-2 max-w-3xl text-ink/75">Working changes on this site. Each item is already in the desk, not a name on a list.</p>
      </header>
      <Panel>
        <h2 className="font-display text-2xl">What is new</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {UPDATES.map((item) => <li key={item} className="rounded-lg bg-paper px-3 py-2">{item}</li>)}
        </ul>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Panel>
          <h2 className="font-display text-2xl">2026 term guide</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {TERM_DATES.map((item) => (
              <li key={item.term} className="rounded-lg bg-paper px-3 py-2">
                <p className="font-semibold">{item.term}</p>
                <p>{item.dates}</p>
                <p className="text-ink/70">{item.note}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="font-display text-2xl">Scheme week calculator</h2>
          <label className="mt-3 block text-sm font-semibold">Weeks
            <input className={`${fieldClass} mt-1`} type="number" min={1} max={20} value={weeks} onChange={(event) => setWeeks(Math.max(1, Number(event.target.value) || 1))} />
          </label>
          <label className="mt-3 block text-sm font-semibold">Lessons a week
            <input className={`${fieldClass} mt-1`} type="number" min={1} max={12} value={lessons} onChange={(event) => setLessons(Math.max(1, Number(event.target.value) || 1))} />
          </label>
          <p className="mt-3 text-sm">This scheme has <strong>{slots}</strong> lesson rows. Tick no more subtopics than that.</p>
        </Panel>
        <Panel>
          <h2 className="font-display text-2xl">CBC band</h2>
          <label className="mt-3 block text-sm font-semibold">Score out of 100
            <input className={`${fieldClass} mt-1`} type="number" min={0} max={100} value={score} onChange={(event) => setScore(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} />
          </label>
          <p className="mt-3 text-sm">School reporting band: <strong>{band}</strong>. This is not a KNEC grade.</p>
        </Panel>
        <Panel>
          <h2 className="font-display text-2xl">Class split</h2>
          <label className="mt-3 block text-sm font-semibold">Learners
            <input className={`${fieldClass} mt-1`} type="number" min={0} value={learners} onChange={(event) => setLearners(Math.max(0, Number(event.target.value) || 0))} />
          </label>
          <label className="mt-3 block text-sm font-semibold">Boys
            <input className={`${fieldClass} mt-1`} type="number" min={0} value={boys} onChange={(event) => setBoys(Math.max(0, Number(event.target.value) || 0))} />
          </label>
          <p className="mt-3 text-sm">{learners} learners · {Math.min(boys, learners)} boys · {girls} girls. Use this on the scheme cover.</p>
        </Panel>
      </div>
      <Panel className="space-y-2">
        <h2 className="font-display text-2xl">Before you print</h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            "Name, school and phone are on the profile.",
            "The strand and every sub-strand are the ones you teach.",
            "Worked examples have units and a check.",
            "The paper says it was not issued by KNEC.",
            "Marks on the parts add up to the total.",
            "You have checked the current KICD design.",
          ].map((item) => <li key={item} className="rounded-lg bg-paper px-3 py-2">{item}</li>)}
        </ul>
        <div className="flex flex-wrap gap-3 pt-2 text-sm font-semibold">
          <Link to="/generate" search={{ from: "" }} className="text-leaf underline">New scheme</Link>
          <Link to="/create" className="text-leaf underline">Notes or exam</Link>
          <Link to="/past-papers" className="text-leaf underline">Practice papers</Link>
          <Link to="/library" className="text-leaf underline">Library</Link>
        </div>
      </Panel>
    </div>
  );
}
