import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLessonProgress, saveLessonProgress } from "@/lib/cbe.functions";

/**
 * Teaching tracker for one document: the "taught" tick and the reflection the
 * teacher writes after the lesson.
 *
 * The rows now live on the teacher's account (`lesson_progress`), so a tick made
 * on the staffroom desktop shows up on the phone at home. localStorage stays as
 * a write-through cache: the table renders instantly, and a tick made in a
 * school with no network still survives a reload and syncs on the next visit.
 */
export type ProgressEntry = { taught: boolean; reflection: string };
export type ProgressMap = Record<string, ProgressEntry>;

export function progressKey(week: number, lesson: number): string {
  return `${week}:${lesson}`;
}

function taughtKey(documentId: number, week: number, lesson: number): string {
  return `ian-taught:${documentId}:${week}:${lesson}`;
}

function reflectKey(documentId: number, week: number, lesson: number): string {
  return `ian-reflect:${documentId}:${week}:${lesson}`;
}

function readLocal(documentId: number, cells: { week: number; lesson: number }[]): ProgressMap {
  const map: ProgressMap = {};
  for (const cell of cells) {
    const key = progressKey(cell.week, cell.lesson);
    map[key] = {
      taught: localStorage.getItem(taughtKey(documentId, cell.week, cell.lesson)) === "1",
      reflection: localStorage.getItem(reflectKey(documentId, cell.week, cell.lesson)) ?? "",
    };
  }
  return map;
}

export type LessonProgressApi = {
  /** False until the first read (local or server) has completed. */
  ready: boolean;
  /** False when the last save did not reach the server. */
  synced: boolean;
  get: (week: number, lesson: number) => ProgressEntry;
  toggle: (week: number, lesson: number) => void;
  setReflection: (week: number, lesson: number, text: string) => void;
  taughtCount: number;
};

export function useLessonProgress(
  documentId: number | undefined,
  cells: { week: number; lesson: number }[],
  enabled: boolean,
): LessonProgressApi {
  const [map, setMap] = useState<ProgressMap>({});
  const [ready, setReady] = useState(false);
  const [synced, setSynced] = useState(true);
  const timers = useRef<Record<string, number>>({});
  // The cell list is rebuilt on every render; key it so effects only re-run when
  // the shape of the table actually changes.
  const cellKey = useMemo(
    () => cells.map((cell) => `${cell.week}:${cell.lesson}`).join(","),
    [cells],
  );

  useEffect(() => {
    if (!documentId || !enabled || typeof window === "undefined") {
      setReady(false);
      return;
    }
    let gone = false;
    const local = readLocal(documentId, cells);
    setMap(local);
    setReady(true);
    getLessonProgress({ data: documentId })
      .then((rows) => {
        if (gone) return;
        setMap((current) => {
          const merged: ProgressMap = { ...current };
          for (const row of rows) {
            const key = progressKey(row.week, row.lesson);
            const localEntry = merged[key] ?? { taught: false, reflection: "" };
            merged[key] = {
              taught: row.taught || localEntry.taught,
              reflection: row.reflection || localEntry.reflection,
            };
            localStorage.setItem(taughtKey(documentId, row.week, row.lesson), merged[key].taught ? "1" : "0");
            if (merged[key].reflection) {
              localStorage.setItem(reflectKey(documentId, row.week, row.lesson), merged[key].reflection);
            }
          }
          return merged;
        });
        setSynced(true);
      })
      .catch(() => {
        // Offline or signed out of the desk: the local copy still works.
        if (!gone) setSynced(false);
      });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cellKey captures the cells
  }, [documentId, enabled, cellKey]);

  const persist = useCallback(
    (week: number, lesson: number, entry: ProgressEntry) => {
      if (!documentId) return;
      void saveLessonProgress({
        data: {
          documentId,
          week,
          lesson,
          taught: entry.taught,
          reflection: entry.reflection,
        },
      })
        .then((result) => setSynced(result.ok))
        .catch(() => setSynced(false));
    },
    [documentId],
  );

  const toggle = useCallback(
    (week: number, lesson: number) => {
      if (!documentId) return;
      setMap((current) => {
        const key = progressKey(week, lesson);
        const entry = current[key] ?? { taught: false, reflection: "" };
        const next: ProgressEntry = { ...entry, taught: !entry.taught };
        localStorage.setItem(taughtKey(documentId, week, lesson), next.taught ? "1" : "0");
        persist(week, lesson, next);
        return { ...current, [key]: next };
      });
    },
    [documentId, persist],
  );

  const setReflection = useCallback(
    (week: number, lesson: number, text: string) => {
      if (!documentId) return;
      const value = text.slice(0, 240);
      setMap((current) => {
        const key = progressKey(week, lesson);
        const entry = current[key] ?? { taught: false, reflection: "" };
        const next: ProgressEntry = { ...entry, reflection: value };
        localStorage.setItem(reflectKey(documentId, week, lesson), value);
        // Typing should not fire a request per keystroke.
        const timerKey = `${week}:${lesson}`;
        window.clearTimeout(timers.current[timerKey]);
        timers.current[timerKey] = window.setTimeout(() => persist(week, lesson, next), 700);
        return { ...current, [key]: next };
      });
    },
    [documentId, persist],
  );

  const get = useCallback(
    (week: number, lesson: number): ProgressEntry =>
      map[progressKey(week, lesson)] ?? { taught: false, reflection: "" },
    [map],
  );

  const taughtCount = useMemo(
    () => Object.values(map).filter((entry) => entry.taught).length,
    [map],
  );

  return { ready, synced, get, toggle, setReflection, taughtCount };
}
