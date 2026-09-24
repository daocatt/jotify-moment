/**
 * Minimal mdast shapes. Declared locally so this module does not depend on
 * @types/mdast / unist-util-visit, which are only transitive dependencies.
 */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  url?: string;
  title?: string | null;
}

// Inline hashtag: `#` followed by letters/numbers/underscore/CJK, with a
// lookbehind so URL anchors (https://x/#y) are not matched.
const INLINE_HASHTAG_RE = /(?<![a-zA-Z0-9_&/])#([\p{L}\p{N}_]+)/gu;

// Nodes whose descendants must not be rewritten. `link`/`linkReference` matter
// most: rewriting inside them would nest an anchor within an anchor. The rest
// carry literal text (code, html) or hold their content outside `children`.
const OPAQUE_NODES = new Set([
  "code",
  "inlineCode",
  "html",
  "image",
  "imageReference",
  "definition",
  "link",
  "linkReference",
]);

function splitHashtags(value: string): MdNode[] | null {
  const nodes: MdNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(INLINE_HASHTAG_RE)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, index) });
    }
    const tag = match[1];
    nodes.push({
      type: "link",
      url: `/tag/${encodeURIComponent(tag)}`,
      title: null,
      children: [{ type: "text", value: `#${tag}` }],
    });
    cursor = index + match[0].length;
  }

  if (nodes.length === 0) return null;
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes;
}

function rewriteHashtags(node: MdNode): void {
  if (!node.children) return;

  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      const parts = splitHashtags(child.value);
      if (parts) {
        next.push(...parts);
        continue;
      }
    }
    if (!OPAQUE_NODES.has(child.type)) {
      rewriteHashtags(child);
    }
    next.push(child);
  }
  node.children = next;
}

/**
 * Remark plugin: turn inline #hashtags into `/tag/...` links.
 *
 * Runs on the parsed AST rather than on the raw string, so hashtags inside
 * code spans, fenced/indented code blocks and link targets are left alone —
 * a pre-parse string replace would rewrite `#define` inside a code block.
 */
export function remarkHashtags() {
  return (tree: MdNode) => {
    rewriteHashtags(tree);
  };
}
