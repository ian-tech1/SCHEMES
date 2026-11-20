/**
 * The app's schema files, inlined into the server bundle by Vite.
 *
 * Both database paths apply `migrations/*.sql` from here, so a deployed build
 * never needs the `migrations/` folder at runtime (Vercel ships only the
 * compiled function) and never needs the database to be reachable at BUILD
 * time — migrations run once, lazily, on the first query of a server process.
 *
 * Applied files are keyed by basename and recorded in `_migrations`, so each
 * file runs exactly once no matter which applier (PGLite, Neon, or the
 * `npm run db:migrate` CLI) gets there first.
 */
import { pendingMigrations } from "../../scripts/migration-plan.mjs";

export type MigrationFile = { name: string; path: string };

/** glob keys look like `/migrations/0001_auth.sql` (root-absolute). */
const files = import.meta.glob("/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Every migration in the bundle, keyed by its glob path. */
export const MIGRATION_SQL: Readonly<Record<string, string>> = files;

/** All migration file names, in apply order. */
export function allMigrationNames(): string[] {
  return Object.keys(files)
    .map((path) => path.split("/").pop() ?? path)
    .sort((a, b) => a.localeCompare(b));
}

/** Migrations in the bundle that `applied` does not already contain. */
export function pendingMigrationFiles(applied: Iterable<string>): MigrationFile[] {
  return pendingMigrations(Object.keys(files), applied);
}

/** The SQL text for one glob path. */
export function migrationText(path: string): string {
  return files[path] ?? "";
}
