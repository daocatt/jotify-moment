"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPostAction } from "@/app/actions/posts";
import { toast } from "sonner";
import { Rocket, Plus, X, Loader2, Bot, Globe, Smartphone, Puzzle, Wrench } from "lucide-react";
import type { PostData } from "@/components/timeline-shell";

const PRESET_TECH_TAGS = [
  "Next.js",
  "React",
  "Cursor",
  "Cloudflare",
  "Tailwind",
  "DeepSeek",
  "Claude",
  "Python",
  "TypeScript",
  "Drizzle",
];

const CATEGORIES = [
  { id: "agent", label: "AI 助理", icon: Bot },
  { id: "web_app", label: "Web 应用", icon: Globe },
  { id: "mobile_app", label: "移动 App", icon: Smartphone },
  { id: "extension", label: "插件", icon: Puzzle },
  { id: "tool", label: "工具", icon: Wrench },
  { id: "other", label: "其他", icon: Rocket },
];

const STAGES = [
  { id: "vibe_coding", label: "🔨 Vibe Coding", desc: "正在敏捷孵化" },
  { id: "live", label: "🚀 已上架", desc: "正式可用发布" },
  { id: "beta", label: "🧪 Beta", desc: "抢先公开测试" },
  { id: "idea", label: "💡 构思", desc: "概念与灵感" },
];

interface ProductPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (post: PostData) => void;
}

export function ProductPublishModal({ isOpen, onClose, onSuccess }: ProductPublishModalProps) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState<string>("agent");
  const [status, setStatus] = useState<string>("vibe_coding");
  const [website, setWebsite] = useState("");
  const [github, setGithub] = useState("");
  const [bot, setBot] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [version, setVersion] = useState("");
  const [content, setContent] = useState("");

  const [techStack, setTechStack] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleTechTag = (tag: string) => {
    if (techStack.includes(tag)) {
      setTechStack(techStack.filter((t) => t !== tag));
    } else {
      setTechStack([...techStack, tag]);
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (!trimmed) return;
    if (!techStack.includes(trimmed)) {
      setTechStack([...techStack, trimmed]);
    }
    setCustomTagInput("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("请输入产品或助理名称");
      return;
    }
    if (!tagline.trim()) {
      toast.error("请输入一句话介绍");
      return;
    }

    setSubmitting(true);
    try {
      const finalContent = content.trim() || `${name.trim()} - ${tagline.trim()}`;
      const links: Record<string, string> = {};
      if (website.trim()) links.website = website.trim();
      if (github.trim()) links.github = github.trim();
      if (bot.trim()) links.bot = bot.trim();

      const res = await createPostAction({
        content: finalContent,
        mediaUrls: [],
        embedType: "product_showcase",
        embedMeta: {
          name: name.trim(),
          tagline: tagline.trim(),
          category,
          status,
          links,
          techStack,
          logoUrl: logoUrl.trim() || undefined,
          version: version.trim() || undefined,
        },
      });

      if ("error" in res && res.error) {
        toast.error(res.error);
      } else if ("post" in res && res.post) {
        toast.success("🚀 产品/助理已成功发布！");
        onSuccess(res.post as PostData);
        onClose();
        // Reset form
        setName("");
        setTagline("");
        setWebsite("");
        setGithub("");
        setBot("");
        setLogoUrl("");
        setVersion("");
        setContent("");
        setTechStack([]);
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
              <DialogTitle className="text-base sm:text-lg">发布作品 / AI 助理</DialogTitle>
              <DialogDescription className="text-xs">
                在朋友圈分享你的 Vibe Coding 孵化成果、AI Agent 或上架产品
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

          {/* Current Stage */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">当前阶段</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STAGES.map((s) => {
                const selected = status === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStatus(s.id)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/60 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    <div className="text-xs font-medium text-foreground">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Product Name & Version */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                产品 / 助理名称 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="例如: Pixel Ivy"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">版本号</label>
              <Input
                placeholder="v1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                maxLength={20}
              />
            </div>
          </div>

          {/* Slogan / Tagline */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              一句话介绍 (Slogan) <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="例如: 像素风格的桌面 AI 虚拟宠物伴侣"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={150}
              required
            />
          </div>

          {/* Links: Website, GitHub, Bot */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">直达与体验链接</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Input
                placeholder="官网 / 体验 Demo 链接"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="text-xs"
              />
              <Input
                placeholder="GitHub 源码地址"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                className="text-xs"
              />
              <Input
                placeholder="Telegram / Bot 链接"
                value={bot}
                onChange={(e) => setBot(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          {/* Tech Stack */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">技术栈与开发工具 (可选)</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TECH_TAGS.map((tag) => {
                const selected = techStack.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTechTag(tag)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono border transition-all cursor-pointer ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/60 text-muted-foreground border-border/70 hover:bg-muted"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {/* Custom Tag Input */}
            <div className="flex items-center gap-2 pt-1">
              <Input
                placeholder="添加其他技术栈或模型，按回车添加"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                className="h-8 text-xs flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCustomTag}
                className="h-8 text-xs shrink-0"
              >
                <Plus size={13} className="mr-0.5" /> 添加
              </Button>
            </div>

            {/* Display Selected Custom Tags */}
            {techStack.filter((t) => !PRESET_TECH_TAGS.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {techStack
                  .filter((t) => !PRESET_TECH_TAGS.includes(t))
                  .map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-primary/10 text-primary border border-primary/20"
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => toggleTechTag(t)}
                        className="hover:text-red-500 cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Logo URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">图标 / Logo 链接 (可选)</label>
            <Input
              placeholder="https://... 或填空使用默认图标"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="text-xs"
            />
          </div>

          {/* Content / Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">动态感想 / 更新说明</label>
            <Textarea
              placeholder="写写这次 Vibe Coding 的心路历程、实现了什么亮点，或者有什么想交流的..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          {/* Submit & Cancel */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="min-w-20">
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
