import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Moon, Search, Sun, WifiOff } from "lucide-react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMe } from "@/lib/cbe.functions";
import type { Me } from "@/lib/cbe-types";
import { waLink } from "@/lib/contact";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import { CommandPalette } from "@/components/command-palette";

type DeskContext = {
  me: Me | null;
  refresh: () => Promise<void>;
};

const Desk = createContext<DeskContext>({ me: null, refresh: async () => {} });

export function useDesk() {
  return useContext(Desk);
}

function isUnauthorized(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("unauthorized");
}

/** True once the browser knows it is offline (and false again when it is back). */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(readTheme());
  }, []);
  return (
    <button
      type="button"
      className="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-ink/80 hover:bg-paper"
      onClick={() => {
        const next: Theme = theme === "dark" ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={theme === "dark" ? "Switch to the light desk" : "Switch to the dark desk"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const online = useOnline();

  const refresh = useCallback(async () => {
    const next = await getMe();
    setMe(next);
  }, []);

  useEffect(() => {
    if (isPending || !user?.id) return;
    let gone = false;
    getMe()
      .then((next) => {
        if (!gone) setMe(next);
      })
      .catch((error: unknown) => {
        if (gone) return;
        if (isUnauthorized(error)) {
          void router.navigate({ to: "/login" });
          return;
        }
        setFailed(error instanceof Error ? error.message : "The desk could not open.");
      });
    return () => {
      gone = true;
    };
  }, [user?.id, isPending, router]);

  // ⌘K / Ctrl+K opens quick search from anywhere on the desk.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isPending || (user && !me && !failed)) {
    return (
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-6">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-ink/10" />
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-ink/10" />
      </div>
    );
  }

  if (!user) return <RedirectToSignIn />;

  const whatsapp = waLink(me?.settings.whatsapp ?? "254723278526");
  const navLink = "shrink-0 rounded-lg px-3 py-2 text-ink/80 hover:bg-paper";
  const navActive = "shrink-0 rounded-lg bg-leaf px-3 py-2 text-paper";

  return (
    <Desk.Provider value={{ me, refresh }}>
      <div className="min-h-screen">
        <header className="no-print border-b border-line bg-card">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
            <Link to="/" className="font-display text-xl leading-none text-ink">
              IANTECH <span className="text-leaf">SCHEMES</span>
            </Link>
            <nav className="flex flex-1 gap-1 overflow-x-auto text-sm font-semibold" aria-label="Main">
              <Link to="/desk" className={navLink} activeProps={{ className: navActive }}>Desk</Link>
              <Link to="/generate" search={{ from: "" }} className={navLink} activeProps={{ className: navActive }}>New scheme</Link>
              <Link to="/local-generate" className={navLink} activeProps={{ className: navActive }}>Local AI</Link>
              <Link to="/create" className={navLink} activeProps={{ className: navActive }}>Create resource</Link>
              <Link to="/curriculum" className={navLink} activeProps={{ className: navActive }}>Curriculum</Link>
              <Link to="/past-papers" className={navLink} activeProps={{ className: navActive }}>Past papers</Link>
              <Link to="/marks" className={navLink} activeProps={{ className: navActive }}>Marks</Link>
              <Link to="/library" className={navLink} activeProps={{ className: navActive }}>Library</Link>
              <Link to="/studio" className={navLink} activeProps={{ className: navActive }}>Studio</Link>
              <Link to="/variables" className={navLink} activeProps={{ className: navActive }}>Variables</Link>
              <Link to="/calendar" className={navLink} activeProps={{ className: navActive }}>Calendar</Link>
              <Link to="/profile" className={navLink} activeProps={{ className: navActive }}>Profile</Link>
              <Link to="/updates" className={navLink} activeProps={{ className: navActive }}>Updates</Link>
              {me && (me.profile.role === "admin" || me.profile.role === "deputy") ? (
                <Link to="/admin" className={navLink} activeProps={{ className: navActive }}>Admin desk</Link>
              ) : null}
            </nav>
            <button
              type="button"
              className="flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink/80 hover:bg-paper"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search your desk (Ctrl+K)"
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-line px-1.5 text-xs text-ink/60 md:block">⌘K</kbd>
            </button>
            <ThemeToggle />
            <a className="text-sm font-semibold text-leaf" href={whatsapp} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <UserButton />
          </div>
          {!online ? (
            <p className="flex items-center gap-2 bg-gold/15 px-4 py-2 text-sm font-semibold text-ink">
              <WifiOff className="size-4" aria-hidden="true" />
              You are offline. Schemes already opened still read, and ticks save when the network returns.
            </p>
          ) : null}
        </header>
        <main id="main" className="mx-auto max-w-5xl px-4 py-6">
          {failed ? <p className="mb-4 rounded-xl border border-clay bg-card px-4 py-3 text-clay">{failed}</p> : null}
          {children}
        </main>
        <footer className="no-print mx-auto max-w-5xl px-4 pb-8 text-xs text-ink/60">
          <Link to="/status" className="font-semibold text-leaf">Deployment status</Link>
          {" · "}School documents prepared with IAN TECH Schemes. Not issued by KICD or KNEC.
        </footer>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </Desk.Provider>
  );
}
