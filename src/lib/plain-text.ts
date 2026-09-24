/**
 * Reduces markdown source to a single-line plain-text excerpt.
 *
 * Post content is stored as markdown, so anything that renders it as text
 * (metadata descriptions, link previews, search results) has to strip the
 * syntax first, otherwise the reader sees `#`, `**` and `![](url)` verbatim.
 */
export function plainExcerpt(content: string, max = 80): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#*`>_~]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}
