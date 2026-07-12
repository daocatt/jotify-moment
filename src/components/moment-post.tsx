"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, MessageSquare, Trash2, Smile, Volume2, CheckCircle, AlertCircle, Pin, PinOff, Loader2, Edit2, Eye, EyeOff, ChevronDown } from "lucide-react";
import { toggleReactionAction, addCommentAction, deletePostAction, pinPostAction, unpinPostAction, updatePostAction, pinPostToProfileAction, unpinPostFromProfileAction } from "@/app/actions/posts";
import { deleteCommentAction, toggleCommentVisibilityAction, updateCommentAction } from "@/app/actions/comments";
import { approvePostAction } from "@/app/actions/admin";
import { toast } from "sonner";

interface MomentPostProps {
  post: {
    id: string;
    userId: string;
    content: string;
    mediaUrls: Array<{ type: string; url: string; name: string; duration?: number; thumbnailUrl?: string }>;
    ytVideoId: string | null;
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

export function MomentPost({ post, currentUser, onOpenLightbox, onRefresh, onRequireLogin, isDetailsView = false }: MomentPostProps) {
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
  const [showPinMenu, setShowPinMenu] = useState(false);
  const [profilePinLoading, setProfilePinLoading] = useState(false);
  
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
    try {
      const res = await toggleReactionAction(post.id, emoji);
      setShowEmojiPicker(false);
      if (res.error) {
        toast.error(res.error);
      } else {
        onRefresh();
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
      onRefresh();
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("确定要删除这条评论吗？")) return;
    const res = await deleteCommentAction(commentId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("评论已删除");
      onRefresh();
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
      onRefresh();
    }
  };

  const handleToggleHideComment = async (commentId: string, currentStatus: string) => {
    const isHidden = currentStatus === "hidden";
    const res = await toggleCommentVisibilityAction(commentId, !isHidden);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(isHidden ? "已取消隐藏" : "已隐藏该评论");
      onRefresh();
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
          <img src={post.user.avatar} alt="Author Avatar" className="w-full h-full object-cover" loading="lazy" />
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
          <div className="space-y-2">
            <textarea
              value={editPostContent}
              onChange={(e) => setEditPostContent(e.target.value)}
              className="w-full min-h-[80px] text-sm p-2 border border-border bg-background rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setEditingPost(false)} className="h-7 text-xs">取消</Button>
              <Button size="sm" onClick={handleSaveEditPost} className="h-7 text-xs">保存</Button>
            </div>
          </div>
        ) : post.content && (
          <div className="break-words prose prose-sm dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-foreground prose-code:before:content-[''] prose-code:after:content-[''] prose-img:rounded-lg max-w-none text-foreground leading-relaxed">
            <ReactMarkdown
              // SECURITY CRITICAL: Never add rehype-raw or any plugin that renders raw HTML.
              // post.content is user-generated — enabling raw HTML would allow XSS attacks.
              // If you need HTML rendering, sanitize with DOMPurify first.
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={{
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
              }}
            >
              {post.content}
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
            <video src={videoFile.url} controls className="w-full h-full object-contain" />
          </div>
        )}

        {/* YouTube Video Embed */}
        {post.ytVideoId && (
          <div className="relative aspect-video max-w-md w-full rounded-lg overflow-hidden border border-border bg-black mt-2">
            <iframe
              src={`https://www.youtube.com/embed/${post.ytVideoId}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            ></iframe>
          </div>
        )}

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
                <img
                  src={img.thumbnailUrl || img.url}
                  alt={`Log file ${idx}`}
                  className="w-full h-full object-cover pointer-events-none"
                  loading="lazy"
                  decoding="async"
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
              <Smile size={18} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 fill-zinc-100 dark:fill-zinc-800 group-hover:stroke-orange-500 group-hover:fill-orange-100 dark:group-hover:fill-orange-950/40" />
            </button>
            {showEmojiPicker && (
              <div
                className={`t-dropdown ${emojiClosing ? "is-closing" : "is-open"} absolute left-0 bottom-8 z-30 flex items-center gap-1 p-1 bg-popover/85 backdrop-blur-sm rounded-full`}
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
            <MessageSquare size={18} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 fill-zinc-100 dark:fill-zinc-800 group-hover:stroke-green-500 group-hover:fill-green-100 dark:group-hover:fill-green-950/40" />
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
                <Edit2 size={16} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-amber-500" />
              </button>
              <span className="t-tt absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-foreground text-background shadow-sm pointer-events-none">编辑</span>
            </div>
          )}

          {/* Pin buttons */}
          {post.status === "approved" && (
            isOwner && isAdmin ? (
              <div className="relative">
                <button
                  onClick={() => setShowPinMenu((v) => !v)}
                  className="group size-7 flex items-center justify-center bg-transparent border-none p-0 cursor-pointer min-h-0 rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none text-muted-foreground"
                >
                  <Pin size={16} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" />
                  <ChevronDown size={10} className="absolute -bottom-0.5 -right-0.5" />
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
                {showPinMenu && <div className="fixed inset-0 z-40" onClick={() => setShowPinMenu(false)} />}
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
                      <span className="t-icon" data-icon="a"><PinOff size={16} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
                      <span className="t-icon" data-icon="b"><Pin size={16} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
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
                      <span className="t-icon" data-icon="a"><PinOff size={16} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
                      <span className="t-icon" data-icon="b"><Pin size={16} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 group-hover:stroke-blue-500" /></span>
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
                <Trash2 size={18} className="transition-colors stroke-zinc-600 dark:stroke-zinc-400 fill-zinc-100 dark:fill-zinc-800 group-hover:stroke-red-500 group-hover:fill-red-100 dark:group-hover:fill-red-950/40" />
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
        {(post.reactions.length > 0 || post.comments.length > 0) && (
          <div className="bg-[#F7F7F7] dark:bg-muted/40 rounded-lg border border-border/40 p-2.5 space-y-2 mt-2 max-w-lg">
            {/* Reactions (Likes & Emojis) */}
            {post.reactions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#576B95] dark:text-blue-400 border-b border-border/30 pb-2 last:border-b-0 last:pb-0 transition-all duration-300">
                <Heart size={12} className="text-[#576B95] dark:text-blue-400 shrink-0" />
                {(() => {
                  if (post.reactions.length > 3) {
                    const firstPersonName = post.reactions[0].userId.name;
                    const totalCount = post.reactions.length;
                    
                    const emojiCounts: Record<string, number> = {};
                    post.reactions.forEach(r => {
                      emojiCounts[r.emoji] = (emojiCounts[r.emoji] || 0) + 1;
                    });
                    
                    const emojiSummary = Object.entries(emojiCounts)
                      .map(([emoji, count]) => `${emoji} ${count}人`)
                      .join("  ");
                    
                    return (
                      <span className="font-semibold">
                        {firstPersonName}等{totalCount}人 {emojiSummary}
                      </span>
                    );
                  } else {
                    return (
                      <span className="font-semibold flex flex-wrap gap-x-2">
                        {post.reactions.map((r) => (
                          <span key={r.id} className="inline-block transition-transform hover:scale-110">
                            {r.userId.name} {r.emoji}
                          </span>
                        ))}
                      </span>
                    );
                  }
                })()}
              </div>
            )}

            {/* Comments List */}
            {post.comments.length > 0 && (
              <div className="space-y-1.5">
                {(isDetailsView ? post.comments : post.comments.slice(-5)).map((comment) => {
                  const isCommentOwner = currentUser && comment.userId.id === currentUser.id;
                  const isEditable = isCommentOwner && (Date.now() - new Date(comment.createdAt).getTime() <= 5 * 60 * 1000);
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
                {!isDetailsView && post.comments.length > 5 && (
                  <Link
                    href={`/mo/${post.id}`}
                    className="block text-[11px] sm:text-xs text-[#576B95] dark:text-blue-400 font-semibold hover:underline mt-2 pt-1 border-t border-border/30"
                  >
                    查看全部共 {post.comments.length} 条评论...
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
