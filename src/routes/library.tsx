import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";

export const Route = createFileRoute("/library")({
  component: function LibraryLayout() {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  },
});
