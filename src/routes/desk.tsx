import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, useDesk } from "@/components/shell";
import { buttonClass, Panel } from "@/components/bits";
import { getProgressSummary, listDocuments } from "@/lib/cbe.functions";
import type { DocMeta, ProgressSummary } from "@/lib/cbe-types";
import { waLink } from "@/lib/contact";
import { listCalendarEvents } from "@/lib/cbe.functions";
import type { CalendarEvent } from "@/lib/cbe-types";

export const Route = createFileRoute("/desk")({ component: DeskPage });

function DeskPage() {
  return (
    <AppShell>
      <DeskBody />
    </AppShell>
  );
}

function DeskBody() {
  const { me } = useDesk();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [calendar, setCalendar] = useState<CalendarEvent[]>([]);
  const [progress, setProgress] = useState<ProgressSummary[]>([]);
  useEffect(() => {
    listDocuments().then(setDocs).catch(() => setDocs([]));
    listCalendarEvents().then(setCalendar).catch(() => setCalendar([]));
    getProgressSummary().then(setProgress).catch(() => setProgress([]));
  }, []);
  if (!me) return null;
  const incomplete = me.profile.schoolName.length < 2 || me.profile.phone.replace(/\D/g, "").length < 9;
  const chat = waLink(me.settings.whatsapp);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-leaf">Karibu</p>
        <h1 className="font-display text-4xl leading-tight">
          {me.profile.displayName ? `${me.profile.displayName.split(" ")[0]}, your desk is ready.` : "Your desk is ready."}
        </h1>
        <p className="mt-2 max-w-2xl text-ink/80">{me.settings.welcome}</p>
      </div>

      {incomplete ? (
        <Panel>
          <p className="font-semibold">Add your school and phone</p>
          <p className="mt-1 text-sm text-ink/75">They print on every cover. You can write schemes after that.</p>
          <Link to="/profile" className={`${buttonClass("leaf")} mt-3`}>
            Complete profile
          </Link>
        </Panel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/generate" search={{ from: "" }} className="rounded-2xl border border-line bg-card p-4">
          <p className="font-display text-xl">New scheme</p>
          <p className="mt-1 text-sm text-ink/70">One strand, then its sub-strands.</p>
        </Link>
        <Link to="/create" className="rounded-2xl border border-line bg-card p-4">
          <p className="font-display text-xl">Notes or exam</p>
          <p className="mt-1 text-sm text-ink/70">Teaching notes, revision, or a paper.</p>
        </Link>
        <Link to="/past-papers" className="rounded-2xl border border-line bg-card p-4">
          <p className="font-display text-xl">Practice papers</p>
          <p className="mt-1 text-sm text-ink/70">Choose the year, including 2026.</p>
        </Link>
        <Link to="/updates" className="rounded-2xl border border-line bg-card p-4">
          <p className="font-display text-xl">Updates</p>
          <p className="mt-1 text-sm text-ink/70">Term dates, band and week tools.</p>
        </Link>
      </div>
        <Panel>
          <p className="text-sm text-ink/70">Downloads</p>
          <p className="font-display text-3xl">{me.downloadsFree ? "Free" : me.settings.priceKes === 0 ? "Free baseline" : `From KES ${me.settings.priceKes}`}</p>
          <p className="text-sm text-ink/70">
            {me.downloadsFree
              ? "Your account or school does not pay the till."
              : me.settings.tillNumber
                ? `Till ${me.settings.tillNumber} · ${me.settings.tillName}`
                : "The till is not set yet."}
          </p>
        </Panel>
        <Panel>
          <p className="text-sm text-ink/70">Writings today</p>
          <p className="font-display text-3xl">
            {me.generatedToday}
            <span className="text-lg text-ink/50"> / {me.profile.role === "teacher" ? me.dailyLimit : "∞"}</span>
          </p>
          <p className="text-sm text-ink/70">Schemes, lessons, notes and papers share this count.</p>
        </Panel>
        <Panel>
          <p className="text-sm text-ink/70">Saved files</p>
          <p className="font-display text-3xl">{docs.length}</p>
          <p className="text-sm text-ink/70">{me.profile.schoolName || "School not set yet"}</p>
          <p className="text-sm text-ink/70">{docs.filter((doc) => !doc.unlocked).length} still need payment</p>
        </Panel>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/generate" search={{ from: "" }} className={buttonClass("leaf")}>
          Write a scheme
        </Link>
        {docs[0] ? (
          <Link to="/library/$id" params={{ id: String(docs[0].id) }} className={buttonClass("ink")}>
            Continue last file
          </Link>
        ) : null}
        <Link to="/library" className={buttonClass("ghost")}>
          Open library
        </Link>
        <a className={buttonClass("ink")} href={chat} target="_blank" rel="noreferrer">
          WhatsApp {me.settings.contactName}
        </a>
      </div>

      <DeskDashboard docs={docs} progress={progress} />

      {(() => {
        const notesPacks = new Set(docs.filter((doc) => doc.kind === "notes").map((doc) => doc.packId));
        const missing = docs.filter((doc) => doc.kind === "scheme" && !notesPacks.has(doc.packId)).slice(0, 4);
        if (!missing.length) return null;
        return (
          <Panel>
            <h2 className="font-display text-2xl">Schemes with no notes yet</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {missing.map((doc) => (
                <li key={doc.id}>
                  <Link to="/library/$id" params={{ id: String(doc.id) }} className="font-semibold text-leaf">{doc.title}</Link>
                  <span className="text-ink/70"> · open it and tap Notes</span>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })()}

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-semibold text-leaf">School year</p><h2 className="font-display text-2xl">Next important dates</h2></div>
          <Link to="/calendar" className="text-sm font-semibold text-leaf">Manage calendar →</Link>
        </div>
        {calendar.filter((event) => !event.completed && event.endsOn >= new Date().toISOString().slice(0, 10)).slice(0, 3).length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {calendar.filter((event) => !event.completed && event.endsOn >= new Date().toISOString().slice(0, 10)).slice(0, 3).map((event) => (
              <li key={event.id} className="rounded-xl bg-paper px-3 py-3"><p className="font-semibold">{event.title}</p><p className="text-sm text-ink/70">{event.startsOn === event.endsOn ? event.startsOn : `${event.startsOn} – ${event.endsOn}`}</p></li>
            ))}
          </ul>
        ) : <p className="mt-2 text-sm text-ink/70">No dates added yet. Add Term 1 and the half-term break to keep the year visible.</p>}
      </Panel>

      <section>
        <h2 className="font-display text-2xl">Recent</h2>
        {docs.length === 0 ? (
          <p className="mt-2 text-sm text-ink/70">Nothing saved yet. The first scheme will sit here.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {docs.slice(0, 5).map((doc) => (
              <li key={doc.id}>
                <Link to="/library/$id" params={{ id: String(doc.id) }} className="block rounded-xl border border-line bg-card px-4 py-3 hover:border-leaf">
                  <p className="font-semibold">{doc.title}</p>
                  <p className="text-sm text-ink/70">
                    {doc.kind} · {doc.createdAt} · {doc.unlocked ? "Unlocked" : "Download locked"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  scheme: "Schemes",
  lesson: "Lesson plans",
  notes: "Notes",
  revision: "Papers",
};

/** Last eight weeks of writing, plus how much of the scheme has been taught. */
function DeskDashboard({ docs, progress }: { docs: DocMeta[]; progress: ProgressSummary[] }) {
  const weeks = useMemo(() => {
    const buckets: { label: string; files: number }[] = [];
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    for (let i = 7; i >= 0; i -= 1) {
      const start = new Date(monday);
      start.setDate(monday.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const files = docs.filter((doc) => {
        const at = Date.parse(doc.createdAt.replace(" ", "T"));
        return !Number.isNaN(at) && at >= start.getTime() && at < end.getTime();
      }).length;
      buckets.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, files });
    }
    return buckets;
  }, [docs]);

  const byKind = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const doc of docs) tally[doc.kind] = (tally[doc.kind] ?? 0) + 1;
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const taught = progress.reduce((sum, row) => sum + row.taught, 0);
  const lessons = progress.reduce((sum, row) => sum + row.total, 0);
  const percent = lessons ? Math.round((taught / lessons) * 100) : 0;
  const starred = docs.filter((doc) => doc.favorite).length;
  const thisWeek = weeks[weeks.length - 1]?.files ?? 0;

  return (
    <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-leaf">Last eight weeks</p>
            <h2 className="font-display text-2xl">Files written</h2>
          </div>
          <p className="text-sm text-ink/70">
            {thisWeek} this week · {starred} starred
          </p>
        </div>
        <div className="mt-3 h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeks} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip
                formatter={(value) => [`${value} file(s)`, "Written"]}
                labelFormatter={(label) => `Week of ${label}`}
                contentStyle={{ borderRadius: 12, border: "1px solid rgba(120,120,0,0.3)", background: "var(--color-card)", color: "var(--color-ink)" }}
              />
              <Bar dataKey="files" fill="#2f8a5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel>
        <p className="text-sm font-semibold text-leaf">Teaching tracker</p>
        <h2 className="font-display text-2xl">What you have covered</h2>
        {lessons ? (
          <>
            <p className="mt-2 font-display text-3xl">
              {taught}
              <span className="text-lg text-ink/50"> / {lessons} lessons</span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
              <div className="h-full rounded-full bg-leaf" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-sm text-ink/70">{percent}% of your schemes marked as taught. Ticks save to your account.</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-ink/70">
            Open a scheme and tick the lessons as you teach them — the count follows you to any device.
          </p>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {byKind.map(([kind, count]) => (
            <li key={kind} className="flex items-center justify-between gap-2">
              <span>{KIND_LABEL[kind] ?? kind}</span>
              <span className="font-semibold">{count}</span>
            </li>
          ))}
          {byKind.length === 0 ? <li className="text-ink/70">No files yet.</li> : null}
        </ul>
      </Panel>
    </section>
  );
}
