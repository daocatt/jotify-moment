"use client";

import { useState } from "react";
import { getEmbedIframeSrc, getEmbedDimensions, type EmbedType } from "@/lib/embed-parser";

// Platform brand colors and labels for placeholder UI
const PLATFORM_META: Record<
  EmbedType,
  { label: string; color: string; icon: React.ReactNode }
> = {
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" />
      </svg>
    ),
  },
  bilibili: {
    label: "Bilibili",
    color: "#00AEEC",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" />
      </svg>
    ),
  },
  tiktok: {
    label: "TikTok",
    color: "#010101",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.31 6.31 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.74a4.85 4.85 0 0 1-1.01-.05z" />
      </svg>
    ),
  },
  spotify: {
    label: "Spotify",
    color: "#1DB954",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  "spotify-podcast": {
    label: "Spotify",
    color: "#1DB954",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  netease: {
    label: "网易云音乐",
    color: "#C20C0C",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm4.914 7.23c.2.003.39.1.51.27.12.17.15.39.07.58l-.86 2.08c-.11.27-.38.44-.67.42a.697.697 0 0 1-.62-.48c-.62-1.97-2.07-2.04-2.61-1.95-1.23.2-2.07 1.37-2.07 2.85v2.41c0 1.62 1.04 2.95 2.32 2.95 1.4 0 2.54-1.47 2.54-3.27v-.76a.72.72 0 0 0-.72-.72.72.72 0 0 0-.72.72v.76c0 .98-.45 1.78-1.1 1.78-.56 0-1.02-.67-1.02-1.47v-2.41c0-.89.42-1.65 1.07-1.76.17-.03.67-.04.93.68.19.54.68.9 1.24.9.41 0 .8-.19 1.06-.51.19-.24.27-.54.24-.84l-.01-.08v-.04c.01-.06.01-.12.01-.18 0-1.33-.57-2.58-1.56-3.46a4.62 4.62 0 0 0-3.19-1.13c-2.53.12-4.56 2.27-4.56 4.9v2.41c0 2.72 2.14 4.94 4.76 4.94 2.5 0 4.54-2.09 4.54-4.94v-.76c0-.4-.32-.72-.72-.72z" />
      </svg>
    ),
  },
  "apple-music": {
    label: "Apple Music",
    color: "#FC3C44",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M23.994 6.124a9.23 9.23 0 0 0-.24-2.19c-.317-1.31-1.048-2.31-2.17-3.043a5.022 5.022 0 0 0-1.72-.64c-.49-.08-.99-.13-1.49-.13H5.626c-.5 0-1 .05-1.49.13a5.022 5.022 0 0 0-1.72.64C1.294 1.624.563 2.624.246 3.934a9.23 9.23 0 0 0-.24 2.19C0 6.431 0 6.798 0 7.1v9.8c0 .3 0 .669.006.966a9.23 9.23 0 0 0 .24 2.19c.317 1.31 1.048 2.31 2.17 3.043a5.022 5.022 0 0 0 1.72.64c.49.08.99.13 1.49.13h12.748c.5 0 1-.05 1.49-.13a5.022 5.022 0 0 0 1.72-.64c1.122-.733 1.853-1.733 2.17-3.043a9.23 9.23 0 0 0 .24-2.19c.006-.297.006-.666.006-.966V7.1c0-.302 0-.669-.006-.976zM17.5 9.5l-5 1.5V16a2.5 2.5 0 1 1-1-2V9l7-2.1V14a2.5 2.5 0 1 1-1-2V9.5z" />
      </svg>
    ),
  },
  "apple-podcast": {
    label: "Apple Podcasts",
    color: "#872EC4",
    icon: (
      <svg viewBox="0 0 24 24" className="size-8 fill-white" aria-hidden>
        <path d="M5.34 0A5.328 5.328 0 0 0 0 5.34v13.32A5.328 5.328 0 0 0 5.34 24h13.32A5.328 5.328 0 0 0 24 18.66V5.34A5.328 5.328 0 0 0 18.66 0zm6.554 2.777c2.574.013 4.898 1.266 6.27 3.408a7.404 7.404 0 0 1 1.078 3.81c.007.046.01.093.01.14a7.486 7.486 0 0 1-1.617 4.802 7.396 7.396 0 0 1-4.57 2.703c-.028.006-.057.009-.087.009a.504.504 0 0 1-.496-.504v-.65a.504.504 0 0 1 .41-.496 6.397 6.397 0 0 0 4.077-2.558 6.39 6.39 0 0 0 1.256-4.073 6.386 6.386 0 0 0-6.32-6.076A6.39 6.39 0 0 0 5.57 9.607a6.386 6.386 0 0 0 1.256 4.073 6.397 6.397 0 0 0 4.077 2.557.504.504 0 0 1 .41.497v.65a.504.504 0 0 1-.496.504.508.508 0 0 1-.087-.009 7.396 7.396 0 0 1-4.57-2.703 7.487 7.487 0 0 1-1.617-4.803c0-.046.003-.092.01-.14a7.404 7.404 0 0 1 1.078-3.808C7 4.04 9.307 2.79 11.896 2.777zm.07 3.262a4.177 4.177 0 0 1 4.177 4.177c0 .09-.003.179-.009.267a4.165 4.165 0 0 1-1.95 3.333.504.504 0 0 1-.762-.432v-.555a.504.504 0 0 1 .214-.41 3.137 3.137 0 0 0-.007-5.218 3.137 3.137 0 0 0-3.31-.054A3.133 3.133 0 0 0 8.7 9.48a3.137 3.137 0 0 0 1.28 2.93.504.504 0 0 1 .214.409v.555a.504.504 0 0 1-.762.432 4.165 4.165 0 0 1-1.95-3.333 4.177 4.177 0 0 1 4.132-4.434zm0 2.834a1.343 1.343 0 1 1 0 2.686 1.343 1.343 0 0 1 0-2.686zm-.003 4.06c.2 0 .388.02.572.057.523 1.45.756 3.55.648 5.773a.507.507 0 0 1-.503.49h-.434a.507.507 0 0 1-.503-.49c-.108-2.222.125-4.322.648-5.773a2.52 2.52 0 0 1 .572-.057z" />
      </svg>
    ),
  },
};

