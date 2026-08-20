/**
 * Extract hashtags from plain content.
 * Matches #Tag and #标签 (supports Chinese, letters, numbers, underscores).
 * Ignores empty '#' or '#' followed by whitespace/punctuation.
 */
export function extractTags(content: string): string[] {
  if (!content) return [];
  // Match # followed by word characters or CJK characters, until whitespace or punctuation
  const regex = /#([\p{L}\p{N}_]+)/gu;
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      tags.add(match[1].trim());
    }
  }

  return Array.from(tags);
}

/**
 * Format markdown content by turning standalone #hashtags into custom markdown links or spans.
 * Avoids converting Markdown headers (# Title) or URLs (https://example.com/#anchor).
 */
export function transformHashtagsToMarkdownLinks(content: string): string {
  if (!content) return "";

  // Split lines to distinguish Markdown Headings (# Heading) vs inline #tag
  const lines = content.split("\n");

  const transformedLines = lines.map((line) => {
    // If line starts with # (Markdown heading), do not transform leading '#'
    const isHeading = /^\s*#{1,6}\s+/.test(line);

    if (isHeading) {
      return line;
    }

    // Replace inline hashtags with markdown links: [#tag](/tag/tag)
    // (?<![a-zA-Z0-9_&/]) prevents matching URLs (like https://foo.com/#hash)
    return line.replace(/(?<![a-zA-Z0-9_&/])#([\p{L}\p{N}_]+)/gu, (match, tag) => {
      return `[#${tag}](/tag/${encodeURIComponent(tag)})`;
    });
  });

  return transformedLines.join("\n");
}
