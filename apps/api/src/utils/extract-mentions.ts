// Mentions are encoded inline in markdown content as a self-closing tag the
// web editor (kaneo-mention node) emits:
//   <kaneo-mention id="USER_ID" label="NAME" />
// We target on `id` only (a cuid2, safe charset) so a display name with odd
// characters can never misroute a notification. The regex is tolerant of
// attribute ordering and optional self-closing slash.
const MENTION_TAG_RE = /<kaneo-mention\s+[^>]*?\bid="([^"]+)"[^>]*?\/?>/g;

export function extractMentionUserIds(
  markdown: string | null | undefined,
): string[] {
  if (!markdown) return [];
  const ids = new Set<string>();
  for (const match of markdown.matchAll(MENTION_TAG_RE)) {
    const id = match[1]?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

// Build a short plain-text preview for the notification body: turn mention
// tokens into "@Name", drop any other kaneo-* inline tokens, strip the most
// common markdown markers, collapse whitespace, and truncate. Intentionally
// crude — a notification snippet doesn't need a real markdown parser.
export function toPlainSnippet(
  markdown: string | null | undefined,
  maxLength = 140,
): string {
  if (!markdown) return "";
  const text = markdown
    .replace(
      /<kaneo-mention\s+[^>]*?\blabel="([^"]*)"[^>]*?\/?>/g,
      (_m, label) => `@${label}`,
    )
    .replace(/<kaneo-[a-z-]+\s+[^>]*?\/?>/g, "") // other inline tokens
    .replace(/^#{1,6}\s+/gm, "") // heading markers
    .replace(/^>\s?/gm, "") // blockquote markers
    .replace(/^\s*[-*+]\s+/gm, "") // bullet markers
    .replace(/^\s*\d+\.\s+/gm, "") // ordered-list markers
    .replace(/[*_`~]/g, "") // emphasis/code markers
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
