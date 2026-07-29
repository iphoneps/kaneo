// Comment/description bodies are markdown containing inline editor tokens, e.g.
//   <kaneo-mention id="USER_ID" label="NAME" />
// Outbound integrations (Slack, Discord, Telegram, webhooks) receive that body
// verbatim, so without flattening it a mention arrives as raw tag markup rather
// than a readable "@Name".
//
// Notification routing is handled separately by parseMentionIds(), which keys on
// `id`. This function is presentation-only and deliberately keys on `label`.
export function tokensToPlainText(
  markdown: string | null | undefined,
  maxLength = 500,
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
