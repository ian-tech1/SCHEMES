import { Panel } from "@/components/bits";
import { Link } from "@tanstack/react-router";

export function AiUsageNotice() {
  return (
    <div role="note">
      <Panel className="border-leaf/30 bg-leaf/5 text-sm text-ink/80">
        <p className="font-semibold text-ink">How writing works</p>
        <p className="mt-1">
          Writing tries Grok on this site first, then any keys the admin has tested and saved. If every AI key fails, the site generator still writes a downloadable document from the topics you selected. Full notes include an explanation, worked examples, an exercise, and answers on a later page.
          <br /><br />
          Prefer no API keys? Use the <Link to="/local-generate" className="font-semibold text-leaf underline">Local AI writer</Link> — it runs a small model entirely in your browser (one-time download, then offline).
          <br /><br />
          Check facts, figures and current KICD alignment before you teach or print. Nothing here is an official KICD book or a KNEC paper.
        </p>
      </Panel>
    </div>
  );
}
