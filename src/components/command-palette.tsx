import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  FileText,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Library,
  PlusCircle,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { listDocuments } from "@/lib/cbe.functions";
import type { DocMeta } from "@/lib/cbe-types";

/**
 * ⌘K / Ctrl+K quick search across the desk.
 *
 * A teacher with forty saved schemes should not have to open the library and
 * scroll. The palette searches titles, grades, learning areas, strands and terms,
 * and also jumps to the main pages.
 */
type Action = {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
};

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 20);
    if (docs) return;
    listDocuments()
      .then(setDocs)
      .catch(() => setDocs([]));
  }, [open, docs]);

  const pages = useMemo<Action[]>(
    () => [
      { id: "page-desk", label: "Open my desk", hint: "Page", icon: <LayoutDashboard className="size-4" />, run: () => void navigate({ to: "/desk" }) },
      { id: "page-new", label: "Write a new scheme", hint: "Page", icon: <PlusCircle className="size-4" />, run: () => void navigate({ to: "/generate", search: { from: "" } }) },
      { id: "page-create", label: "Create notes, lesson plan or revision paper", hint: "Page", icon: <FileText className="size-4" />, run: () => void navigate({ to: "/create" }) },
      { id: "page-curriculum", label: "Browse the KICD curriculum designs", hint: "Page", icon: <BookOpen className="size-4" />, run: () => void navigate({ to: "/curriculum" }) },
      { id: "page-papers", label: "Past papers bank", hint: "Page", icon: <FileText className="size-4" />, run: () => void navigate({ to: "/past-papers" }) },
      { id: "page-marks", label: "Marks book and item analysis", hint: "Page", icon: <LayoutDashboard className="size-4" />, run: () => void navigate({ to: "/marks" }) },
      { id: "page-library", label: "Open the library", hint: "Page", icon: <Library className="size-4" />, run: () => void navigate({ to: "/library" }) },
      { id: "page-studio", label: "Teacher studio downloads", hint: "Page", icon: <FileText className="size-4" />, run: () => void navigate({ to: "/studio" }) },
      { id: "page-variables", label: "School variables and Daraja", hint: "Page", icon: <Settings2 className="size-4" />, run: () => void navigate({ to: "/variables" }) },
      { id: "page-calendar", label: "Academic calendar", hint: "Page", icon: <CalendarDays className="size-4" />, run: () => void navigate({ to: "/calendar" }) },
      { id: "page-profile", label: "Your profile", hint: "Page", icon: <UserRound className="size-4" />, run: () => void navigate({ to: "/profile" }) },
      { id: "page-admin", label: "Admin desk", hint: "Page", icon: <ShieldCheck className="size-4" />, run: () => void navigate({ to: "/admin" }) },
      { id: "page-status", label: "Deployment status", hint: "Page", icon: <Settings2 className="size-4" />, run: () => void navigate({ to: "/status" }) },
    ],
    [navigate],
  );

  const results = useMemo<Action[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (haystack: string) => !needle || haystack.toLowerCase().includes(needle);
    const pagesHit = pages.filter((page) => matches(page.label));
    const docsHit = (docs ?? [])
      .filter((doc) =>
        matches(
          `${doc.title} ${doc.grade} ${doc.subject} ${doc.strand} ${doc.substrand} ${doc.term} ${doc.year}`,
        ),
      )
      .slice(0, 12)
      .map<Action>((doc) => ({
        id: `doc-${doc.id}`,
        label: doc.title,
        hint: `${doc.kind} · ${doc.term} ${doc.year}${doc.favorite ? " · starred" : ""}`,
        icon: doc.favorite ? <Heart className="size-4" /> : <FileText className="size-4" />,
        run: () => void navigate({ to: "/library/$id", params: { id: String(doc.id) } }),
      }));
    return [...pagesHit, ...docsHit];
  }, [docs, pages, query, navigate]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[active] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  function choose(action: Action | undefined) {
    if (!action) return;
    onOpenChange(false);
    action.run();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 px-3 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Quick search"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 shrink-0 text-ink/60" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => Math.min(results.length - 1, current + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) => Math.max(0, current - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(results[active]);
              }
            }}
            placeholder="Search a scheme, a grade, a strand, or a page…"
            className="min-h-12 w-full bg-transparent text-base outline-none placeholder:text-ink/50"
            aria-label="Search"
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-xs text-ink/60 sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {docs === null ? (
            <li className="px-3 py-2 text-sm text-ink/60">Loading your library…</li>
          ) : null}
          {results.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-4 text-sm text-ink/70">
              <GraduationCap className="size-4" aria-hidden="true" />
              Nothing matches. Try a grade, a strand or a term.
            </li>
          ) : null}
          {results.map((action, index) => (
            <li key={action.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(action)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                  index === active ? "bg-leaf text-paper" : "text-ink hover:bg-paper"
                }`}
              >
                <span className="shrink-0" aria-hidden="true">{action.icon}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{action.label}</span>
                <span className={`shrink-0 text-xs ${index === active ? "text-paper/80" : "text-ink/60"}`}>
                  {action.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-3 py-2 text-xs text-ink/60">
          ↑ ↓ to move · Enter to open · ⌘K or Ctrl+K anywhere on the desk
        </p>
      </div>
    </div>
  );
}
