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
type Pluggable = PluggableList[number];

const markdownComponents: Components = {
  // `node` is destructured only to keep it out of the spread props.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node, href, children, ...props }) => {
    const isTag = typeof href === "string" && href.startsWith("/tag/");
    if (isTag) {
      return (
        <Link
          href={href}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium text-primary hover:bg-primary/10 transition-colors no-underline"
        >
          {children}
        </Link>
      );
    }
    return <a {...props} href={href} target="_blank" rel="noopener noreferrer" />;
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

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const hasCodeBlock = content.includes("```");
  const [highlightPlugin, setHighlightPlugin] = useState<Pluggable | null>(null);

  useEffect(() => {
    if (!hasCodeBlock) return;
    let active = true;
    import("rehype-highlight").then((mod) => {
      if (active) {
        setHighlightPlugin(() => mod.default);
      }
    });
    return () => {
      active = false;
    };
  }, [hasCodeBlock]);

  const rehypePlugins: PluggableList = highlightPlugin ? [highlightPlugin] : [];

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
