import { useEffect } from "react";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import appCss from "../styles.css?url";

const APP_NAME = "IANTECH SCHEMES";

/**
 * Register the offline worker. Only in a production build: in dev it would cache
 * HMR modules and serve stale code. A missing worker (older deployment) is
 * ignored — offline is an enhancement, never a reason to break the page.
 */
function OfflineWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Kenya CBE schemes of work, lesson plans, notes and revision for primary, junior school and senior school. By IAN TECH.",
      },
      { name: "theme-color", content: "#1F6B45" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
    // Runs before first paint so a dark-mode teacher never sees a white flash.
    scripts: [{ children: THEME_BOOT_SCRIPT }],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <OfflineWorker />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Toaster theme="light" position="top-center" />
        <Scripts />
      </body>
    </html>
  ),
});
