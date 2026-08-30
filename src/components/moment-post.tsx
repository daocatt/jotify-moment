"use client";

import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Heart, MessageSquare, Trash2, Smile, Volume2, CheckCircle, AlertCircle, Pin, PinOff, Loader2, Edit2, Eye, EyeOff, Heading3, Bold, List, Hash, Globe } from "lucide-react";
import { toggleReactionAction, addCommentAction, deletePostAction, pinPostAction, unpinPostAction, updatePostAction, pinPostToProfileAction, unpinPostFromProfileAction } from "@/app/actions/posts";
import { deleteCommentAction, toggleCommentVisibilityAction, updateCommentAction, getPostCommentsAction } from "@/app/actions/comments";
import { approvePostAction } from "@/app/actions/admin";
import { MediaEmbed } from "@/components/media-embed";
import { parseEmbedUrl } from "@/lib/embed-parser";
import { transformHashtagsToMarkdownLinks } from "@/lib/tag-parser";
import { toast } from "sonner";

const Youtube = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
  </svg>
);

export interface MomentPostProps {
  post: {
    id: string;
    userId: string;
    content: string;
    mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }>;
    ytVideoId: string | null;
    embedType?: string | null;
    embedId?: string | null;
    embedMeta?: { thumbnailUrl?: string; title?: string; description?: string } | null;
    status: "approved" | "pending";
    pinnedAt: Date | null;
    profilePinned?: boolean;
    createdAt: Date;
    user: {
      id: string;
      name: string;
      avatar: string | null;
      role: string;
      slug: string | null;
    };
    comments: Array<{
      id: string;
      content: string;
      createdAt: Date;
      status?: string;
      userId: {
        id: string;
        name: string;
        avatar: string | null;
      };
    }>;
    reactions: Array<{
      id: string;
      emoji: string;
      userId: {
        id: string;
        name: string;
      };
    }>;
    reactionSummary?: { total: number; byEmoji: Record<string, number> };
  };
  currentUser: {
    id: string;
    name: string;
    role: string;
  } | null;
  onOpenLightbox: (images: string[], index: number) => void;
  onRefresh: () => void;
  onRequireLogin?: () => void;
  isDetailsView?: boolean;
}

const REACTIONS_LIST = ["❤️", "👍", "🔥", "😂", "😮", "😢", "🎉", "🙏"];

