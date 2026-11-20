import { useMemo, useState } from "react";
import { buttonClass, fieldClass, Panel } from "@/components/bits";
import { topicCatalogFor, topicCatalogSource, type TopicCatalogItem } from "@/lib/curriculum-content";
import { bandBadge } from "@/lib/curriculum";
import type { TopicSelection } from "@/lib/cbe-types";

/**
 * The topic picker for a scheme, a lesson pack or a paper.
 *
 * Everything it lists comes from `topicCatalogFor`, which for Primary now reads
 * the transcribed KICD curriculum design for that exact grade and band. The
 * provenance line under the heading tells the teacher whether they are looking
 * at a published design, a design that still needs checking, or the app's own
 * editable starter — so nobody mistakes a starter list for an official one.
 */
export function TopicSelector({
  subject,
  grade,
  term,
  value,
  onChange,
}: {
  subject: string;
  grade: string;
  term: string;
  value: TopicSelection[];
  onChange: (next: TopicSelection[]) => void;
}) {
  const catalog = useMemo(() => topicCatalogFor(subject, grade, term), [subject, grade, term]);
  const source = useMemo(() => topicCatalogSource(subject, grade), [subject, grade]);
  const [filter, setFilter] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [customStrand, setCustomStrand] = useState("");
  const [customSubtopic, setCustomSubtopic] = useState<Record<string, string>>({});

  const customEntries: TopicCatalogItem[] = value
    .filter((selected) => !catalog.some((item) => item.topic === selected.topic && item.strand === selected.strand))
    .map((selected) => ({
      strand: selected.strand,
      topic: selected.topic,
      pagesFrom: selected.pagesFrom,
      pagesTo: selected.pagesTo,
      subtopics: selected.subtopics,
    }));

  const needle = filter.trim().toLowerCase();
  const items = useMemo(() => {
    const all = [...catalog, ...customEntries];
    if (!needle) return all;
    return all.filter((item) =>
      `${item.topic} ${item.strand} ${item.subtopics.map((child) => child.title).join(" ")}`.toLowerCase().includes(needle),
    );
  }, [catalog, customEntries, needle]);

  /** Grouped by strand so a long design reads as units, not one flat list. */
  const groups = useMemo(() => {
    const map = new Map<string, TopicCatalogItem[]>();
    for (const item of items) {
      const key = item.strand || subject;
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()];
  }, [items, subject]);

  function selectedEntry(item: TopicCatalogItem): TopicSelection | undefined {
    return value.find((entry) => entry.topic === item.topic && entry.strand === item.strand);
  }

  function toggleTopic(item: TopicCatalogItem) {
    const existing = selectedEntry(item);
    if (existing) {
      onChange(value.filter((entry) => !(entry.topic === item.topic && entry.strand === item.strand)));
      return;
    }
    onChange([...value, {
      strand: item.strand,
      topic: item.topic,
      pagesFrom: item.pagesFrom,
      pagesTo: item.pagesTo,
      subtopics: item.subtopics.map((child) => ({ ...child })),
    }]);
  }

  function toggleSubtopic(item: TopicCatalogItem, title: string) {
    const selected = selectedEntry(item);
    if (!selected) return;
    const option = item.subtopics.find((candidate) => candidate.title === title) ?? { title, pagesFrom: "", pagesTo: "" };
    const exists = selected.subtopics.some((candidate) => candidate.title === title);
    const nextChildren = exists
      ? selected.subtopics.filter((candidate) => candidate.title !== title)
      : [...selected.subtopics, { ...option }];
    onChange(value.map((entry) => entry.topic === item.topic && entry.strand === item.strand
      ? { ...entry, subtopics: nextChildren }
      : entry));
  }

  /** Tick every topic in one strand — how a teacher picks a whole unit. */
  function toggleGroup(groupItems: TopicCatalogItem[]) {
    const fullyPicked = groupItems.every((item) => {
      const selected = selectedEntry(item);
      return selected && item.subtopics.every((child) => selected.subtopics.some((picked) => picked.title === child.title));
    });
    if (fullyPicked) {
      const keys = new Set(groupItems.map((item) => `${item.strand}|${item.topic}`));
      onChange(value.filter((entry) => !keys.has(`${entry.strand}|${entry.topic}`)));
      return;
    }
    const next = value.filter((entry) => !groupItems.some((item) => item.topic === entry.topic && item.strand === entry.strand));
    onChange([...next, ...groupItems.map((item) => ({
      strand: item.strand,
      topic: item.topic,
      pagesFrom: item.pagesFrom,
      pagesTo: item.pagesTo,
      subtopics: item.subtopics.map((child) => ({ ...child })),
    }))]);
  }

  function updatePages(item: TopicCatalogItem, key: "pagesFrom" | "pagesTo", next: string) {
    onChange(value.map((entry) => entry.topic === item.topic && entry.strand === item.strand
      ? { ...entry, [key]: next.replace(/\D/g, "").slice(0, 5) }
      : entry));
  }

  function addTopic() {
    const topic = customTopic.trim().slice(0, 100);
    if (!topic || value.some((entry) => entry.topic.toLowerCase() === topic.toLowerCase())) return;
    onChange([...value, { strand: customStrand.trim().slice(0, 100) || subject, topic, pagesFrom: "", pagesTo: "", subtopics: [] }]);
    setCustomTopic("");
  }

  function addSubtopic(item: TopicCatalogItem) {
    const text = (customSubtopic[item.topic] ?? "").trim().slice(0, 100);
    if (!text) return;
    const selected = selectedEntry(item);
    if (!selected) {
      onChange([...value, { strand: item.strand, topic: item.topic, pagesFrom: item.pagesFrom, pagesTo: item.pagesTo, subtopics: [{ title: text, pagesFrom: "", pagesTo: "" }] }]);
    } else if (!selected.subtopics.some((child) => child.title.toLowerCase() === text.toLowerCase())) {
      onChange(value.map((entry) => entry.topic === item.topic && entry.strand === item.strand
        ? { ...entry, subtopics: [...entry.subtopics, { title: text, pagesFrom: "", pagesTo: "" }] }
        : entry));
    }
    setCustomSubtopic((current) => ({ ...current, [item.topic]: "" }));
  }

  const selectedCount = value.reduce((count, topic) => count + Math.max(1, topic.subtopics.length), 0);
  const confidence = source?.confidence;
  const badge = confidence === "high"
    ? "From the published KICD design"
    : confidence === "medium"
      ? "Transcribed — check before use"
      : confidence === "low"
        ? "Editable starter for this area"
        : "Editable starter list";

  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Choose topics and subtopics</h2>
        <span className="rounded-full bg-leaf/10 px-3 py-1 text-xs font-semibold text-leaf">{value.length} topics · {selectedCount} lesson focuses</span>
      </div>
      <p className="text-sm text-ink/75">
        Tap a strand name to select every topic and sub-strand under it. Tick one topic and its sub-strands come with it. The scheme then teaches that strand to the end before the next strand. Untick any sub-strand you do not need.
      </p>

      <div className="rounded-xl border border-line bg-paper px-3 py-2 text-xs">
        <span className="font-semibold text-ink">{subject}{grade ? ` · ${grade}` : ""}{bandBadge(grade) ? ` · ${bandBadge(grade)}` : ""}</span>
        <span className="ml-2 rounded-full border border-line bg-card px-2 py-0.5 font-semibold">{badge}</span>
        {source?.lessonsPerWeek ? <span className="ml-2 text-ink/70">{source.lessonsPerWeek}</span> : null}
        {source?.designTitle && source.designTitle !== subject ? <span className="ml-2 text-ink/70">Design name: {source.designTitle}</span> : null}
        {source?.note ? <p className="mt-1 text-ink/70">{source.note}</p> : null}
        {source?.themes.length ? (
          <p className="mt-1 text-ink/70">This area is organised by theme, so the themes below are the topics and the skill strands are the lesson focuses.</p>
        ) : null}
        {source?.sources?.length ? (
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {source.sources.slice(0, 3).map((link) => (
              <a key={link} className="text-leaf underline" href={link} target="_blank" rel="noreferrer">
                {link.includes("kicd.ac.ke") ? "KICD source" : "Transcribed from"}
              </a>
            ))}
          </span>
        ) : null}
      </div>

      {catalog.length > 6 ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${fieldClass} max-w-sm`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search topics and subtopics"
            aria-label="Search topics in this learning area"
          />
          {needle ? <button type="button" className={buttonClass("ghost")} onClick={() => setFilter("")}>Clear search</button> : null}
          {value.length ? <button type="button" className={buttonClass("ghost")} onClick={() => onChange([])}>Clear {value.length} picked</button> : null}
        </div>
      ) : null}

      {items.length ? (
        <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
          {groups.map(([strandName, groupItems]) => (
            <div key={strandName} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="text-left text-sm font-semibold text-ink/80 underline-offset-2 hover:underline" onClick={() => toggleGroup(groupItems)}>{strandName}</button>
                <button type="button" className={buttonClass("ghost")} onClick={() => toggleGroup(groupItems)}>
                  {groupItems.every((item) => selectedEntry(item) && item.subtopics.every((child) => selectedEntry(item)?.subtopics.some((picked) => picked.title === child.title))) ? "Clear strand" : "Select whole strand"}
                </button>
              </div>
              {groupItems.map((item) => {
                const selected = selectedEntry(item);
                return (
                  <fieldset key={`${item.strand}-${item.topic}`} className="rounded-xl border border-line bg-card p-3">
                    <label className="flex min-h-10 items-start gap-2 font-semibold">
                      <input type="checkbox" className="mt-1" checked={!!selected} onChange={() => toggleTopic(item)} />
                      <span>{item.topic}<span className="ml-2 text-xs font-normal text-ink/60">{item.strand}</span></span>
                    </label>
                    {selected ? (
                      <>
                        <div className="ml-6 grid gap-1 sm:grid-cols-2">
                          {item.subtopics.map((child) => (
                            <label key={child.title} className="flex min-h-9 items-start gap-2 text-sm">
                              <input type="checkbox" className="mt-1" checked={selected.subtopics.some((entry) => entry.title === child.title)} onChange={() => toggleSubtopic(item, child.title)} />
                              <span>{child.title}{child.pagesFrom ? <span className="ml-1 text-xs text-ink/60">· pp. {child.pagesFrom}–{child.pagesTo || child.pagesFrom}</span> : null}</span>
                            </label>
                          ))}
                        </div>
                        <div className="ml-6 mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
                          <label className="text-xs font-semibold">Topic page start<input className={`${fieldClass} mt-1`} inputMode="numeric" value={selected.pagesFrom} onChange={(event) => updatePages(item, "pagesFrom", event.target.value)} placeholder="e.g. 106" /></label>
                          <label className="text-xs font-semibold">Topic page end<input className={`${fieldClass} mt-1`} inputMode="numeric" value={selected.pagesTo} onChange={(event) => updatePages(item, "pagesTo", event.target.value)} placeholder="e.g. 122" /></label>
                          <div className="flex items-end gap-1"><input className={fieldClass} value={customSubtopic[item.topic] ?? ""} onChange={(event) => setCustomSubtopic((current) => ({ ...current, [item.topic]: event.target.value }))} placeholder="Missing subtopic" /><button className={buttonClass("ghost")} type="button" onClick={() => addSubtopic(item)}>Add</button></div>
                        </div>
                      </>
                    ) : null}
                  </fieldset>
                );
              })}
            </div>
          ))}
        </div>
      ) : <p className="rounded-xl bg-paper p-3 text-sm">{needle ? `Nothing in ${subject} matches “${needle}”. Clear the search to see the full design.` : `No topic list for ${subject} at ${grade || "this grade"} yet. Add the topics your class is studying below.`}</p>}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className={fieldClass} value={customTopic} onChange={(event) => setCustomTopic(event.target.value)} placeholder="Add a missing topic" />
        <input className={fieldClass} value={customStrand} onChange={(event) => setCustomStrand(event.target.value)} placeholder="Strand / unit (optional)" />
        <button type="button" className={buttonClass("ink")} onClick={addTopic}>Add topic</button>
      </div>
      {value.length ? <p className="text-xs text-ink/60">{value.map((topic) => `${topic.topic}: ${topic.subtopics.length ? topic.subtopics.map((child) => child.title).join(", ") : "topic overview"}`).join(" · ")}</p> : null}
    </Panel>
  );
}
