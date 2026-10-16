"use client";

import { ExternalLink, Bot, Globe, Smartphone, Puzzle, Wrench, Rocket } from "lucide-react";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

export interface ProductShowcaseMeta {
  name: string;
  tagline: string;
  category?: "agent" | "web_app" | "mobile_app" | "extension" | "tool" | "other";
  status: "vibe_coding" | "live" | "beta" | "idea";
  links?: {
    website?: string;
    github?: string;
    bot?: string;
  };
  techStack?: string[];
  logoUrl?: string;
  version?: string;
  [key: string]: unknown;
}

const CATEGORY_MAP: Record<string, { label: string; icon: typeof Rocket }> = {
  agent: { label: "AI 助理", icon: Bot },
  web_app: { label: "Web 应用", icon: Globe },
  mobile_app: { label: "移动 App", icon: Smartphone },
  extension: { label: "浏览器插件", icon: Puzzle },
  tool: { label: "独立工具", icon: Wrench },
  other: { label: "项目作品", icon: Rocket },
};

const STATUS_MAP: Record<string, { label: string; badgeClass: string; dotClass: string }> = {
  vibe_coding: {
    label: "Vibe Coding",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    dotClass: "bg-amber-500 animate-pulse",
  },
  live: {
    label: "已上架",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  beta: {
    label: "Beta 体验",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    dotClass: "bg-blue-500",
  },
  idea: {
    label: "构思中",
    badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    dotClass: "bg-purple-500",
  },
};

interface ProductCardProps {
  meta: ProductShowcaseMeta;
  onClick?: () => void;
  className?: string;
}

export function ProductCard({ meta, onClick, className = "" }: ProductCardProps) {
  const categoryConfig = CATEGORY_MAP[meta.category || "other"] || CATEGORY_MAP.other;
  const statusConfig = STATUS_MAP[meta.status || "vibe_coding"] || STATUS_MAP.vibe_coding;
  const CategoryIcon = categoryConfig.icon;

  return (
    <div
      onClick={onClick}
      className={`group relative rounded-xl border border-border/80 bg-gradient-to-br from-card via-card to-muted/30 p-3.5 sm:p-4 shadow-xs transition-all duration-200 hover:border-primary/30 hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-start gap-3">
        {meta.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meta.logoUrl}
            alt={meta.name}
            className="size-11 sm:size-12 rounded-xl object-cover border border-border/80 shadow-xs shrink-0 bg-background"
          />
        ) : (
          <div className="size-11 sm:size-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary shadow-xs">
            <CategoryIcon className="size-5 sm:size-6" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-sm sm:text-base text-foreground truncate tracking-tight">
              {meta.name}
            </h4>
            {meta.version && (
              <span className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.2 rounded bg-muted/80 border border-border/50">
                v{meta.version}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusConfig.badgeClass}`}
            >
              <span className={`size-1.5 rounded-full ${statusConfig.dotClass}`} />
              {statusConfig.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <CategoryIcon className="size-3 opacity-70" />
            <span>{categoryConfig.label}</span>
          </div>
        </div>
      </div>

      {/* Slogan / Tagline */}
      {meta.tagline && (
        <p className="text-xs sm:text-[13px] text-muted-foreground/95 mt-2.5 leading-relaxed font-normal">
          {meta.tagline}
        </p>
      )}

      {/* Tech Stack Chips */}
      {meta.techStack && meta.techStack.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {meta.techStack.map((tech) => (
            <span
              key={tech}
              className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md font-mono bg-muted/70 text-foreground/80 border border-border/60 transition-colors group-hover:border-border"
            >
              {tech}
            </span>
          ))}
        </div>
      )}

      {/* Action Links */}
      {meta.links && (meta.links.website || meta.links.github || meta.links.bot) && (
        <div
          className="flex items-center gap-2 mt-3.5 pt-3 border-t border-border/60 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          {meta.links.website && (
            <a
              href={meta.links.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
            >
              <ExternalLink size={12} /> 体验直达
            </a>
          )}
          {meta.links.github && (
            <a
              href={meta.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-muted/80 hover:bg-muted text-foreground border border-border transition-colors"
            >
              <GithubIcon /> 源码
            </a>
          )}
          {meta.links.bot && (
            <a
              href={meta.links.bot}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-muted/80 hover:bg-muted text-foreground border border-border transition-colors"
            >
              <Bot size={12} /> 对话 Agent
            </a>
          )}
        </div>
      )}
    </div>
  );
}
