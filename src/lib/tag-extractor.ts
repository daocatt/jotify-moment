import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { remarkHashtags, TAG_LINK_PREFIX, type MdNode } from "@/lib/tag-parser";

// Same remark pipeline as the renderer (src/components/markdown-content.tsx),
// so the tags we index are exactly the ones the page turns into /tag/ links.
// remarkGfm matters for parity: it turns `https://x/#a` into a link node and
// `[^1]: #tag` into a footnote definition, both of which change what gets
// rewritten.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkHashtags);

function collect(node: MdNode, out: Set<string>): void {
  if (node.data?.hashtag && typeof node.url === "string" && node.url.startsWith(TAG_LINK_PREFIX)) {
    const tag = decodeURIComponent(node.url.slice(TAG_LINK_PREFIX.length)).toLowerCase();
    if (tag) out.add(tag);
  }
  if (node.children) {
    for (const child of node.children) collect(child, out);
  }
}

/**
 * Hashtags contained in `content`, lowercased, matching what the renderer
 * produces. Server-only: importing this pulls in remark-parse/unified, which
 * must not end up in the client bundle — keep it out of client components.
 */
export function extractTags(content: string): string[] {
  // Cheap fast path: no `#` means no hashtags.
  if (!content || !content.includes("#")) return [];
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;
  const tags = new Set<string>();
  collect(tree, tags);
  return [...tags].sort();
}
