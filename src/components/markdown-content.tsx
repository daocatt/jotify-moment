"use client";

import { useEffect, useState, memo } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { transformHashtagsToMarkdownLinks } from "@/lib/tag-parser";
import type { PluggableList } from "unified";

const markdownComponents = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  a: ({ node, href, children, ...props }: any) => {
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
  table: ({ node, children, ...props }: any) => (
    <div className="overflow-x-auto my-2">
      <table {...props} className="w-full">{children}</table>
    </div>
  ),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pre: ({ node, children, ...props }: any) => (
    <pre {...props} className="overflow-x-auto">{children}</pre>
  ),
};

export const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  const hasCodeBlock = content.includes("```");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [highlightPlugin, setHighlightPlugin] = useState<any>(null);

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
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {transformHashtagsToMarkdownLinks(content)}
    </ReactMarkdown>
  );
});
