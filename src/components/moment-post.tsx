"use client";

import { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, MessageSquare, Trash2, Smile, Volume2, CheckCircle, AlertCircle } from "lucide-react";
import { toggleReactionAction, addCommentAction, deleteCommentAction, deletePostAction } from "@/app/actions/posts";
import { approvePostAction } from "@/app/actions/admin";
import { toast } from "sonner";

interface MomentPostProps {
  post: {
    id: string;
    userId: string;
    content: string;
    mediaUrls: Array<{ type: string; url: string; name: string; duration?: number }>;
    ytVideoId: string | null;
    status: "approved" | "pending";
    createdAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      avatar: string | null;
      role: string;
    };
    comments: Array<{
      id: string;
      content: string;
      createdAt: Date;
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
}

const REACTIONS_LIST = ["❤️", "👍", "😂", "😮", "😢", "🎉", "🙏"];

export function MomentPost({ post, currentUser, onOpenLightbox, onRefresh }: MomentPostProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Custom Voice Player States
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaFiles = post.mediaUrls as Array<{ type: string; url: string; name: string; duration?: number }>;
  const images = mediaFiles.filter((f) => f.type === "image").map((f) => f.url);
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
  };

  const handleReaction = async (emoji: string) => {
    if (!currentUser) {
      toast.error("请先登录账户");
      return;
    }
    const res = await toggleReactionAction(post.id, emoji);
    setShowEmojiPicker(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      onRefresh();
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

  const handleApprovePost = async () => {
    const res = await approvePostAction(post.id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("日志审核已通过");
      onRefresh();
    }
  };

  // Group reactions by emoji
  const groupedReactions: Record<string, string[]> = {};
  post.reactions.forEach((r) => {
    if (!groupedReactions[r.emoji]) {
      groupedReactions[r.emoji] = [];
    }
    groupedReactions[r.emoji].push(r.userId.name);
  });

  return (
    <div className="flex gap-4 p-4 border-b border-border bg-card">
      <Avatar className="size-10 sm:size-11 rounded-md shrink-0 border border-border">
        {post.user.avatar ? (
          <AvatarImage src={post.user.avatar} className="object-cover" />
        ) : (
          <AvatarFallback className="font-semibold text-sm">
            {post.user.name.charAt(0)}
          </AvatarFallback>
        )}
      </Avatar>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Name and relative time */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#576B95] dark:text-blue-400 text-sm sm:text-base cursor-pointer hover:underline">
              {post.user.name}
            </span>
            {post.status === "pending" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-500">
                <AlertCircle className="size-3" /> 待审核
              </span>
            )}
          </div>
          <span className="text-[11px] sm:text-xs text-muted-foreground">{relativeTime}</span>
        </div>

        {/* Content Body (Markdown) */}
        {post.content && (
          <div className="text-sm sm:text-base break-words prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
          </div>
        )}

        {/* Audio voice bubble player (Wechat-Style) */}
        {voiceFile && (
          <div className="py-1">
            <audio
              ref={audioRef}
              src={voiceFile.url}
              onEnded={handleAudioEnded}
              className="hidden"
            />
            <div
              onClick={togglePlayVoice}
              className="inline-flex items-center gap-3 px-4 py-2 bg-[#F2F2F2] dark:bg-muted active:opacity-80 border border-border rounded-lg cursor-pointer transition-all hover:bg-neutral-200 dark:hover:bg-neutral-800"
              style={{ width: `${Math.min(180, 80 + (voiceFile.duration || 5) * 5)}px` }}
            >
              <Volume2 className={`size-4 text-neutral-600 dark:text-neutral-400 ${isPlaying ? "animate-bounce" : ""}`} />
              <span className="text-xs text-neutral-600 dark:text-neutral-400 font-semibold flex-1">
                {isPlaying ? "播放中..." : "语音消息"}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
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
                onClick={() => onOpenLightbox(images, idx)}
                onContextMenu={(e) => e.preventDefault()} // Disable Right Click to prevent downloading
              >
                <img
                  src={img}
                  alt={`Log file ${idx}`}
                  className="w-full h-full object-cover pointer-events-none" // Disable dragging/saving
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer actions: comment, reaction picker, approvals */}
        <div className="flex items-center gap-4 pt-2 text-xs">
          {/* Reaction Button */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground rounded-full"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
            >
              <Smile size={18} />
            </Button>
            {showEmojiPicker && (
              <div className="absolute left-0 bottom-8 z-30 flex items-center gap-1.5 p-1.5 bg-popover border border-border rounded-full shadow-lg animate-in slide-in-from-bottom-2 duration-150">
                {REACTIONS_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="hover:scale-125 text-base p-1 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Comment Button */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground rounded-full"
            onClick={() => setShowCommentInput((prev) => !prev)}
          >
            <MessageSquare size={18} />
          </Button>

          {/* Post approval for admin */}
          {post.status === "pending" && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApprovePost}
              className="h-7 text-xs border-green-500/30 text-green-600 hover:bg-green-500/10"
            >
              <CheckCircle className="mr-1 size-3.5" /> 审核通过
            </Button>
          )}

          {/* Delete Button */}
          {(isOwner || isAdmin) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeletePost}
              className="size-7 text-muted-foreground hover:text-destructive rounded-full"
            >
              <Trash2 size={18} />
            </Button>
          )}
        </div>

        {/* Expandable Comment input */}
        {showCommentInput && (
          <form onSubmit={handleAddComment} className="flex gap-2 items-center mt-2 max-w-lg">
            <input
              type="text"
              placeholder="评论这一刻..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="flex-1 text-xs sm:text-sm px-3 py-1.5 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              required
              autoFocus
            />
            <Button type="submit" size="sm" className="h-8" disabled={loading}>
              发送
            </Button>
          </form>
        )}

        {/* Reactions List and Comments Container */}
        {(post.reactions.length > 0 || post.comments.length > 0) && (
          <div className="bg-[#F7F7F7] dark:bg-muted/40 rounded-lg border border-border/40 p-2.5 space-y-2 mt-2 max-w-lg">
            {/* Reactions (Likes & Emojis) */}
            {post.reactions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#576B95] dark:text-blue-400 border-b border-border/30 pb-2 last:border-b-0 last:pb-0">
                <Heart size={12} className="text-[#576B95] dark:text-blue-400 shrink-0" />
                {Object.entries(groupedReactions).map(([emoji, names], idx) => (
                  <span key={idx} className="font-semibold">
                    {emoji} {names.join(", ")}
                  </span>
                ))}
              </div>
            )}

            {/* Comments List */}
            {post.comments.length > 0 && (
              <div className="space-y-1.5">
                {post.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="group flex items-start justify-between text-xs sm:text-sm text-foreground leading-relaxed"
                  >
                    <div className="flex-1">
                      <span className="font-semibold text-[#576B95] dark:text-blue-400 cursor-pointer hover:underline">
                        {comment.userId.name}
                      </span>
                      ：{comment.content}
                    </div>
                    {((currentUser && comment.userId.id === currentUser.id) || isAdmin) && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
