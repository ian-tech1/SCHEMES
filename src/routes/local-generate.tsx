import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell";
import { LocalSchemeGenerator } from "@/components/local-scheme-generator";

export const Route = createFileRoute("/local-generate")({
  component: LocalGeneratePage,
});

function LocalGeneratePage() {
  return (
    <AppShell>
      <LocalSchemeGenerator />
    </AppShell>
  );
}
