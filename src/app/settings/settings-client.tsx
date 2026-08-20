"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  updateProfileAction,
  changePasswordAction,
  getTelegramBotNameAction,
  generateTelegramBindTokenAction,
  unbindUserTelegramAction,
  updatePrivacySettingsAction,
} from "@/app/actions/admin";
import { checkCustomDomainAvailabilityAction } from "@/app/actions/posts";
import { THEME_LIST } from "@/lib/theme-resolver";
import {
  getApiTokensAction,
  createApiTokenAction,
  revokeApiTokenAction,
  type ApiTokenItem,
} from "@/app/actions/api-tokens";
import {
  Camera,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle,
  ArrowLeft,
  User,
  Share2,
  Palette,
  Send,
  Lock,
  KeyRound,
  ExternalLink,
  Plus,
  Trash2,
  Copy,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImageCropModal } from "@/components/image-crop-modal";
import type { SessionUser } from "@/lib/auth";

function TokensSettingsPanel() {
  const [tokens, setTokens] = useState<ApiTokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [expiresDays, setExpiresDays] = useState<number>(0);
  const [creating, setCreating] = useState(false);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    const res = await getApiTokensAction();
    setLoading(false);
    if (res.success && res.tokens) {
      setTokens(res.tokens);
    } else if (res.error) {
      toast.error(res.error);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) {
      toast.error("请输入密钥名称");
      return;
    }

    setCreating(true);
    const res = await createApiTokenAction({
      name: tokenName.trim(),
      expiresInDays: expiresDays > 0 ? expiresDays : undefined,
    });
    setCreating(false);

    if (res.error) {
      toast.error(res.error);
    } else if (res.token) {
      setNewlyCreatedToken(res.token);
      setTokenName("");
      setExpiresDays(0);
      fetchTokens();
      toast.success("API 密钥已生成！");
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`确定要撤销密钥 "${name}" 吗？撤销后使用该密钥的 AI Agent 将无法继续访问。`)) {
      return;
    }
    const res = await revokeApiTokenAction(id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("密钥已成功撤销");
      setTokens((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已复制到剪贴板");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">API 密钥 (AI Agent / MCP)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            用于让 AI Agent（Antigravity、Claude Desktop、Dify、脚本）免交互上传配图和发布 Moment
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} size="sm" className="text-xs gap-1.5">
          <Plus size={14} />
          <span>创建新密钥</span>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="animate-spin size-5 mr-2" />
          <span className="text-xs">加载密钥列表中...</span>
        </div>
      ) : tokens.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center space-y-3 bg-muted/10">
          <KeyRound size={28} className="mx-auto text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">暂无活跃的 API 密钥</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            点击右上角「创建新密钥」生成 Token，可无缝接入 Claude Desktop、Cursor MCP 或自动化发帖机器人。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20 gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground truncate">{token.name}</span>
                  <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border">
                    {token.tokenPrefix}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    创建于 {new Date(token.createdAt).toLocaleDateString()}
                  </span>
                  {token.lastUsedAt ? (
                    <span>最后使用: {new Date(token.lastUsedAt).toLocaleString()}</span>
                  ) : (
                    <span>从未被使用</span>
                  )}
                  {token.expiresAt ? (
                    <span className="text-amber-600 dark:text-amber-500">
                      过期时间: {new Date(token.expiresAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-500">永久有效</span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRevoke(token.id, token.name)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs shrink-0"
              >
                <Trash2 size={14} className="mr-1" /> 撤销
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Create Token Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>创建 API 密钥</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">密钥名称 / 标识</label>
              <Input
                type="text"
                placeholder="例如: Claude Desktop, Dify Bot, My Python Script"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">有效期</label>
              <select
                value={expiresDays}
                onChange={(e) => setExpiresDays(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 text-foreground dark:bg-zinc-900"
              >
                <option value={0} className="bg-background text-foreground">永不过期 (推荐用于长期运行的 Agent)</option>
                <option value={7} className="bg-background text-foreground">7 天</option>
                <option value={30} className="bg-background text-foreground">30 天</option>
                <option value={90} className="bg-background text-foreground">90 天</option>
                <option value={365} className="bg-background text-foreground">1 年</option>
              </select>
            </div>

            <div className="rounded-md border border-border p-3 bg-muted/30 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 text-foreground font-medium">
                <ShieldCheck size={14} className="text-primary" />
                <span>默认已开通权限</span>
              </div>
              <p>• 发布 Moment 动态 (`posts:write`)</p>
              <p>• 上传多媒体配图与音视频 (`upload:write`)</p>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                disabled={creating}
              >
                取消
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="mr-2 animate-spin size-4" />}
                立即创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Newly Created Token Display Modal (Only Shown Once) */}
      <Dialog
        open={!!newlyCreatedToken}
        onOpenChange={(open) => {
          if (!open) setNewlyCreatedToken(null);
        }}
      >
        <DialogContent className="w-[92vw] sm:max-w-[480px] max-w-[480px] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle size={20} /> API 密钥创建成功
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 min-w-0">
            <p className="text-xs text-muted-foreground leading-relaxed">
              请立即复制并妥善保管您的密钥。出于安全考量，该明文 Token <strong className="text-foreground">仅展示一次</strong>，后续将无法再次查看！
            </p>

            <div className="w-full bg-zinc-900 dark:bg-zinc-950 border border-zinc-700 text-zinc-100 p-3 rounded-lg flex items-center justify-between gap-2 overflow-hidden">
              <span className="font-mono text-xs break-all select-all flex-1 min-w-0 leading-relaxed pr-2">
                {newlyCreatedToken}
              </span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => copyToClipboard(newlyCreatedToken || "")}
                className="shrink-0 text-xs h-8 px-2.5 gap-1 self-start"
              >
                <Copy size={13} /> 复制
              </Button>
            </div>

            <div className="w-full bg-amber-50 dark:bg-amber-950/30 border border-amber-500/20 text-amber-800 dark:text-amber-300 p-3 rounded-md text-[11px] space-y-1.5 overflow-hidden">
              <p className="font-semibold">使用指南：</p>
              <p>在 Agent 或 MCP 的环境变量中配置：</p>
              <div className="font-mono bg-amber-100/60 dark:bg-zinc-900 p-2 rounded text-[11px] break-all select-all border border-amber-300/30 dark:border-zinc-800">
                JOTIFY_API_TOKEN={newlyCreatedToken}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewlyCreatedToken(null)}>我已复制并妥善保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SettingsClientProps {
  user: SessionUser;
}

export function SettingsClient({ user }: SettingsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "profile";

  const [activeTab, setActiveTab] = useState(initialTab);

  // Profile Form States
  const [name, setName] = useState(user.name);
  const [slug, setSlug] = useState(user.slug || "");
  const [bio, setBio] = useState(user.bio || "");
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [coverImage, setCoverImage] = useState(user.coverImage || "");
  const [wechat, setWechat] = useState(user.wechat || "");
  const [telegram, setTelegram] = useState(user.telegram || "");
  const [github, setGithub] = useState(user.github || "");
  const [x, setX] = useState(user.x || "");
  const [otherLink, setOtherLink] = useState(user.otherLink || "");
  const [selectedTheme, setSelectedTheme] = useState(user.theme || "");
  const [customDomain, setCustomDomain] = useState(user.customDomain || "");
  const [publishToFeed, setPublishToFeed] = useState(user.publishToFeed !== false);
  const [publicHomepage, setPublicHomepage] = useState(user.publicHomepage !== false);

  const [loading, setLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Telegram States
  const [tgBotName, setTgBotName] = useState<string | null>(null);
  const [tgBound, setTgBound] = useState(!!user.telegramChatId);
  const [tgBindToken, setTgBindToken] = useState(user.telegramBindToken || null);
  const [tgLoading, setTgLoading] = useState(false);

  // Domain Config
  const [globalCustomDomainsAllowed, setGlobalCustomDomainsAllowed] = useState(false);

  // Password States
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Image Crop
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<"avatar" | "cover">("avatar");

  useEffect(() => {
    getTelegramBotNameAction().then((res) => {
      if (res.success && res.botName) {
        setTgBotName(res.botName);
      }
    });
    checkCustomDomainAvailabilityAction().then((res) => {
      if (res.success) {
        setGlobalCustomDomainsAllowed(res.allowed);
      }
    });
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: "avatar" | "cover") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件");
      return;
    }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCropTarget(target);
  };

  const handleCropConfirm = useCallback(
    async (croppedBlob: Blob) => {
      const setUploadProgress = cropTarget === "avatar" ? setUploadingAvatar : setUploadingCover;
      setUploadProgress(true);

      const file = new File([croppedBlob], `crop_${cropTarget}.jpg`, { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload?biz=profile", { method: "POST", body: formData });
        const data = await res.json();
        if (data.error) {
          toast.error(data.detail ? `${data.error}：${data.detail}` : data.error);
        } else {
          if (cropTarget === "avatar") {
            setAvatar(data.url);
          } else {
            setCoverImage(data.url);
          }
          toast.success("图片上传成功");
        }
      } catch {
        toast.error("上传图片失败");
      } finally {
        setUploadProgress(false);
        if (cropSrc) URL.revokeObjectURL(cropSrc);
        setCropSrc(null);
      }
    },
    [cropTarget, cropSrc]
  );

  const handleCropCancel = useCallback(() => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }, [cropSrc]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("名字不能为空");
      return;
    }

    setLoading(true);
    const res = await updateProfileAction({
      name,
      slug,
      bio,
      avatar,
      coverImage,
      wechat,
      telegram,
      github,
      x,
      otherLink,
      theme: selectedTheme || "",
      customDomain: customDomain || "",
      publishToFeed,
      publicHomepage,
    });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("个人资料已更新");
      router.refresh();
    }
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishLoading(true);
    const res = await updatePrivacySettingsAction({ publishToFeed, publicHomepage });
    setPublishLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("发布设置已更新");
      router.refresh();
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("请填写完整表单项");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("新密码长度至少为 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("两次输入的新密码不一致");
      return;
    }

    setPasswordLoading(true);
    const res = await changePasswordAction({ currentPassword, newPassword });
    setPasswordLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("密码已成功修改");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      router.refresh();
    }
  };

  const handleGenerateBindToken = async () => {
    setTgLoading(true);
    const res = await generateTelegramBindTokenAction();
    setTgLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else if (res.bindToken) {
      setTgBindToken(res.bindToken);
      toast.success("Token 生成成功");
    }
  };

  const handleUnbindUserTelegram = async () => {
    if (!confirm("确认解绑 Telegram 吗？")) return;
    setTgLoading(true);
    const res = await unbindUserTelegramAction();
    setTgLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("解绑成功");
      setTgBound(false);
      setTelegram("");
      router.refresh();
    }
  };

  const handleRefreshStatus = async () => {
    setTgLoading(true);
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user?.telegramBound) {
          setTgBound(true);
          setTelegram(data.user.telegram || "");
          toast.success("绑定成功！已检测到 Telegram 连接。");
          router.refresh();
        } else {
          toast.error("未检测到绑定，请确认已在 Telegram 发送 /start。");
        }
      }
    } catch {
      toast.error("检测失败，请稍后重试");
    } finally {
      setTgLoading(false);
    }
  };

  const tabs = [
    { id: "profile", label: "基本资料", icon: User },
    ...(user.role !== "guest" ? [{ id: "publish", label: "发布与隐私", icon: Share2 }] : []),
    ...(user.role !== "guest" ? [{ id: "theme", label: "个性主题", icon: Palette }] : []),
    ...(tgBotName && user.role !== "guest" ? [{ id: "telegram", label: "Telegram 机器人", icon: Send }] : []),
    { id: "tokens", label: "API 密钥 (AI Agent)", icon: KeyRound },
    { id: "password", label: "账号与密码", icon: Lock },
  ];

  return (
    <>
      <ImageCropModal
        isOpen={!!cropSrc}
        imageSrc={cropSrc}
        aspect={cropTarget === "cover" ? 1.8 : 1}
        title={cropTarget === "cover" ? "裁剪封面图 (1.8:1)" : "裁剪头像 (1:1)"}
        onConfirm={handleCropConfirm}
        onCancel={handleCropCancel}
      />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href={user.slug ? `/u/${user.slug}` : "/"}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              title="返回"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">个人设置</h1>
              <p className="text-xs text-muted-foreground mt-0.5">管理您的个人资料、API 密钥与偏好配置</p>
            </div>
          </div>
          {user.slug && (
            <Link
              href={`/u/${user.slug}`}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            >
              <span>查看主页</span>
              <ExternalLink size={12} />
            </Link>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar Tabs */}
          <div className="md:col-span-1 flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap text-left ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Content Area */}
          <div className="md:col-span-3">
            <div className="bg-card border border-border/70 rounded-xl p-5 md:p-6 shadow-sm">
              {/* Tab 1: Profile */}
              {activeTab === "profile" && (
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">基础资料</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">设置展示给访客的名字、头像与简介</p>
                  </div>

                  {user.role !== "guest" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">主页封面背景</label>
                      <div className="relative h-36 w-full bg-muted rounded-lg overflow-hidden group border border-border/80">
                        {coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                            无封面背景图
                          </div>
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                          {uploadingCover ? (
                            <Loader2 className="animate-spin size-5" />
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <Camera size={20} />
                              <span className="text-xs font-medium">更换封面</span>
                            </div>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleFileSelect(e, "cover")}
                            disabled={uploadingCover}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    <div className="relative size-16 rounded-xl overflow-hidden bg-muted group border border-border shrink-0 shadow-sm">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground font-semibold text-xl">
                          {name.charAt(0)}
                        </div>
                      )}
                      {user.role !== "guest" && (
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                          {uploadingAvatar ? (
                            <Loader2 className="animate-spin size-4" />
                          ) : (
                            <Camera size={16} />
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleFileSelect(e, "avatar")}
                            disabled={uploadingAvatar}
                          />
                        </label>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <label className="text-xs font-medium text-foreground">展示昵称</label>
                      <Input
                        type="text"
                        placeholder="输入展示的名字"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {user.role !== "guest" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">个人简介 (Bio)</label>
                        <Textarea
                          placeholder="写几句话介绍一下你自己..."
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={3}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">主页专属路径 (Slug)</label>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground font-mono px-2 py-1.5 bg-muted rounded border border-border">/u/</span>
                          <Input
                            type="text"
                            placeholder="自定义路径（例如: mengdoo）"
                            value={slug}
                            maxLength={32}
                            onChange={(e) => setSlug(e.target.value)}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground">主页地址将显示为 /u/你的路径，支持中文及字母数字。</p>
                      </div>

                      {globalCustomDomainsAllowed && user.allowCustomDomain === true && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">独立自定义域名</label>
                          <Input
                            type="text"
                            placeholder="例如: moment.yourdomain.com"
                            value={customDomain}
                            onChange={(e) => setCustomDomain(e.target.value)}
                          />
                          <p className="text-[11px] text-muted-foreground">需提前将该域名的 CNAME 解析至本站服务器。</p>
                        </div>
                      )}

                      <div className="border-t border-border/80 pt-4 space-y-3">
                        <h3 className="text-xs font-semibold text-foreground">社交网络与链接</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">微信 (WeChat)</label>
                            <Input
                              type="text"
                              placeholder="微信号"
                              value={wechat}
                              onChange={(e) => setWechat(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">Telegram</label>
                            <Input
                              type="text"
                              placeholder="用户名或链接"
                              value={telegram}
                              onChange={(e) => setTelegram(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">GitHub</label>
                            <Input
                              type="text"
                              placeholder="GitHub 用户名或链接"
                              value={github}
                              onChange={(e) => setGithub(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-muted-foreground">X (Twitter)</label>
                            <Input
                              type="text"
                              placeholder="X 用户名或链接"
                              value={x}
                              onChange={(e) => setX(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">个人网站 / Blog</label>
                          <Input
                            type="text"
                            placeholder="https://..."
                            value={otherLink}
                            onChange={(e) => setOtherLink(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={loading || uploadingAvatar || uploadingCover}>
                      {loading && <Loader2 className="mr-2 animate-spin size-4" />}
                      保存基础资料
                    </Button>
                  </div>
                </form>
              )}

              {/* Tab 2: Publish & Privacy */}
              {activeTab === "publish" && (
                <form onSubmit={handlePublishSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">发布与可见性隐私</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">控制您的动态在全站与个人主页中的展示方式</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
                      <div className="space-y-0.5 pr-4">
                        <p className="text-xs font-semibold text-foreground">是否公开个人主页</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          关闭后，外部访客访问您的主页时只能看到基础名片，您发布的动态（包括置顶）将被隐藏。
                        </p>
                      </div>
                      <Switch checked={publicHomepage} onCheckedChange={setPublicHomepage} />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/20">
                      <div className="space-y-0.5 pr-4">
                        <p className="text-xs font-semibold text-foreground">同步发布至全站公共流 (Feed)</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          关闭后，新发布的动态不会出现在首页公共时间线中（私密/专属空间模式），仅在个人主页展示。
                        </p>
                      </div>
                      <Switch checked={publishToFeed} onCheckedChange={setPublishToFeed} />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={publishLoading}>
                      {publishLoading && <Loader2 className="mr-2 animate-spin size-4" />}
                      保存发布设置
                    </Button>
                  </div>
                </form>
              )}

              {/* Tab 3: Themes */}
              {activeTab === "theme" && (
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">主页个性化主题</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">为您的个人主页选择独立的外观主题风格</p>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => setSelectedTheme("")}
                      className={`flex items-center justify-between p-3.5 border rounded-lg text-left transition-all ${
                        selectedTheme === ""
                          ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm text-foreground">跟随全站默认配置</div>
                        <div className="text-xs text-muted-foreground mt-0.5">使用站点管理员设定的统一主题</div>
                      </div>
                    </button>

                    {THEME_LIST.map((themeItem) => (
                      <button
                        key={themeItem.id}
                        type="button"
                        onClick={() => setSelectedTheme(themeItem.id)}
                        className={`flex items-center justify-between p-3.5 border rounded-lg text-left transition-all ${
                          selectedTheme === themeItem.id
                            ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary"
                            : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground">
                            {themeItem.name} <span className="text-[10px] text-muted-foreground font-normal">v{themeItem.version}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            作者: {themeItem.author} · 模式: {themeItem.features.supportedModes.join(", ")}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            顶部封面: {themeItem.features.showCoverImage ? "显示" : "隐藏"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={loading}>
                      {loading && <Loader2 className="mr-2 animate-spin size-4" />}
                      应用主题
                    </Button>
                  </div>
                </form>
              )}

              {/* Tab 4: Telegram */}
              {activeTab === "telegram" && tgBotName && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Telegram 机器人同步</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">直接向 Telegram 机器人发送文字、图片或语音同步发布动态</p>
                  </div>

                  <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
                    {tgBound ? (
                      <div className="space-y-3">
                        <div className="text-xs text-green-600 font-semibold flex items-center gap-1.5">
                          <CheckCircle size={15} /> 已成功绑定 Telegram
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-950 border border-border p-3 rounded-md text-xs font-mono">
                          绑定账号: @{telegram || "已绑定"}
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleUnbindUserTelegram}
                          disabled={tgLoading}
                          className="text-xs text-red-600 border-red-500/20 hover:bg-red-50 dark:hover:bg-red-950/20"
                        >
                          解除绑定
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="text-xs text-amber-600 font-medium flex items-center gap-1.5">
                          ● 当前未绑定 Telegram 账号
                        </div>

                        {tgBindToken ? (
                          <div className="space-y-3">
                            <div className="bg-zinc-50 dark:bg-zinc-950 border border-border p-3.5 rounded-lg text-xs space-y-2.5">
                              <p className="font-semibold text-foreground">绑定方式 1 (推荐)：</p>
                              <a
                                href={`https://t.me/${tgBotName}?start=${tgBindToken}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3.5 py-2 rounded-md hover:bg-primary/90 font-medium transition-colors"
                              >
                                🚀 打开 Telegram 自动发送 /start
                              </a>

                              <p className="font-semibold text-foreground pt-2">绑定方式 2 (手动发送)：</p>
                              <p className="text-muted-foreground text-[11px] leading-relaxed">
                                在 Telegram 搜索机器人 <span className="font-mono font-semibold text-foreground">@{tgBotName}</span>，向其发送命令：
                              </p>
                              <div className="bg-muted p-2.5 rounded text-[11px] font-mono break-all text-foreground select-all border border-border">
                                /start {tgBindToken}
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              onClick={handleRefreshStatus}
                              disabled={tgLoading}
                              className="text-xs"
                            >
                              {tgLoading && <Loader2 className="animate-spin size-3.5 mr-1" />}
                              刷新绑定状态
                            </Button>
                          </div>
                        ) : (
                          <Button onClick={handleGenerateBindToken} disabled={tgLoading} className="text-xs">
                            {tgLoading && <Loader2 className="animate-spin size-3.5 mr-1" />}
                            生成 Telegram 绑定令牌
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 5: Tokens */}
              {activeTab === "tokens" && (
                <TokensSettingsPanel />
              )}

              {/* Tab 6: Password */}
              {activeTab === "password" && (
                <form onSubmit={handlePasswordSubmit} className="space-y-5">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">修改登录密码</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">定期更新密码以保证账号安全</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">当前旧密码</label>
                    <div className="relative">
                      <Input
                        type={showCurrent ? "text" : "password"}
                        placeholder="输入当前使用的密码"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrent((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none"
                        tabIndex={-1}
                      >
                        {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">新密码</label>
                    <div className="relative">
                      <Input
                        type={showNew ? "text" : "password"}
                        placeholder="长度至少 8 位"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        minLength={8}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none"
                        tabIndex={-1}
                      >
                        {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">确认新密码</label>
                    <div className="relative">
                      <Input
                        type={showConfirm ? "text" : "password"}
                        placeholder="再次输入新密码以确认"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground outline-none"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={passwordLoading}>
                      {passwordLoading && <Loader2 className="mr-2 animate-spin size-4" />}
                      更新密码
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
