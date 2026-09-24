"use client";

import { useEffect, useState, memo } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { remarkHashtags } from "@/lib/tag-parser";

// react-markdown does not re-export PluggableList, and `unified` is only a
// transitive dependency (not in package.json). Derive the types from the direct
// dependency instead so type resolution does not depend on hoisting.
type PluggableList = NonNullable<Options["rehypePlugins"]>;
type PluginTuple = Extract<PluggableList[number], readonly unknown[]>;

const markdownComponents: Components = {
  // `node` is destructured only to keep it out of the spread props.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node, href, children, ...props }) => {
    // In-page anchors (GFM footnotes use #user-content-fn-1) must stay in the
    // same tab, or the browser opens a new tab and never scrolls to the target.
    if (typeof href === "string" && href.startsWith("#")) {
      return <a {...props} href={href}>{children}</a>;
    }
    if (typeof href === "string" && href.startsWith("/tag/")) {
      return (
        <Link
          href={href}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-colors no-underline"
        >
          {children}
        </Link>
      );
    }
    // Same-origin links get client-side navigation instead of a new tab.
    if (typeof href === "string" && href.startsWith("/")) {
      return <Link {...props} href={href}>{children}</Link>;
    }
    return <a {...props} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  table: ({ node, children, ...props }) => (
    <div className="overflow-x-auto my-2">
      <table {...props} className="w-full">{children}</table>
    </div>
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pre: ({ node, children, ...props }) => (
    <pre {...props} className="overflow-x-auto">{children}</pre>
  ),
};

// A fenced block (``` or ~~~, up to 3 leading spaces) or an indented code block
// (4 spaces / tab at the start of a line, which markdown only treats as code
// when preceded by a blank line or the document start).
const HAS_CODE_BLOCK_RE = /```|~~~|(?:^|\n\n)(?: {4}|\t)/;

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const hasCodeBlock = HAS_CODE_BLOCK_RE.test(content);
  const [highlight, setHighlight] = useState<PluginTuple | null>(null);

  useEffect(() => {
    if (!hasCodeBlock) return;
    let active = true;
    import("rehype-highlight").then((mod) => {
      if (active) {
        // detect: highlight code blocks that carry no language class instead of
        // leaving them unstyled.
        setHighlight(() => [mod.default, { detect: true }]);
      }
    });
    return () => {
      active = false;
    };
  }, [hasCodeBlock]);

  const rehypePlugins: PluggableList = highlight ? [highlight] : [];

  return (
    <ReactMarkdown
      // SECURITY CRITICAL: Never add rehype-raw or any plugin that renders raw
      // HTML. `content` is user-generated — enabling raw HTML would allow XSS.
      // If you need HTML rendering, sanitize with DOMPurify first.
      remarkPlugins={[remarkGfm, remarkBreaks, remarkHashtags]}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
});
