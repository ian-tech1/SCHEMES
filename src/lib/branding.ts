import type { BrandingMode, BrandingState, DocumentBranding, Profile, PublicSettings } from "@/lib/cbe-types";

/** Keep any user-supplied header/footer line short enough to print on one band. */
export const BRANDING_TEXT_LIMIT = 90;

export const DEFAULT_HEADER_TEXT = "IAN TECH SCHEMES · Kenya CBE";
export const DEFAULT_FOOTER_TEXT = "School document prepared with IAN TECH Schemes. Not issued by KICD or KNEC.";

export function cleanBrandingText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").trim().slice(0, BRANDING_TEXT_LIMIT);
}

export function isBrandingMode(value: unknown): value is BrandingMode {
  return value === "default" || value === "custom" || value === "off";
}

/**
 * Resolve what a teacher's documents print with.
 *
 * The desk owns the switch, so a browser cannot unlock editing by sending a
 * different flag: permission comes from the settings row plus the teacher's
 * stored grant, and a blocked or unequipped teacher silently falls back to the
 * admin default. Removing the branding is a separate permission from rewriting
 * it, because a school that allows "clean print for the HOD" may still forbid
 * dropping the disclaimer line.
 */
export function resolveBranding(profile: Profile, settings: PublicSettings): BrandingState {
  const grant = profile.brandingGrant ?? "inherit";
  const canEdit = grant === "allowed" || (grant !== "blocked" && settings.teacherMayEditBranding);
  const canRemove = grant === "allowed" || (grant !== "blocked" && settings.teacherMayHideBranding);

  const headerMode: BrandingMode = canEdit && isBrandingMode(profile.headerMode) ? profile.headerMode : "default";
  const footerMode: BrandingMode = canRemove && isBrandingMode(profile.footerMode) ? profile.footerMode : headerMode === "off" ? "default" : "default";

  const adminHeader = cleanBrandingText(settings.headerText) || DEFAULT_HEADER_TEXT;
  const adminFooter = cleanBrandingText(settings.footerText) || DEFAULT_FOOTER_TEXT;

  const effectiveHeaderText = headerMode === "off" ? "" : headerMode === "custom" && canEdit ? cleanBrandingText(profile.headerText) || adminHeader : adminHeader;
  const effectiveFooterText = footerMode === "off" ? "" : footerMode === "custom" && canEdit ? cleanBrandingText(profile.footerText) || adminFooter : adminFooter;

  const notes: string[] = [];
  if (grant === "blocked") notes.push("The desk has locked header and footer changes on your account.");
  else if (!canEdit && !canRemove) notes.push("Ask the administrator to allow header and footer changes, then you can edit or hide them.");
  else if (!canEdit) notes.push("You may hide the header and footer, but only the desk can rewrite the wording.");
  else if (!canRemove) notes.push("You may rewrite the wording, but the desk requires one line to stay on the page.");

  return {
    headerMode,
    footerMode,
    headerText: cleanBrandingText(profile.headerText),
    footerText: cleanBrandingText(profile.footerText),
    effectiveHeaderText,
    effectiveFooterText,
    logoDataUrl: profile.schoolLogo || settings.schoolLogo || "",
    canEdit,
    canRemove,
    permissionNote: notes.join(" "),
  };
}

/** The flat shape the PDF and Word builders read. */
export function brandingForExport(state: BrandingState): DocumentBranding {
  return {
    showHeader: state.headerMode !== "off" && Boolean(state.effectiveHeaderText),
    showFooter: state.footerMode !== "off" && Boolean(state.effectiveFooterText),
    headerText: state.effectiveHeaderText,
    footerText: state.effectiveFooterText,
    logoDataUrl: state.logoDataUrl,
  };
}

/** Placeholder tokens a school can use in its own header line. */
export const BRANDING_TOKENS = [
  { token: "{school}", label: "School name" },
  { token: "{teacher}", label: "Teacher name" },
  { token: "{grade}", label: "Grade" },
  { token: "{subject}", label: "Learning area" },
  { token: "{term}", label: "Term" },
  { token: "{year}", label: "Year" },
  { token: "{date}", label: "Today's date" },
];

export function expandBrandingTokens(
  raw: string,
  values: { schoolName?: string; teacherName?: string; grade?: string; subject?: string; term?: string; year?: number | string; date?: string },
): string {
  const today = values.date ?? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return cleanBrandingText(
    raw
      .replaceAll("{school}", values.schoolName ?? "")
      .replaceAll("{teacher}", values.teacherName ?? "")
      .replaceAll("{grade}", values.grade ?? "")
      .replaceAll("{subject}", values.subject ?? "")
      .replaceAll("{term}", values.term ?? "")
      .replaceAll("{year}", String(values.year ?? ""))
      .replaceAll("{date}", today),
  );
}

/** Data-URL guard: a school logo is stored inline, so the size must stay sane. */
export function cleanLogo(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (!/^data:image\/(png|jpeg|webp);base64,/i.test(value)) return "";
  return value.length <= 220_000 ? value : "";
}
