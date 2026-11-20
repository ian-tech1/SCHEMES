import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, Folder, Grid2X2, List, Search, Star, Trash2, X } from "lucide-react";
import { buttonClass, fieldClass, Panel } from "@/components/bits";
import {
  deleteDocument,
  duplicateDocument,
  getDocument,
  getProgressSummary,
  listDocuments,
  listSavedFilters,
  removeSavedFilter,
  saveSavedFilter,
  setFavorite,
} from "@/lib/cbe.functions";
import type { DocKind, DocMeta, ProgressSummary, SavedFilter } from "@/lib/cbe-types";
import { ALL_BANDS, LEVELS, TERMS, bandOf, gradesFor, subjectsFor } from "@/lib/curriculum";
import { downloadPack, toExportDoc, type PackFormat } from "@/lib/export-docs";

export const Route = createFileRoute("/library/")({ component: LibraryBody });

type ViewMode = "folders" | "list" | "grid";
type Sort = "newest" | "title" | "subject" | "grade" | "term";
type LevelFilter = "all" | string;
type BandFilter = "all" | string;
type RecentItem = { id: number; title: string; kind: string };

type Group = { key: string; level: string; band: string; grade: string; subject: string; docs: DocMeta[] };

const KINDS: { id: "all" | DocKind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "scheme", label: "Schemes" },
  { id: "lesson", label: "Lesson plans" },
  { id: "notes", label: "Notes" },
  { id: "revision", label: "Revision" },
  { id: "exam", label: "Exam papers" },
];
const KIND_LABEL: Record<string, string> = { scheme: "Scheme", lesson: "Lesson plan", notes: "Notes", revision: "Revision", exam: "Exam paper" };
const KIND_STYLE: Record<string, string> = { scheme: "bg-leaf text-paper", lesson: "bg-gold text-ink", notes: "border border-line text-ink", revision: "bg-clay text-paper", exam: "border border-clay text-clay" };
const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Recently added" },
  { id: "title", label: "Title A–Z" },
  { id: "subject", label: "Learning area" },
  { id: "grade", label: "Grade" },
  { id: "term", label: "Term/year" },
];