export const MomentPost = memo(function MomentPost({ post, currentUser, onOpenLightbox, onRefresh, onRequireLogin, isDetailsView = false }: MomentPostProps) {
  const router = useRouter();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiClosing, setEmojiClosing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState<string>("");
  const [editingPost, setEditingPost] = useState(false);
  const [editPostContent, setEditPostContent] = useState("");
  const editPostTextareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapEditSelection = (before: string, after: string) => {
    const ta = editPostTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = editPostContent.slice(start, end);
    const newText = editPostContent.slice(0, start) + before + selected + after + editPostContent.slice(end);
    setEditPostContent(newText);
    requestAnimationFrame(() => {
      ta.focus();
      if (selected.length === 0) {
        ta.selectionStart = ta.selectionEnd = start + before.length;
      } else {
        ta.selectionStart = start;
        ta.selectionEnd = start + before.length + selected.length + after.length;
      }
    });
  };

  const toggleEditLinePrefix = (prefix: string) => {
    const ta = editPostTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = editPostContent.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = editPostContent.indexOf("\n", start);
    const realLineEnd = lineEnd === -1 ? editPostContent.length : lineEnd;
    const line = editPostContent.slice(lineStart, realLineEnd);
    const hasPrefix = line.startsWith(prefix);
    const newLine = hasPrefix ? line.slice(prefix.length) : prefix + line;
    const newText = editPostContent.slice(0, lineStart) + newLine + editPostContent.slice(realLineEnd);
    setEditPostContent(newText);
    requestAnimationFrame(() => {
      ta.focus();
      const offset = hasPrefix ? -prefix.length : prefix.length;
      ta.selectionStart = ta.selectionEnd = Math.max(lineStart, start + offset);
    });
  };

  const insertEditHashtag = () => {
    const ta = editPostTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = editPostContent.slice(start, end);

    if (selected.trim()) {
      const tagText = selected.startsWith("#") ? selected : `#${selected}`;
      const newText = editPostContent.slice(0, start) + tagText + " " + editPostContent.slice(end);
      setEditPostContent(newText);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + tagText.length + 1;
      });
    } else {
      const needsLeadingSpace = start > 0 && !/\s/.test(editPostContent[start - 1]);
      const insertStr = needsLeadingSpace ? " #" : "#";
      const newText = editPostContent.slice(0, start) + insertStr + editPostContent.slice(end);
      setEditPostContent(newText);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + insertStr.length;
      });
    }
  };
  const editEmbedInfo = useMemo(() => {
    if (!editingPost) return null;
    const urlMatch = editPostContent.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) return null;
    return parseEmbedUrl(urlMatch[0]);
  }, [editingPost, editPostContent]);

  const [showPinMenu, setShowPinMenu] = useState(false);
  const [profilePinLoading, setProfilePinLoading] = useState(false);

  // Lazy loaded comments state
  interface LocalComment {
    id: string;
    content: string;
    createdAt: Date;
    status: string;
    userId: { id: string; name: string; avatar: string | null };
  }
  const [localComments, setLocalComments] = useState<LocalComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsLoadTime, setCommentsLoadTime] = useState(0);
  const [commentsExpanded, setCommentsExpanded] = useState(isDetailsView);

  // Local mirror of the post used for optimistic reaction updates without a full feed refetch.
  const [postState, setPostState] = useState(post);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local mirror with server data
    setPostState(post);
  }, [post]);

  // Counter for optimistic (temporary) reaction ids — avoids impure calls in render.
  const tmpIdCounter = useRef(0);

  // Close the pin popup when clicking anywhere outside of it.
  const pinMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showPinMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const el = pinMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowPinMenu(false);
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [showPinMenu]);

  const loadComments = useCallback(async (force = false) => {
    if (!force && localComments.length > 0) return;
    setCommentsLoading(true);
    setCommentsLoadTime(Date.now());
    const res = await getPostCommentsAction(post.id);
    setCommentsLoading(false);
    if (res.success && res.comments) {
      setLocalComments(res.comments);
    } else if (res.error) {
      toast.error(res.error);
    }
  }, [post.id, localComments.length]);

  useEffect(() => {
    if (isDetailsView || commentsExpanded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch in effect is standard pattern
      loadComments();
    }
  }, [isDetailsView, commentsExpanded, loadComments]);
  
  // Custom Voice Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaFiles = post.mediaUrls;
  const images = mediaFiles.filter((f) => f.type === "image");
  const imageUrls = images.map((f) => f.url);
  const voiceFile = mediaFiles.find((f) => f.type === "audio");
  const videoFile = mediaFiles.find((f) => f.type === "video");

  const isOwner = currentUser && post.userId === currentUser.id;
  const isAdmin = currentUser && (currentUser.role === "super_admin" || currentUser.role === "admin");

  // Format date relative to now
  const relativeTime = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: zhCN });

  // Handle voice play/pause
  const togglePlayVoice = () => {
      if (!voiceFile || !audioRef.current) return;

      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(() => {
          toast.error("播放音频失败");
        });
        setIsPlaying(true);
      }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (a && a.duration) {
      setProgress(Math.min(1, a.currentTime / a.duration));
    }
  };

  const handleReaction = async (emoji: string) => {
    if (!currentUser) {
      toast.error("请先登录账户");
      return;
    }
    if (reacting) return;
    setReacting(true);
    setShowEmojiPicker(false);

    // Optimistic update: apply immediately, revert on server error.
    const prev = postState;
    const prevReactions = prev.reactions;
    const existing = prevReactions.find((r) => r.userId.id === currentUser.id && r.emoji === emoji);

    const fallbackByEmoji: Record<string, number> = {};
    for (const r of prevReactions) fallbackByEmoji[r.emoji] = (fallbackByEmoji[r.emoji] || 0) + 1;
    const byEmoji = { ...(prev.reactionSummary?.byEmoji ?? fallbackByEmoji) };
    const total = (prev.reactionSummary?.total ?? prevReactions.length) + (existing ? -1 : 1);
    if (existing) {
      byEmoji[emoji] = Math.max(0, (byEmoji[emoji] ?? 1) - 1);
    } else {
      byEmoji[emoji] = (byEmoji[emoji] ?? 0) + 1;
    }

    const nextReactions = existing
      ? prevReactions.filter((r) => !(r.userId.id === currentUser.id && r.emoji === emoji))
      : [
          ...prevReactions,
          { id: `tmp-${++tmpIdCounter.current}`, emoji, userId: { id: currentUser.id, name: currentUser.name } },
        ];

    setPostState((p) => ({
      ...p,
      reactions: nextReactions,
      reactionSummary: { total, byEmoji },
    }));

    try {
      const res = await toggleReactionAction(post.id, emoji);
      if (res.error) {
        setPostState(prev);
        toast.error(res.error);
      }
    } finally {
      setReacting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error("请先登录账户");
      return;
    }
    if (!commentText.trim()) return;

    setLoading(true);
    const res = await addCommentAction(post.id, commentText);
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      setCommentText("");
      setShowCommentInput(false);
      setCommentsExpanded(true); // Automatically expand to show new comment
      loadComments(true); // Local refresh
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("确定要删除这条评论吗？")) return;
    const res = await deleteCommentAction(commentId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("评论已删除");
      loadComments(true); // Local refresh
    }
  };

  const handleSaveEditComment = async (commentId: string) => {
    if (!editingContent.trim()) return;
    setLoading(true);
    const res = await updateCommentAction(commentId, editingContent);
    setLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("评论修改成功");
      setEditingCommentId(null);
      loadComments(true); // Local refresh
    }
  };

  const handleToggleHideComment = async (commentId: string, currentStatus: string) => {
    const isHidden = currentStatus === "hidden";
    const res = await toggleCommentVisibilityAction(commentId, !isHidden);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(isHidden ? "已取消隐藏" : "已隐藏该评论");
      loadComments(true); // Local refresh
    }
  };

  const handleDeletePost = async () => {
    if (!confirm("确定要删除这条日志吗？")) return;
    const res = await deletePostAction(post.id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("日志已删除");
      onRefresh();
    }
  };

  const handleStartEditPost = () => {
    setEditPostContent(post.content);
    setEditingPost(true);
  };

  const handleSaveEditPost = async () => {
    if (!editPostContent.trim()) {
      toast.error("内容不能为空");
      return;
    }
    const res = await updatePostAction(post.id, editPostContent);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("日志已更新");
      setEditingPost(false);
      onRefresh();
    }
  };

  const handleToggleProfilePin = async () => {
    setProfilePinLoading(true);
    setShowPinMenu(false);
    const res = post.profilePinned
      ? await unpinPostFromProfileAction(post.id)
      : await pinPostToProfileAction(post.id);
    setProfilePinLoading(false);
    if (res.error) { toast.error(res.error); }
    else { toast.success(post.profilePinned ? "已取消主页置顶" : "已主页置顶"); onRefresh(); }
  };

  const handleApprovePost = async () => {
    const res = await approvePostAction(post.id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("日志审核已通过");
      onRefresh();
    }
  };

  const handleTogglePin = async () => {
    setPinLoading(true);
    const res = post.pinnedAt ? await unpinPostAction(post.id) : await pinPostAction(post.id);
    setPinLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(post.pinnedAt ? "已取消置顶" : "已置顶");
      onRefresh();
    }
  };

  const goToUserHome = () => {
    if (post.user.slug) router.push(`/u/${post.user.slug}`);
  };


  return (
    <div className="flex gap-4 p-4 border-b border-border bg-card">
      <button
        type="button"
        onClick={goToUserHome}
        className="size-10 sm:size-11 rounded-[var(--theme-radius-avatar)] bg-muted overflow-hidden shrink-0 cursor-pointer"
        disabled={!post.user.slug}
      >
        {post.user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.user.avatar} alt="Author Avatar" className="w-full h-full object-cover" loading={isDetailsView ? "eager" : "lazy"} decoding="async" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground font-semibold text-sm">
            {post.user.name.charAt(0)}
          </div>
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Name and relative time */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToUserHome}
              disabled={!post.user.slug}
              className="font-semibold text-[#576B95] dark:text-blue-400 text-sm sm:text-base cursor-pointer hover:underline disabled:cursor-default disabled:hover:no-underline"
            >
              {post.user.name}
            </button>
            {post.pinnedAt && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                <Pin className="size-3" /> 置顶
              </span>
            )}
            {post.status === "pending" && (
              <div className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500">
                  <AlertCircle className="size-3" /> 待审核
                </span>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleApprovePost}
                    className="min-h-0 h-[18px] py-0 px-1.5 text-[9px] bg-white dark:bg-zinc-900 border-green-500/30 text-green-600 hover:bg-green-500/10 rounded-sm leading-none flex items-center"
                  >
                    <CheckCircle className="mr-0.5 size-2.5" /> 审核通过
                  </Button>
                )}
              </div>
            )}
          </div>
          <span className="text-[11px] sm:text-xs text-muted-foreground">{relativeTime}</span>
        </div>

        {/* Content Body (Markdown) */}
        {editingPost ? (
          <div className="bg-card border border-border rounded-xl p-3 shadow-sm space-y-3">
            <div className="relative">
              <Textarea
                ref={editPostTextareaRef}
                value={editPostContent}
                maxLength={1000}
                onChange={(e) => setEditPostContent(e.target.value)}
                placeholder="这一刻的想法..."
                className="min-h-[90px] border-none resize-none focus-visible:ring-0 p-0 pr-16 shadow-none text-sm bg-transparent"
                autoFocus
              />
              <span className={`absolute bottom-0 right-0 text-[10px] ${editPostContent.length > 1000 * 0.9 ? "text-amber-500" : "text-muted-foreground"}`}>
                {editPostContent.length}/1000
              </span>
            </div>

            {/* Embed Preview */}
            {editEmbedInfo && (
              <div className="border border-border rounded-lg p-2 bg-muted flex items-center gap-3">
                <div className="flex items-center justify-center size-8 rounded-lg bg-background border border-border shrink-0">
                  {editEmbedInfo.embedType === "link" ? (
                    <Globe className="size-4 text-primary" />
                  ) : (
                    <Youtube className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground/80">
                    {editEmbedInfo.embedType === "link" ? "已检测到网页链接（保存后将生成链接卡片）" : `已检测到嵌入媒体 · ${editEmbedInfo.embedType}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate font-mono">{editEmbedInfo.embedId}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              {/* Markdown toolbar */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toggleEditLinePrefix("### ")}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                  title="标题"
                >
                  <Heading3 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => wrapEditSelection("**", "**")}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                  title="加粗"
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleEditLinePrefix("- ")}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                  title="列表"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  onClick={insertEditHashtag}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
                  title="添加话题标签 (#话题)"
                >
                  <Hash size={16} />
                </button>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditingPost(false)} className="h-7 text-xs">
                  取消
                </Button>
                <Button size="sm" onClick={handleSaveEditPost} className="h-7 text-xs">
                  保存
                </Button>
              </div>
            </div>
          </div>
        ) : post.content && (
          <div className="break-words prose prose-sm dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-code:before:content-[''] prose-code:after:content-[''] prose-img:rounded-lg max-w-none text-foreground leading-relaxed">
            <ReactMarkdown
              // SECURITY CRITICAL: Never add rehype-raw or any plugin that renders raw HTML.
              // post.content is user-generated — enabling raw HTML would allow XSS attacks.
              // If you need HTML rendering, sanitize with DOMPurify first.
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeHighlight]}
              components={{
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
              }}
            >
              {transformHashtagsToMarkdownLinks(post.content)}
            </ReactMarkdown>
          </div>
        )}

        {/* Audio voice bubble player (Wechat-Style long bar with progress) */}
        {voiceFile && (
          <div className="py-1">
            <audio
              ref={audioRef}
              src={voiceFile.url}
              onEnded={handleAudioEnded}
              onTimeUpdate={handleTimeUpdate}
              className="hidden"
            />
            <div
              onClick={togglePlayVoice}
              className="inline-flex items-center gap-2.5 h-10 px-3 bg-[#F2F2F2] dark:bg-muted active:opacity-80 border border-border rounded-full cursor-pointer transition-all hover:bg-neutral-200 dark:hover:bg-neutral-800 whitespace-nowrap"
              style={{ width: `${Math.min(280, Math.max(200, 140 + (voiceFile.duration || 5) * 8))}px` }}
            >
              <Volume2 className={`size-4 shrink-0 ${isPlaying ? "text-green-500" : "text-neutral-600 dark:text-neutral-400"}`} />
              <div className="flex-1 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600 overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
              </div>
              <span className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold shrink-0 tabular-nums">
                {voiceFile.duration ? `${voiceFile.duration}"` : '5"'}
              </span>
            </div>
          </div>
        )}

        {/* Videos Display */}
        {videoFile && (
          <div className="relative aspect-video max-w-md w-full rounded-lg overflow-hidden border border-border bg-black mt-2">
          <video
              src={videoFile.url}
              controls
              preload="none"
              poster={videoFile.thumbnailUrl}
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Media Embed — unified component for all platforms.
            Handles: YouTube, Bilibili, TikTok (video facade) and
            Spotify, Netease, Apple Music/Podcast (inline audio bars).
            Falls back to ytVideoId for backward compat with old posts. */}
        {(post.embedType && post.embedId) ? (
          <div className="max-w-md w-full">
            <MediaEmbed
              embedType={post.embedType}
              embedId={post.embedId}
              embedMeta={post.embedMeta}
            />
          </div>
        ) : post.ytVideoId ? (
          // Legacy: old posts with ytVideoId only
          <div className="max-w-md w-full">
            <MediaEmbed
              embedType="youtube"
              embedId={post.ytVideoId}
              embedMeta={null}
            />
          </div>
        ) : null}

        {/* Images Grid */}
        {images.length > 0 && (
          <div
            className={`grid gap-1.5 mt-2 ${
              images.length === 1
                ? "grid-cols-1 max-w-[240px]"
                : images.length === 2 || images.length === 4
                ? "grid-cols-2 max-w-[320px]"
                : "grid-cols-3 max-w-[400px]"
            }`}
          >
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative aspect-square bg-muted overflow-hidden rounded-md border border-border cursor-zoom-in"
                onClick={() => onOpenLightbox(imageUrls, idx)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <LazyImage
                  src={img.thumbnailUrl || img.url}
                  alt={`Log file ${idx}`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer actions: comment, reaction picker, approvals */}
        <div className="flex items-center gap-4 pt-2 text-xs">
          {/* Reaction Button */}
          <div className="relative">
            <button
              className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
              onClick={() => {
                if (!currentUser) {
                  toast.error("请先登录账户");
                  onRequireLogin?.();
                  return;
                }
                if (showEmojiPicker) {
                  setEmojiClosing(true);
                } else {
                  setEmojiClosing(false);
                  setShowEmojiPicker(true);
                }
              }}
            >
              <Smile size={18} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 fill-zinc-100 dark:fill-zinc-800 group-hover:stroke-orange-500 group-hover:fill-orange-100 dark:group-hover:fill-orange-950/40" />
            </button>
            {showEmojiPicker && (
              <div
                className={`t-dropdown ${emojiClosing ? "is-closing" : "is-open"} absolute left-0 bottom-8 z-30 flex items-center gap-1 p-1 bg-popover/85 backdrop-blur-sm rounded-full border border-border/30`}
                onTransitionEnd={() => {
                  if (emojiClosing) {
                    setShowEmojiPicker(false);
                    setEmojiClosing(false);
                  }
                }}
              >
                {REACTIONS_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    disabled={reacting}
                    className="hover:scale-125 text-base p-1 transition-transform disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
            onClick={() => {
              if (!currentUser) {
                toast.error("请先登录账户");
                onRequireLogin?.();
                return;
              }
              setShowCommentInput((prev) => !prev);
            }}
          >
            <MessageSquare size={18} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 fill-zinc-100 dark:fill-zinc-800 group-hover:stroke-green-500 group-hover:fill-green-100 dark:group-hover:fill-green-950/40" />
          </button>



          {/* Edit Button for owner */}
          {isOwner && !editingPost && (
            <div className="relative">
              <button
                onClick={handleStartEditPost}
                className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
                onMouseEnter={(e) => (e.currentTarget.nextElementSibling?.classList.add("is-shown"), e.currentTarget.nextElementSibling?.classList.remove("is-hiding"))}
                onMouseLeave={(e) => { const tt = e.currentTarget.nextElementSibling; if (tt) { tt.classList.remove("is-shown"); tt.classList.add("is-hiding"); } }}
              >
                <Edit2 size={16} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-amber-500" />
              </button>
              <span className="t-tt absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-foreground text-background shadow-sm pointer-events-none">编辑</span>
            </div>
          )}

          {/* Pin buttons */}
          {post.status === "approved" && (
            isOwner && isAdmin ? (
              <div className="relative" ref={pinMenuRef}>
                <button
                  onClick={() => setShowPinMenu((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={showPinMenu}
                  className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
                >
                  <Pin size={16} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" />
                </button>
                {showPinMenu && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-foreground text-background rounded shadow-lg text-[10px] font-medium z-50 overflow-hidden min-w-[80px]">
                    <button
                      onClick={handleToggleProfilePin}
                      disabled={profilePinLoading}
                      className="w-full px-3 py-1.5 hover:bg-background/10 text-left disabled:opacity-50"
                    >
                      {post.profilePinned ? "取消主页置顶" : "主页置顶"}
                    </button>
                    <button
                      onClick={() => { setShowPinMenu(false); handleTogglePin(); }}
                      disabled={pinLoading}
                      className="w-full px-3 py-1.5 hover:bg-background/10 text-left disabled:opacity-50"
                    >
                      {post.pinnedAt ? "取消全局置顶" : "全局置顶"}
                    </button>
                  </div>
                )}
              </div>
            ) : isOwner ? (
              <div className="relative">
                <button
                  onClick={handleToggleProfilePin}
                  disabled={profilePinLoading}
                  className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
                  onMouseEnter={(e) => (e.currentTarget.nextElementSibling?.classList.add("is-shown"), e.currentTarget.nextElementSibling?.classList.remove("is-hiding"))}
                  onMouseLeave={(e) => { const tt = e.currentTarget.nextElementSibling; if (tt) { tt.classList.remove("is-shown"); tt.classList.add("is-hiding"); } }}
                >
                  {profilePinLoading ? (
                    <Loader2 className="size-4 animate-spin text-zinc-600 dark:text-zinc-400" />
                  ) : (
                    <span className="t-icon-swap" data-state={post.profilePinned ? "a" : "b"}>
                      <span className="t-icon" data-icon="a"><PinOff size={16} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
                      <span className="t-icon" data-icon="b"><Pin size={16} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
                    </span>
                  )}
                </button>
                <span className="t-tt absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-foreground text-background shadow-sm pointer-events-none">{post.profilePinned ? "取消主页置顶" : "主页置顶"}</span>
              </div>
            ) : isAdmin ? (
              <div className="relative">
                <button
                  onClick={handleTogglePin}
                  disabled={pinLoading}
                  className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
                  onMouseEnter={(e) => (e.currentTarget.nextElementSibling?.classList.add("is-shown"), e.currentTarget.nextElementSibling?.classList.remove("is-hiding"))}
                  onMouseLeave={(e) => { const tt = e.currentTarget.nextElementSibling; if (tt) { tt.classList.remove("is-shown"); tt.classList.add("is-hiding"); } }}
                >
                  {pinLoading ? (
                    <Loader2 className="size-4 animate-spin text-zinc-600 dark:text-zinc-400" />
                  ) : (
                    <span className="t-icon-swap" data-state={post.pinnedAt ? "a" : "b"}>
                      <span className="t-icon" data-icon="a"><PinOff size={16} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
                      <span className="t-icon" data-icon="b"><Pin size={16} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
                    </span>
                  )}
                </button>
                <span className="t-tt absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-foreground text-background shadow-sm pointer-events-none">{post.pinnedAt ? "取消全局置顶" : "全局置顶"}</span>
              </div>
            ) : null
          )}

          {/* Delete Button */}
          {(isOwner || isAdmin) && (
            <div className="relative">
              <button
                onClick={handleDeletePost}
                className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
                onMouseEnter={(e) => (e.currentTarget.nextElementSibling?.classList.add("is-shown"), e.currentTarget.nextElementSibling?.classList.remove("is-hiding"))}
                onMouseLeave={(e) => { const tt = e.currentTarget.nextElementSibling; if (tt) { tt.classList.remove("is-shown"); tt.classList.add("is-hiding"); } }}
              >
                <Trash2 size={18} strokeWidth={1.5} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 fill-zinc-100 dark:fill-zinc-800 group-hover:stroke-red-500 group-hover:fill-red-100 dark:group-hover:fill-red-950/40" />
              </button>
              <span className="t-tt absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-foreground text-background shadow-sm pointer-events-none">删除</span>
            </div>
          )}

          {!isDetailsView && (
            <Link
              href={`/mo/${post.id}`}
              className="ml-auto text-[11px] sm:text-xs text-[#576B95] dark:text-blue-400 font-medium hover:underline flex items-center"
            >
              查看更多
            </Link>
          )}
        </div>

        {/* Expandable Comment input */}
        <div className="t-panel-slide" data-open={showCommentInput}>
          <form onSubmit={handleAddComment} className="flex gap-2 items-center mt-2 max-w-lg">
            <input
              type="text"
              placeholder="评论这一刻..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="flex-1 text-xs sm:text-sm px-3 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              required
              autoFocus={showCommentInput}
            />
            <Button type="submit" size="sm" className="h-8" disabled={loading}>
              发送
            </Button>
          </form>
        </div>

        {/* Reactions List and Comments Container */}
        {(postState.reactions.length > 0 || post.comments.length > 0) && (
          <div className="bg-[#F7F7F7] dark:bg-muted/40 rounded-lg border border-border/40 p-2.5 space-y-2 mt-2 max-w-lg">
            {/* Reactions (Likes & Emojis) */}
            {(() => {
              const totalReactions = postState.reactionSummary?.total ?? postState.reactions.length;
              if (totalReactions === 0) return null;
              const emojiCounts: Record<string, number> = postState.reactionSummary?.byEmoji ?? {};
              return (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#576B95] dark:text-blue-400 border-b border-border/30 pb-2 last:border-b-0 last:pb-0 transition-all duration-300">
                  <Heart size={12} className="text-[#576B95] dark:text-blue-400 shrink-0" />
                  {(() => {
                    if (totalReactions > 3) {
                      const firstPersonName = postState.reactions[0]?.userId.name ?? "";

                      const emojiSummary = Object.entries(emojiCounts)
                        .map(([emoji, count]) => `${emoji} ${count}人`)
                        .join("  ");

                      return (
                        <span className="font-semibold">
                          {firstPersonName}等{totalReactions}人 {emojiSummary}
                        </span>
                      );
                    } else {
                      return (
                        <span className="font-semibold flex flex-wrap gap-x-2">
                          {postState.reactions.map((r) => (
                            <span key={r.id} className="inline-block transition-transform hover:scale-110">
                              {r.userId.name} {r.emoji}
                            </span>
                          ))}
                        </span>
                      );
                    }
                  })()}
                </div>
              );
            })()}

            {/* Comments List */}
            {post.comments.length > 0 && (
              <div className="space-y-1.5 border-t border-border/30 pt-2 first:border-t-0 first:pt-0">
                {!commentsExpanded ? (
                  <button
                    type="button"
                    onClick={() => setCommentsExpanded(true)}
                    className="text-xs text-[#576B95] dark:text-blue-400 font-medium hover:underline flex items-center gap-1 py-0.5"
                  >
                    <span>💬 查看全部 {post.comments.length} 条评论</span>
                  </button>
                ) : (
                  <>
                    {commentsLoading && localComments.length === 0 ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 animate-pulse">
                        <Loader2 className="size-3 animate-spin" />
                        <span>正在加载评论...</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {localComments.map((comment) => {
                          const isCommentOwner = currentUser && comment.userId.id === currentUser.id;
                          const isEditable = isCommentOwner && comment.status !== "hidden" && (commentsLoadTime - new Date(comment.createdAt).getTime() <= 5 * 60 * 1000);
                          const isCommentHidden = comment.status === "hidden";

                          return (
                            <div
                              key={comment.id}
                              className={`group flex items-start justify-between text-xs sm:text-sm leading-relaxed p-1 rounded transition-colors ${isCommentHidden ? "bg-amber-500/10 border-l-2 border-amber-500 pl-1.5" : "hover:bg-muted/30"}`}
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <span className="font-semibold text-[#576B95] dark:text-blue-400 cursor-pointer hover:underline">
                                  {comment.userId.name}
                                </span>
                                {isCommentHidden && (
                                  <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1 rounded ml-1 select-none">
                                    已隐藏
                                  </span>
                                )}
                                {editingCommentId === comment.id ? (
                                  <div className="mt-1 flex items-center gap-1">
                                    <input
                                      type="text"
                                      value={editingContent}
                                      onChange={(e) => setEditingContent(e.target.value)}
                                      className="flex-1 text-xs px-2 py-1 border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                      maxLength={500}
                                      autoFocus
                                    />
                                    <Button
                                      size="sm"
                                      className="h-6 text-[10px] px-2"
                                      onClick={() => handleSaveEditComment(comment.id)}
                                    >
                                      保存
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-[10px] px-2 text-muted-foreground"
                                      onClick={() => setEditingCommentId(null)}
                                    >
                                      取消
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-foreground">：{comment.content}</span>
                                )}
                              </div>

                              {editingCommentId !== comment.id && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">
                                  {isEditable && (
                                    <button
                                      onClick={() => {
                                        setEditingCommentId(comment.id);
                                        setEditingContent(comment.content);
                                      }}
                                      title="编辑评论"
                                      className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                                    >
                                      <Edit2 size={11} />
                                    </button>
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleToggleHideComment(comment.id, comment.status || "active")}
                                      title={isCommentHidden ? "取消隐藏" : "隐藏评论"}
                                      className="text-muted-foreground hover:text-amber-500 p-0.5 rounded transition-colors"
                                    >
                                      {isCommentHidden ? <Eye size={11} /> : <EyeOff size={11} />}
                                    </button>
                                  )}
                                  {(isCommentOwner || isOwner || isAdmin) && (
                                    <button
                                      onClick={() => handleDeleteComment(comment.id)}
                                      title="删除评论"
                                      className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setCommentsExpanded(false)}
                      className="text-xs text-[#576B95] dark:text-blue-400 font-medium hover:underline flex items-center gap-1 mt-2 pt-1 border-t border-border/30 w-full text-left"
                    >
                      <span>收起评论</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Cached images (immutable Cache-Control) can complete before React attaches
  // onLoad, leaving `loaded` false forever and the image invisible. Check the
  // synchronous `complete` state on mount to cover that case.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with image load state
      setLoaded(true);
    }
  }, []);

  return (
    <div className={`relative w-full h-full bg-neutral-100 dark:bg-zinc-900 transition-all duration-300 ${!loaded ? "animate-pulse" : ""}`}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover pointer-events-none transition-all duration-500 ${
          loaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-sm scale-95"
        }`}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
