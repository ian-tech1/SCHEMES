import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarIcs } from "./calendar-ics.ts";
import type { CalendarEvent } from "./cbe-types.ts";

const event = (partial: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 12,
  kind: "term",
  title: "Term 1",
  startsOn: "2026-01-05",
  endsOn: "2026-04-10",
  note: "Staff meeting, check; revise\\share\nSecond line",
  completed: false,
  ...partial,
});

const stamp = new Date("2026-01-01T12:34:56.000Z");

test("exports all-day dates with an exclusive end date", () => {
  const ics = buildCalendarIcs([event()], stamp);
  assert.match(ics, /DTSTART;VALUE=DATE:20260105/);
  assert.match(ics, /DTEND;VALUE=DATE:20260411/);
  assert.match(ics, /DTSTAMP:20260101T123456Z/);
});

test("escapes special text and preserves description line breaks", () => {
  const ics = buildCalendarIcs([event()], stamp).replace(/\r\n /g, "");
  assert.match(ics, /SUMMARY:Term 1/);
  assert.match(ics, /DESCRIPTION:term · Upcoming · Staff meeting\\, check\\; revise\\\\share\\nSecond line/);
});

test("sorts events and folds long UTF-8 lines at no more than 75 octets", () => {
  const ics = buildCalendarIcs([
    event({ id: 2, startsOn: "2026-02-01", endsOn: "2026-02-01", title: "Later" }),
    event({ id: 1, startsOn: "2026-01-01", endsOn: "2026-01-01", title: "A very long title — " + "📚".repeat(30) }),
  ], stamp);
  assert.ok(ics.indexOf("UID:1@ian-tech-schemes") < ics.indexOf("UID:2@ian-tech-schemes"));
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).byteLength <= 75, `oversized line: ${line}`);
  }
  assert.match(ics, /\r\n /);
});

test("rejects impossible dates and reversed event ranges", () => {
  assert.throws(() => buildCalendarIcs([event({ startsOn: "2026-02-31" })], stamp), /Invalid calendar date/);
  assert.throws(() => buildCalendarIcs([event({ startsOn: "2026-04-11", endsOn: "2026-04-10" })], stamp), /ends before it starts/);
});
