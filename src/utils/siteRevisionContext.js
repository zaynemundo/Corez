/**
 * Builds the model-facing copy of a published site's editable documents.
 *
 * The Sites screen is a list, not a code editor any more: clicking Edit opens
 * a new conversation. The canvas shows the home page, but the model must see
 * every sub-page too, because a change republished from chat replaces the
 * whole site. The page markers make that boundary explicit.
 */
export function buildSiteRevisionContext(page) {
  if (!page || typeof page.html !== "string" || !page.html.trim()) return "";

  const title =
    (typeof page.title === "string" && page.title.trim()) ||
    (typeof page.slug === "string" && page.slug.trim()) ||
    "Untitled site";
  const url = typeof page.url === "string" ? page.url.trim() : "";
  const pages =
    page.pages && typeof page.pages === "object" && !Array.isArray(page.pages)
      ? Object.entries(page.pages)
          .filter(
            ([name, document]) =>
              typeof name === "string" &&
              name.trim() &&
              typeof document === "string" &&
              document.trim(),
          )
          .sort(([left], [right]) => left.localeCompare(right))
      : [];

  const sections = [
    `Published site: ${title}${url ? ` at ${url}` : ""}`,
    "This is an existing site. Apply the requested change to its documents.",
    "Preserve every page the request does not change. Return each changed document in full.",
    "",
    "===== index.html =====",
    page.html.trim(),
  ];

  for (const [name, document] of pages) {
    sections.push("", `===== ${name.trim()} =====`, document.trim());
  }

  return sections.join("\n");
}