interface MediaEmbedProps {
  embedType: string;
  embedId: string;
  embedMeta?: { thumbnailUrl?: string; title?: string } | null;
}

export function MediaEmbed({ embedType, embedId, embedMeta }: MediaEmbedProps) {
  const [active, setActive] = useState(false);

  const type = embedType as EmbedType;
  const meta = PLATFORM_META[type];
  if (!meta) return null;

  const iframeSrc = getEmbedIframeSrc(type, embedId);
  const dims = getEmbedDimensions(type);

  const isAudio = type === "spotify" || type === "spotify-podcast" || type === "netease" || type === "apple-music" || type === "apple-podcast";

  // Audio-type embeds: no facade, show inline iframe directly (they're small bars)
  if (isAudio) {
    return (
      <div
        className="mt-2 rounded-lg overflow-hidden border border-border"
        style={{ height: dims.height }}
      >
        <iframe
          src={iframeSrc}
          width="100%"
          height={dims.height}
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title={embedMeta?.title || meta.label}
          className="block"
        />
      </div>
    );
  }

  // Video-type embeds: facade with thumbnail until user clicks
  const thumbnailUrl =
    embedMeta?.thumbnailUrl ??
    (type === "youtube" ? `https://i.ytimg.com/vi/${embedId}/hqdefault.jpg` : undefined);

  return (
    <div
      className="relative mt-2 rounded-lg overflow-hidden border border-border bg-black"
      style={dims.aspectRatio ? { aspectRatio: dims.aspectRatio } : { height: dims.height }}
    >
      {active ? (
        <iframe
          src={iframeSrc}
          title={embedMeta?.title || meta.label}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      ) : (
        <button
          type="button"
          className="w-full h-full relative block group"
          onClick={() => setActive(true)}
          aria-label={`播放 ${meta.label} 视频`}
        >
          {/* Thumbnail */}
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt={embedMeta?.title || ""}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            // Fallback: platform-colored background
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: meta.color }}
            >
              {meta.icon}
            </div>
          )}

          {/* Overlay gradient */}
          {thumbnailUrl && (
            <div className="absolute inset-0 bg-black/20" />
          )}

          {/* Play button */}
          <span className="absolute inset-0 flex items-center justify-center">
            <span
              className="flex items-center justify-center size-14 rounded-full transition-all duration-200 group-hover:scale-110"
              style={{ background: `${meta.color}CC` }}
            >
              <svg viewBox="0 0 24 24" className="size-6 fill-white ml-1" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>

          {/* Title + platform label */}
          {(embedMeta?.title || meta.label) && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
              {embedMeta?.title && (
                <p className="text-white text-xs font-medium truncate">{embedMeta.title}</p>
              )}
              <p className="text-white/60 text-[10px]">{meta.label}</p>
            </div>
          )}
        </button>
      )}
    </div>
  );
}
