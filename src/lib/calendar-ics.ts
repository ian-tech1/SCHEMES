import type { CalendarEvent } from "./cbe-types";

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function toIcsDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return value.replaceAll("-", "");
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Fold a content line at the RFC 5545 75-octet limit without splitting UTF-8 characters. */
function foldLine(line: string): string {
  const chunks: string[] = [];
  let current = "";
  let octets = 0;
  for (const character of line) {
    const size = new TextEncoder().encode(character).byteLength;
    if (octets + size > 75) {
      chunks.push(current);
      current = ` ${character}`;
      octets = 1 + size;
    } else {
      current += character;
      octets += size;
    }
  }
  chunks.push(current);
  return chunks.join("\r\n");
}

function utcStamp(value: Date): string {
  if (Number.isNaN(value.valueOf())) throw new Error("Invalid calendar export timestamp.");
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Produce an RFC 5545 calendar with inclusive source end dates and exclusive DTEND. */
export function buildCalendarIcs(events: CalendarEvent[], generatedAt = new Date()): string {
  const stamp = utcStamp(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IAN TECH//Academic Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const ordered = [...events].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id - b.id);
  for (const event of ordered) {
    const start = toIcsDate(event.startsOn);
    toIcsDate(event.endsOn);
    const end = toIcsDate(nextDate(event.endsOn));
    if (event.endsOn < event.startsOn) throw new Error(`Calendar entry "${event.title}" ends before it starts.`);
    const description = [event.kind, event.completed ? "Completed" : "Upcoming", event.note]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@ian-tech-schemes`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
