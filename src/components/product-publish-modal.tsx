"use client";

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { createPostAction } from "@/app/actions/posts";
import { toast } from "sonner";
import {
  Rocket,
  Plus,
  Trash2,
  Loader2,
  Bot,
  Globe,
  Smartphone,
  Puzzle,
  Wrench,
  Grid3X3,
  SlidersHorizontal,
} from "lucide-react";
import type { PostData } from "@/components/timeline-shell";

const CATEGORIES = [
  { id: "web_app", label: "Web 应用", icon: Globe },
  { id: "mobile_app", label: "移动 App", icon: Smartphone },
  { id: "agent", label: "AI 应用", icon: Bot },
  { id: "extension", label: "插件", icon: Puzzle },
  { id: "tool", label: "工具", icon: Wrench },
  { id: "other", label: "其他", icon: Rocket },
];

interface ProductPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (post: PostData) => void;
}

export function ProductPublishModal({ isOpen, onClose, onSuccess }: ProductPublishModalProps) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<string>("web_app");
  const [website, setWebsite] = useState("");
  const [isOpenSource, setIsOpenSource] = useState(false);
  const [github, setGithub] = useState("");
  const [contact, setContact] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Media files (up to 9 images)
  const [mediaFiles, setMediaFiles] = useState<
    Array<{ type: string; url: string; name: string; thumbnailUrl?: string }>
  >([]);
  const [imageLayout, setImageLayout] = useState<"grid" | "carousel">("grid");
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = 9 - mediaFiles.length;
    if (remaining <= 0) {
      toast.error("最多支持上传 9 张作品图片");
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploadingImages(true);

    try {
      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} 不是图片文件`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload?biz=moment", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error);
        } else {
          setMediaFiles((prev) => [
            ...prev,
            { type: "image", url: data.url, name: data.name, thumbnailUrl: data.thumbnailUrl },
          ]);
        }
      }
    } catch {
      toast.error("图片上传失败");
    } finally {
      setUploadingImages(false);
      e.target.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    setMediaFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("请输入产品名称");
      return;
    }
    if (!tagline.trim()) {
      toast.error("请输入一句话介绍");
      return;
    }

    setSubmitting(true);
    try {
      const finalContent = `${name.trim()} - ${tagline.trim()}`;
      const links: Record<string, string> = {};
      if (website.trim()) links.website = website.trim();
      if (github.trim()) links.github = github.trim();
      if (contact.trim()) links.contact = contact.trim();

      const res = await createPostAction({
        content: finalContent,
        mediaUrls: mediaFiles,
        embedType: "product_showcase",
        embedMeta: {
          name: name.trim(),
          tagline: tagline.trim(),
          category,
          isOpenSource,
          links,
          logoUrl: logoUrl.trim() || undefined,
          imageLayout: mediaFiles.length >= 2 ? imageLayout : undefined,
        },
        imageLayout: mediaFiles.length >= 2 ? imageLayout : undefined,
      });

      if ("error" in res && res.error) {
        toast.error(res.error);
      } else if ("post" in res && res.post) {
        toast.success("🚀 作品发布成功！");
        onSuccess(res.post as PostData);
        onClose();
        // Reset form
        setName("");
        setTagline("");
        setWebsite("");
        setIsOpenSource(false);
        setGithub("");
        setContact("");
        setLogoUrl("");
        setMediaFiles([]);
        setImageLayout("grid");
      }
    } catch {
      toast.error("发布失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Rocket size={18} />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg">发布作品</DialogTitle>
              <DialogDescription className="text-xs">
                在moments 分享你的 作品
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">类型分类</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const selected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs gap-1 transition-all cursor-pointer ${
                      selected
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-[11px] truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              产品名称 <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="例如: Pixel Ivy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>

          {/* Slogan / Tagline */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              一句话介绍 (Slogan) <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="例如: 像素风格的桌面虚拟宠物伴侣"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={150}
              required
            />
          </div>

          {/* Links: Product Link, Open Source & Source Code, Contact */}
          <div className="space-y-3 rounded-lg border border-border/70 p-3 bg-muted/20">
            <label className="text-xs font-medium text-foreground block">直达与体验链接</label>

            {/* 1. 产品链接 */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">产品链接</span>
              <Input
                placeholder="官网或体验 Demo 链接 (例如 https://...)"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="text-xs h-8 bg-background"
              />
            </div>

            {/* 2. 是否开源 & 源码地址 */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">源码地址</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {isOpenSource ? "已开源" : "是否开源"}
                  </span>
                  <Switch checked={isOpenSource} onCheckedChange={setIsOpenSource} size="sm" />
                </div>
              </div>
              <Input
                placeholder="源码地址 (GitHub / Gitee 链接，可选)"
                value={github}
                onChange={(e) => {
                  setGithub(e.target.value);
                  if (e.target.value.trim() && !isOpenSource) {
                    setIsOpenSource(true);
                  }
                }}
                className="text-xs h-8 bg-background"
              />
            </div>

            {/* 3. 联系信息 (建议telegram) */}
            <div className="space-y-1 pt-1">
              <span className="text-[11px] text-muted-foreground">联系信息 (建议 Telegram)</span>
              <Input
                placeholder="例如: https://t.me/username 或 @username、邮箱等"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                className="text-xs h-8 bg-background"
              />
            </div>
          </div>

          {/* Product Images (Max 9) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">作品图片 (最多 9 张)</label>
              <div className="flex items-center gap-2">
                {mediaFiles.length >= 2 && (
                  <div className="flex items-center rounded-md border border-border p-0.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setImageLayout("grid")}
                      className={`px-1.5 py-0.5 text-[10px] rounded flex items-center gap-1 transition-colors cursor-pointer ${
                        imageLayout === "grid"
                          ? "bg-background text-foreground shadow-xs font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Grid3X3 size={11} /> 网格
                    </button>
                    <button
                      type="button"
                      onClick={() => setImageLayout("carousel")}
                      className={`px-1.5 py-0.5 text-[10px] rounded flex items-center gap-1 transition-colors cursor-pointer ${
                        imageLayout === "carousel"
                          ? "bg-background text-foreground shadow-xs font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <SlidersHorizontal size={11} /> 轮播
                    </button>
                  </div>
                )}
                <span className="text-[11px] text-muted-foreground font-mono">{mediaFiles.length}/9 张</span>
              </div>
            </div>

            {/* Thumbnails grid */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {mediaFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group shadow-2xs"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.thumbnailUrl || file.url}
                    alt={file.name || `Screenshot ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="删除图片"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

              {mediaFiles.length < 9 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImages}
                  className="relative aspect-square rounded-lg border border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/60 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingImages ? (
                    <>
                      <Loader2 size={18} className="animate-spin text-primary" />
                      <span className="text-[10px]">上传中...</span>
                    </>
                  ) : (
                    <>
                      <div className="size-6 rounded-full bg-muted flex items-center justify-center">
                        <Plus size={14} />
                      </div>
                      <span className="text-[10px]">添加图片</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* Logo URL (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">图标 / Logo 链接 (可选)</label>
            <Input
              placeholder="https://... 或留空使用默认图标"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Submit & Cancel */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting || uploadingImages}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={submitting || uploadingImages} className="min-w-20">
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin mr-1" /> 发布中
                </>
              ) : (
                <>
                  <Rocket size={13} className="mr-1" /> 确认发布
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
