import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell, useDesk } from "@/components/shell";
import { buttonClass, Field, fieldClass, Panel } from "@/components/bits";
import { deleteCalendarEvent, listCalendarEvents, saveCalendarEvent } from "@/lib/cbe.functions";
import type { CalendarEvent, CalendarEventKind } from "@/lib/cbe-types";
import { buildCalendarIcs } from "@/lib/calendar-ics";

export const Route = createFileRoute("/calendar")({ component: CalendarPage });

const KINDS: { value: CalendarEventKind; label: string }[] = [
  { value: "term", label: "Term" },
  { value: "half-term", label: "Half-term" },
  { value: "holiday", label: "Holiday" },
  { value: "staff-day", label: "Staff day" },
  { value: "exam", label: "Exam period" },
];
const EMPTY = { id: undefined as number | undefined, kind: "half-term" as CalendarEventKind, title: "", startsOn: "", endsOn: "", note: "", completed: false };

function CalendarPage() {
  return <AppShell><CalendarBody /></AppShell>;
}

function CalendarBody() {
  const { me } = useDesk();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setEvents(await listCalendarEvents());
  }
  useEffect(() => { void refresh().catch(() => setEvents([])); }, []);
  const visible = useMemo(() => events.filter((event) => event.startsOn.startsWith(String(year))), [events, year]);
  const upcoming = useMemo(() => events.filter((event) => !event.completed && event.endsOn >= new Date().toISOString().slice(0, 10)).slice(0, 3), [events]);
  if (!me) return null;

  function reset() { setForm({ ...EMPTY }); }
  function edit(event: CalendarEvent) { setForm(event); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await saveCalendarEvent({ data: form });
      if (!result.ok) toast.error(result.error);
      else { toast.success(form.id ? "Calendar entry updated." : "Calendar entry saved."); reset(); await refresh(); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the calendar entry."); }
    setBusy(false);
  }
  async function remove(id: number) {
    if (!window.confirm("Delete this calendar entry?")) return;
    await deleteCalendarEvent({ data: id });
    toast.success("Calendar entry deleted.");
    await refresh();
  }
  async function toggle(event: CalendarEvent) {
    await saveCalendarEvent({ data: { ...event, completed: !event.completed } });
    await refresh();
  }
  function exportYear() {
    if (!visible.length) {
      toast.error(`No calendar entries to export for ${year}.`);
      return;
    }
    const blob = new Blob([buildCalendarIcs(visible)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ian-tech-academic-calendar-${year}.ics`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${visible.length} calendar entry(s) exported for ${year}.`);
  }
  const years = Array.from(new Set([new Date().getFullYear(), new Date().getFullYear() + 1, ...events.map((event) => Number(event.startsOn.slice(0, 4)))] )).sort();

  return <div className="space-y-5">
    <div>
      <p className="text-sm font-semibold text-leaf">Plan the school year</p>
      <h1 className="font-display text-4xl leading-tight">Academic calendar</h1>
      <p className="mt-2 max-w-2xl text-ink/80">Add term dates, half-term breaks, holidays, staff days, and exam periods. These dates stay on your teacher account.</p>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Panel>
        <div className="flex items-center justify-between gap-3"><h2 className="font-display text-2xl">{form.id ? "Edit date" : "Add a date"}</h2>{form.id ? <button className="text-sm font-semibold text-leaf" onClick={reset}>Clear</button> : null}</div>
        <form onSubmit={submit} className="mt-4 grid gap-3">
          <Field label="Date type"><select className={fieldClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CalendarEventKind })}>{KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></Field>
          <Field label="Title" hint="Example: Term 2 or April half-term break"><input className={fieldClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="April half-term break" required /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Starts"><input className={fieldClass} type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} required /></Field><Field label="Ends"><input className={fieldClass} type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} required /></Field></div>
          <Field label="Note" hint="Optional reminder for your planning"><textarea className={`${fieldClass} min-h-20`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Share dates with the staff team…" /></Field>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.completed} onChange={(e) => setForm({ ...form, completed: e.target.checked })} /> Mark as completed</label>
          <button className={buttonClass("leaf")} disabled={busy}>{busy ? "Saving…" : form.id ? "Update calendar entry" : "Save calendar entry"}</button>
        </form>
      </Panel>
      <div className="space-y-4">
        <Panel className="bg-ink text-paper"><p className="text-sm font-semibold text-gold">Next up</p>{upcoming.length ? <div className="mt-3 space-y-3">{upcoming.map((event) => <div key={event.id}><p className="font-semibold">{event.title}</p><p className="text-sm text-paper/75">{formatRange(event.startsOn, event.endsOn)} · {kindLabel(event.kind)}</p></div>)}</div> : <p className="mt-2 text-sm text-paper/75">Add your first term or half-term to see it here.</p>}</Panel>
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-2xl">{year} dates</h2><p className="text-sm text-ink/70">{visible.length} {visible.length === 1 ? "entry" : "entries"}</p></div><div className="flex flex-wrap gap-2"><select className="rounded-xl border border-line bg-card px-3 py-2 font-semibold" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Calendar year">{years.map((item) => <option key={item}>{item}</option>)}</select><button type="button" className={buttonClass("ghost")} onClick={exportYear} disabled={!visible.length}>Export .ics</button></div></div>
          {visible.length ? <ul className="mt-4 space-y-2">{visible.map((event) => <li key={event.id} className="rounded-xl border border-line bg-paper p-3"><div className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={event.completed} onChange={() => void toggle(event)} aria-label={`Mark ${event.title} complete`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`font-semibold ${event.completed ? "line-through opacity-60" : ""}`}>{event.title}</p><span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-ink">{kindLabel(event.kind)}</span></div><p className="text-sm text-ink/70">{formatRange(event.startsOn, event.endsOn)}</p>{event.note ? <p className="mt-1 text-sm text-ink/75">{event.note}</p> : null}</div><div className="flex shrink-0 gap-2 text-sm font-semibold"><button className="text-leaf" onClick={() => edit(event)}>Edit</button><button className="text-clay" onClick={() => void remove(event.id)}>Delete</button></div></div></li>)}</ul> : <p className="mt-4 rounded-xl bg-paper p-4 text-sm text-ink/70">No dates saved for {year}. Start with the Term 1 dates, then add the half-term break beneath them.</p>}
        </Panel>
      </div>
    </div>
  </div>;
}

function kindLabel(kind: CalendarEventKind) { return KINDS.find((item) => item.value === kind)?.label ?? kind; }
function formatRange(start: string, end: string) { const fmt = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`; }