function createdAtValue(doc: DocMeta): number {
  const parsed = Date.parse(doc.createdAt.replace(" ", "T"));
  return Number.isNaN(parsed) ? 0 : parsed;
}
function labelForLevel(id: string) { return LEVELS.find((level) => level.id === id)?.label ?? id; }
function bandLabel(doc: DocMeta) { return bandOf(doc.grade)?.label ?? "Uncategorised"; }
function dateLabel(value: string) {
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function latestDoc(docs: DocMeta[]) { return [...docs].sort((a, b) => createdAtValue(b) - createdAtValue(a))[0]; }

function LibraryBody() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [progress, setProgress] = useState<Record<number, ProgressSummary>>({});
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | DocKind>("all");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [band, setBand] = useState<BandFilter>("all");
  const [grade, setGrade] = useState("all");
  const [subject, setSubject] = useState("all");
  const [term, setTerm] = useState("all");
  const [year, setYear] = useState("all");
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [onlyLocked, setOnlyLocked] = useState(false);
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [ascending, setAscending] = useState(false);
  const [view, setView] = useState<ViewMode>(() => (typeof window === "undefined" ? "folders" : (localStorage.getItem("ian-library-view") as ViewMode) || "folders"));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState<{ ids: number[]; label: string } | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [packOpen, setPackOpen] = useState(false);
  const [packTerm, setPackTerm] = useState("Term 1");
  const [packYear, setPackYear] = useState(new Date().getFullYear());
  const [packFormat, setPackFormat] = useState<PackFormat>("pdf");
  const [packing, setPacking] = useState("");
  const [mobileFilters, setMobileFilters] = useState(false);

  useEffect(() => {
    listDocuments().then((next) => {
      setDocs(next);
      const latest = latestDoc(next);
      if (latest) { setPackTerm(latest.term); setPackYear(latest.year); }
    }).catch(() => setDocs([]));
    getProgressSummary().then((rows) => setProgress(Object.fromEntries(rows.map((row) => [row.documentId, row])))).catch(() => setProgress({}));
    listSavedFilters().then(setSaved).catch(() => setSaved([]));
    try { setRecent(JSON.parse(localStorage.getItem("ian-library-recent") || "[]")); } catch { setRecent([]); }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === "Escape") { setQuery(""); searchRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const levels = useMemo(() => [...new Set((docs ?? []).map((doc) => doc.level).filter(Boolean))], [docs]);
  const grades = useMemo(() => (level === "all" ? [...new Set((docs ?? []).map((doc) => doc.grade).filter(Boolean))] : gradesFor(level, band === "all" ? undefined : band)), [band, docs, level]);
  const subjects = useMemo(() => {
    const curriculum = level === "all" ? [...new Set((docs ?? []).map((doc) => doc.subject).filter(Boolean))] : subjectsFor(level, grade === "all" ? "" : grade);
    return [...new Set(curriculum)];
  }, [docs, grade, level]);
  const years = useMemo(() => [...new Set((docs ?? []).map((doc) => doc.year))].sort((a, b) => b - a), [docs]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = (docs ?? []).filter((doc) => {
      if (kind !== "all" && doc.kind !== kind) return false;
      if (level !== "all" && doc.level !== level) return false;
      if (band !== "all" && bandLabel(doc) !== (ALL_BANDS.find((item) => item.id === band)?.label ?? band)) return false;
      if (grade !== "all" && doc.grade !== grade) return false;
      if (subject !== "all" && doc.subject !== subject) return false;
      if (term !== "all" && doc.term !== term) return false;
      if (year !== "all" && String(doc.year) !== year) return false;
      if (onlyFavorite && !doc.favorite) return false;
      if (onlyLocked && doc.unlocked) return false;
      if (onlyUnlocked && !doc.unlocked) return false;
      if (!needle) return true;
      return `${doc.title} ${doc.subject} ${doc.strand} ${doc.substrand} ${doc.term} ${doc.grade}`.toLowerCase().includes(needle);
    });
    rows.sort((a, b) => {
      const sign = ascending ? 1 : -1;
      if (sort === "title") return sign * a.title.localeCompare(b.title);
      if (sort === "subject") return sign * a.subject.localeCompare(b.subject) || createdAtValue(b) - createdAtValue(a);
      if (sort === "grade") return sign * a.grade.localeCompare(b.grade, undefined, { numeric: true }) || a.subject.localeCompare(b.subject);
      if (sort === "term") return sign * (`${a.year}-${a.term}`).localeCompare(`${b.year}-${b.term}`);
      return sign * (createdAtValue(a) - createdAtValue(b));
    });
    return rows;
  }, [ascending, band, docs, grade, kind, level, onlyFavorite, onlyLocked, onlyUnlocked, query, sort, subject, term, year]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const doc of filtered) {
      const key = `${doc.level}|${bandLabel(doc)}|${doc.grade}|${doc.subject}`;
      const existing = map.get(key) ?? { key, level: doc.level, band: bandLabel(doc), grade: doc.grade, subject: doc.subject, docs: [] };
      existing.docs.push(doc); map.set(key, existing);
    }
    return [...map.values()];
  }, [filtered]);
  useEffect(() => {
    if (!groups.length || expanded.size) return;
    setExpanded(new Set([groups.find((group) => group.docs.some((doc) => doc.id === latestDoc(filtered)?.id))?.key ?? groups[0].key]));
  }, [expanded.size, filtered, groups]);
  useEffect(() => { localStorage.setItem("ian-library-view", view); }, [view]);

  const clearFilters = () => { setQuery(""); setKind("all"); setLevel("all"); setBand("all"); setGrade("all"); setSubject("all"); setTerm("all"); setYear("all"); setOnlyFavorite(false); setOnlyLocked(false); setOnlyUnlocked(false); };
  const activeChips = [
    query && ["Search", query, () => setQuery("")], kind !== "all" && ["Kind", KIND_LABEL[kind], () => setKind("all")], level !== "all" && ["Level", labelForLevel(level), () => setLevel("all")], band !== "all" && ["Band", band, () => setBand("all")], grade !== "all" && ["Grade", grade, () => setGrade("all")], subject !== "all" && ["Area", subject, () => setSubject("all")], term !== "all" && ["Term", term, () => setTerm("all")], year !== "all" && ["Year", year, () => setYear("all")], onlyFavorite && ["View", "Only favourites", () => setOnlyFavorite(false)], onlyLocked && ["View", "Only needing payment", () => setOnlyLocked(false)], onlyUnlocked && ["View", "Only unlocked", () => setOnlyUnlocked(false)],
  ].filter(Boolean) as [string, string, () => void][];

  function recordOpen(doc: DocMeta) {
    const next = [{ id: doc.id, title: doc.title, kind: doc.kind }, ...recent.filter((item) => item.id !== doc.id)].slice(0, 6);
    setRecent(next); localStorage.setItem("ian-library-recent", JSON.stringify(next));
  }
  async function toggleStar(doc: DocMeta) {
    try { await setFavorite({ data: { id: doc.id, favorite: !doc.favorite } }); setDocs((items) => items?.map((item) => item.id === doc.id ? { ...item, favorite: !doc.favorite } : item) ?? null); } catch { toast.error("That favourite could not be changed."); }
  }
  async function removeIds(ids: number[]) {
    try { for (const id of ids) await deleteDocument({ data: id }); setDocs((items) => items?.filter((item) => !ids.includes(item.id)) ?? null); setSelected(new Set()); toast.success(`${ids.length} file${ids.length === 1 ? "" : "s"} deleted.`); } catch { toast.error("Some files could not be deleted."); } finally { setConfirming(null); }
  }
  async function downloadTermPack() {
    const ready = (docs ?? []).filter((doc) => doc.term === packTerm && doc.year === packYear && doc.unlocked);
    if (!ready.length) { toast.error("Nothing unlocked in that term yet. Pay for the files first."); return; }
    setPacking(`0 / ${ready.length}`);
    try { const loaded = []; for (const meta of ready) { const result = await getDocument({ data: meta.id }); if (result.ok) loaded.push(toExportDoc(result.doc)); } if (!loaded.length) throw new Error("Those files could not be opened."); await downloadPack(loaded, packFormat, `${packTerm}-${packYear}-IAN-TECH`, (done, total) => setPacking(`${done} / ${total}`)); toast.success(`${loaded.length} file(s) zipped for ${packTerm} ${packYear}.`); } catch (err) { toast.error(err instanceof Error ? err.message : "The pack could not be built."); } setPacking("");
  }
  async function saveSearch() {
    const label = window.prompt("Give this search a short name");
    if (!label?.trim()) return;
    try { const created = await saveSavedFilter({ data: { label: label.trim(), level: level === "all" ? "" : level, grade: grade === "all" ? "" : grade, subject: subject === "all" ? "" : subject, term: term === "all" ? "" : term, year: year === "all" ? null : Number(year), kind } }); void created; await listSavedFilters().then(setSaved).catch(() => undefined); toast.success("Search saved."); } catch { toast.error("That search could not be saved."); }
  }
  function applySaved(item: SavedFilter) { setLevel(item.level || "all"); setGrade(item.grade || "all"); setSubject(item.subject || "all"); setTerm(item.term || "all"); setYear(item.year ? String(item.year) : "all"); setKind((item.kind || "all") as "all" | DocKind); }

  const row = (doc: DocMeta) => {
    const summary = progress[doc.id];
    return <li key={doc.id} className="flex min-w-0 items-stretch gap-2">
      <input type="checkbox" className="mt-4 size-5 shrink-0 accent-[var(--color-leaf)]" checked={selected.has(doc.id)} onChange={() => setSelected((old) => { const next = new Set(old); if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id); return next; })} aria-label={`Select ${doc.title}`} />
      <div className="min-w-0 flex-1 rounded-xl border border-line bg-card p-3 hover:border-leaf">
        <div className="flex flex-wrap items-start justify-between gap-2"><Link to="/library/$id" params={{ id: String(doc.id) }} onClick={() => recordOpen(doc)} className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 font-semibold text-ink"><span className={`rounded-full px-2 py-1 text-xs ${KIND_STYLE[doc.kind]}`}>{KIND_LABEL[doc.kind]}</span>{doc.title}</p><p className="mt-1 text-sm text-ink/70">{doc.grade} · {doc.subject} · {doc.term} · Weeks {doc.weekFrom}–{doc.weekTo}</p></Link><button type="button" className="grid min-h-11 min-w-11 place-items-center rounded-xl text-ink/70 hover:bg-paper" onClick={() => void toggleStar(doc)} aria-label={doc.favorite ? `Remove ${doc.title} from favourites` : `Add ${doc.title} to favourites`}><Star className={`size-5 ${doc.favorite ? "fill-gold text-gold" : ""}`} /></button></div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/70"><span>{dateLabel(doc.createdAt)}</span><span className={doc.unlocked ? "font-semibold text-leaf" : "font-semibold text-clay"}>{doc.unlocked ? "Unlocked" : "Pay to download"}</span>{summary?.total ? <span>{summary.taught} of {summary.total} taught</span> : null}<span className="ml-auto flex flex-wrap gap-1"><Link to="/library/$id" params={{ id: String(doc.id) }} onClick={() => recordOpen(doc)} className="rounded-lg px-2 py-1 font-semibold text-leaf hover:bg-paper">Open</Link><Link to="/generate" search={{ from: String(doc.id) }} className="rounded-lg px-2 py-1 font-semibold text-leaf hover:bg-paper">Duplicate / again</Link><button type="button" className="rounded-lg px-2 py-1 font-semibold text-clay hover:bg-paper" onClick={() => setConfirming({ ids: [doc.id], label: doc.title })}>Delete</button></span></div>
      </div>
    </li>;
  };

  return <div className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="font-display text-4xl" aria-level={1}>Library</h1><p className="text-ink/70">{docs === null ? "Opening your shelf…" : `${docs.length} file${docs.length === 1 ? "" : "s"} on this account. Find them by the KICD folder model.`}</p></div><button type="button" className={buttonClass("leaf")} onClick={() => setPackOpen((open) => !open)}><Download className="size-4" />Download a whole term</button></header>
    {docs?.length === 0 ? <Panel><h2 className="font-display text-2xl">Your folder shelf is ready</h2><p className="mt-2 text-ink/70">Files will sit under school level, band, grade and learning area, so you can scan a familiar KICD path across Primary, Junior and Senior School. Start with the curriculum, make a resource, record marks or plan your calendar.</p><div className="mt-4 flex flex-wrap gap-2"><a className={buttonClass("leaf")} href="/curriculum">Browse curriculum</a><Link className={buttonClass("ghost")} to="/generate" search={{ from: "" }}>Generate a scheme</Link><a className={buttonClass("ghost")} href="/marks">Marks</a><Link className={buttonClass("ghost")} to="/calendar">Calendar</Link></div></Panel> : null}
    {packOpen ? <Panel className="space-y-3"><h2 className="font-display text-2xl">Term pack</h2><p className="text-sm text-ink/70">One zip with every unlocked file for a term — sorted into folders for printing at the cyber café.</p><div className="flex flex-wrap items-end gap-2"><label className="text-sm font-semibold">Term<select className={`${fieldClass} mt-1`} value={packTerm} onChange={(event) => setPackTerm(event.target.value)}>{TERMS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-semibold">Year<input className={`${fieldClass} mt-1 max-w-28`} type="number" value={packYear} onChange={(event) => setPackYear(Number(event.target.value))} /></label><label className="text-sm font-semibold">Format<select className={`${fieldClass} mt-1`} value={packFormat} onChange={(event) => setPackFormat(event.target.value as PackFormat)}><option value="pdf">PDF</option><option value="docx">Word</option><option value="both">PDF and Word</option></select></label><button type="button" className={buttonClass("ink")} disabled={Boolean(packing)} onClick={() => void downloadTermPack()}>{packing ? `Zipping ${packing}…` : `Zip ${(docs ?? []).filter((doc) => doc.term === packTerm && doc.year === packYear).length} file(s)`}</button></div></Panel> : null}
    {recent.length ? <section aria-labelledby="recent-heading"><h2 id="recent-heading" className="font-display text-xl">Recently opened</h2><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{recent.map((item) => <Link key={item.id} to="/library/$id" params={{ id: String(item.id) }} className="min-w-44 rounded-xl border border-line bg-card p-3 hover:border-leaf" onClick={() => { const doc = docs?.find((entry) => entry.id === item.id); if (doc) recordOpen(doc); }}><span className="text-xs text-ink/70">{KIND_LABEL[item.kind] ?? item.kind}</span><span className="mt-1 block truncate font-semibold">{item.title}</span></Link>)}</div></section> : null}
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1 rounded-xl border border-line bg-card p-1" aria-label="Library view mode"><button className={`${view === "folders" ? "bg-leaf text-paper" : "text-ink"} min-h-11 rounded-xl px-3`} onClick={() => setView("folders")} aria-pressed={view === "folders"}><Folder className="inline size-4" /> Folders</button><button className={`${view === "list" ? "bg-leaf text-paper" : "text-ink"} min-h-11 rounded-xl px-3`} onClick={() => setView("list")} aria-pressed={view === "list"}><List className="inline size-4" /> List</button><button className={`${view === "grid" ? "bg-leaf text-paper" : "text-ink"} min-h-11 rounded-xl px-3`} onClick={() => setView("grid")} aria-pressed={view === "grid"}><Grid2X2 className="inline size-4" /> Grid</button></div><button type="button" className={buttonClass("ghost")} onClick={() => setMobileFilters((open) => !open)}>{mobileFilters ? "Hide filters" : "Show filters"}</button></div>
    <div className={`${mobileFilters ? "block" : "hidden md:block"}`}><Panel className="space-y-3 md:sticky md:top-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="relative sm:col-span-2"><span className="sr-only">Search the library</span><Search className="absolute left-3 top-3.5 size-5 text-ink/70" /><input ref={searchRef} className={`${fieldClass} pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, learning area, strand, term or grade" aria-label="Search the library" /><span className="absolute right-3 top-3 text-xs text-ink/60">/</span></label><select className={fieldClass} value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort">{SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button type="button" className={buttonClass("ghost")} onClick={() => setAscending((value) => !value)} aria-label="Toggle sort direction">{ascending ? "Ascending ↑" : "Descending ↓"}</button></div><div className="flex flex-wrap gap-1">{KINDS.map((item) => <button key={item.id} type="button" className={`min-h-11 rounded-full px-3 ${kind === item.id ? "bg-leaf text-paper" : "border border-line text-ink/80"}`} onClick={() => setKind(item.id)} aria-pressed={kind === item.id}>{item.label} <span className="opacity-70">{(docs ?? []).filter((doc) => item.id === "all" || doc.kind === item.id).length}</span></button>)}</div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><select className={fieldClass} value={level} onChange={(event) => { setLevel(event.target.value); setBand("all"); setGrade("all"); setSubject("all"); }} aria-label="Level"><option value="all">All levels</option>{levels.map((item) => <option key={item} value={item}>{labelForLevel(item)}</option>)}</select><select className={fieldClass} value={band} onChange={(event) => { setBand(event.target.value); setGrade("all"); }} aria-label="School band"><option value="all">All bands</option>{ALL_BANDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select className={fieldClass} value={grade} onChange={(event) => setGrade(event.target.value)} aria-label="Grade"><option value="all">All grades</option>{grades.map((item) => <option key={item}>{item}</option>)}</select><select className={fieldClass} value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Learning area"><option value="all">All learning areas</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select><select className={fieldClass} value={term} onChange={(event) => setTerm(event.target.value)} aria-label="Term"><option value="all">All terms</option>{TERMS.map((item) => <option key={item}>{item}</option>)}</select><select className={fieldClass} value={year} onChange={(event) => setYear(event.target.value)} aria-label="Year"><option value="all">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></div><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass(onlyFavorite ? "ink" : "ghost")} onClick={() => setOnlyFavorite((value) => !value)} aria-pressed={onlyFavorite}><Star className="size-4" />Only favourites</button><button type="button" className={buttonClass(onlyLocked ? "ink" : "ghost")} onClick={() => setOnlyLocked((value) => !value)} aria-pressed={onlyLocked}>Only needing payment</button><button type="button" className={buttonClass(onlyUnlocked ? "ink" : "ghost")} onClick={() => setOnlyUnlocked((value) => !value)} aria-pressed={onlyUnlocked}>Only unlocked</button><button type="button" className={buttonClass("ghost")} onClick={clearFilters}>Clear filters</button><button type="button" className={buttonClass("leaf")} onClick={() => void saveSearch()}>Save this search</button><span className="self-center text-sm text-ink/70">{filtered.length} of {(docs ?? []).length} files</span></div>{activeChips.length ? <div className="flex flex-wrap gap-1">{activeChips.map(([name, value, remove]) => <button key={`${name}-${value}`} type="button" className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-paper px-3 text-sm" onClick={remove}>{name}: {value}<X className="size-4" /></button>)}</div> : null}</Panel></div>
    {saved.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">Saved searches:</span>{saved.map((item) => <span key={item.id} className="inline-flex items-center rounded-full border border-line bg-card"><button type="button" className="min-h-11 px-3 text-sm font-semibold" onClick={() => applySaved(item)}>{item.label}</button><button type="button" className="grid min-h-11 min-w-11 place-items-center text-ink/70" onClick={() => void removeSavedFilter({ data: item.id }).then(() => setSaved((items) => items.filter((entry) => entry.id !== item.id))).catch(() => toast.error("That saved search could not be removed."))} aria-label={`Remove saved search ${item.label}`}><X className="size-4" /></button></span>)}</div> : null}
    {selected.size ? <Panel className="flex flex-wrap items-center gap-2 border-leaf"><strong>{selected.size} selected</strong><button type="button" className={buttonClass("leaf")} onClick={() => setPackOpen(true)}>Download pack</button><button type="button" className={buttonClass("ghost")} onClick={async () => { for (const id of selected) await setFavorite({ data: { id, favorite: true } }); setDocs((items) => items?.map((doc) => selected.has(doc.id) ? { ...doc, favorite: true } : doc) ?? null); setSelected(new Set()); toast.success("Selected files marked favourite."); }}>Mark favourite</button><button type="button" className={buttonClass("clay")} onClick={() => setConfirming({ ids: [...selected], label: `${selected.size} selected files` })}>Delete selected</button><button type="button" className={buttonClass("ghost")} onClick={() => setSelected(new Set())}>Clear selection</button></Panel> : null}
    {docs === null ? <div className="h-24 animate-pulse rounded-xl bg-paper" /> : null}{docs && !filtered.length ? <p className="text-sm text-ink/70">{onlyFavorite ? "No favourite files yet. Open a file and tap the star." : "Nothing matches these filters. Clear a filter or write a new resource."}</p> : null}
    {view === "folders" ? <div className="space-y-2">{groups.map((group) => { const open = expanded.has(group.key); const payment = group.docs.filter((doc) => !doc.unlocked).length; return <section key={group.key} className="rounded-xl border border-line bg-card"><button type="button" className="flex min-h-14 w-full items-center gap-2 px-4 text-left" onClick={() => setExpanded((old) => { const next = new Set(old); if (open) next.delete(group.key); else next.add(group.key); return next; })} aria-expanded={open}><span>{open ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}</span><span className="min-w-0 flex-1"><span className="block text-sm text-ink/70">{labelForLevel(group.level)}{group.band ? ` · ${group.band}` : ""} · {group.grade}</span><span className="block font-semibold">{group.subject}</span></span><span className="text-right text-sm text-ink/70">{group.docs.length} files{payment ? `, ${payment} need payment` : ""}</span></button>{open ? <ul className="space-y-2 border-t border-line p-3">{group.docs.map(row)}</ul> : null}</section>; })}</div> : <ul className={view === "grid" ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>{filtered.map(row)}</ul>}
    {view === "folders" && groups.length ? <div className="flex gap-2"><button type="button" className={buttonClass("ghost")} onClick={() => setExpanded(new Set(groups.map((group) => group.key)))}>Expand all</button><button type="button" className={buttonClass("ghost")} onClick={() => setExpanded(new Set())}>Collapse all</button></div> : null}
    {confirming ? <Panel className="border-clay"><h2 className="font-display text-2xl">Delete {confirming.label}?</h2><p className="mt-1 text-ink/70">This cannot be undone. The document will be removed from your library.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={buttonClass("clay")} onClick={() => void removeIds(confirming.ids)}><Trash2 className="size-4" />Delete</button><button type="button" className={buttonClass("ghost")} onClick={() => setConfirming(null)}>Keep it</button></div></Panel> : null}
    <p className="text-xs text-ink/60">Tip: press / to focus search. Press Esc to clear it.</p>
  </div>;
}
