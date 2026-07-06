"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { updateProfileAction, changePasswordAction, getTelegramBotNameAction, generateTelegramBindTokenAction, unbindUserTelegramAction } from "@/app/actions/admin";
import { checkCustomDomainAvailabilityAction } from "@/app/actions/posts";
import { THEME_LIST } from "@/lib/theme-resolver";
import { Camera, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { ImageCropModal } from "@/components/image-crop-modal";

interface ProfileEditModalProps {
  user: {
    id?: string;
    name: string;
    slug: string | null;
    bio: string | null;
    avatar: string | null;
    coverImage: string | null;
    wechat: string | null;
    telegram: string | null;
    telegramChatId?: string | null;
    telegramBound?: boolean;
    telegramBindToken?: string | null;
    github: string | null;
    x: string | null;
    otherLink: string | null;
    theme?: string | null;
    customDomain?: string | null;
    allowCustomDomain?: boolean;
    role?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSlug?: string) => void;
}

export function ProfileEditModal({ user, isOpen, onClose, onSuccess }: ProfileEditModalProps) {
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

  const [tgBotName, setTgBotName] = useState<string | null>(null);
  const [tgBound, setTgBound] = useState(!!user.telegramChatId || !!user.telegramBound);
  const [tgBindToken, setTgBindToken] = useState(user.telegramBindToken || null);
  const [tgLoading, setTgLoading] = useState(false);

  const [globalCustomDomainsAllowed, setGlobalCustomDomainsAllowed] = useState(false);

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
      onSuccess();
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
          onSuccess();
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

  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [activeTab, setActiveTab] = useState("profile");
  const showTelegramTab = !!(tgBotName && user.role !== "guest");
  const showThemeTab = user.role !== "guest";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<"avatar" | "cover">("avatar");

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

  const handleCropConfirm = useCallback(async (croppedBlob: Blob) => {
    const setUploadProgress = cropTarget === "avatar" ? setUploadingAvatar : setUploadingCover;
    setUploadProgress(true);

    const file = new File([croppedBlob], `crop_${cropTarget}.jpg`, { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload?biz=profile", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
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
  }, [cropTarget, cropSrc]);

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
    });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("个人资料已更新");
      const newSlug = slug.trim();
      const oldSlug = user.slug;
      onSuccess(newSlug !== oldSlug ? newSlug : undefined);
      onClose();
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
      setActiveTab("profile");
      onSuccess();
      onClose();
    }
  };

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

      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑个人资料</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-3">
            <TabsList className="w-full flex flex-wrap gap-1 bg-muted p-1 rounded-lg">
              <TabsTrigger value="profile" className="flex-1 min-w-[70px]">基础资料</TabsTrigger>
              {showThemeTab && <TabsTrigger value="theme" className="flex-1 min-w-[70px]">主题</TabsTrigger>}
              {showTelegramTab && <TabsTrigger value="telegram" className="flex-1 min-w-[70px]">Telegram</TabsTrigger>}
              <TabsTrigger value="password" className="flex-1 min-w-[70px]">修改密码</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <form onSubmit={handleProfileSubmit} className="space-y-4 py-1">
                {user.role !== "guest" && (
                  <div className="relative h-32 w-full bg-muted rounded overflow-hidden group">
                    {coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                        无封面背景图
                      </div>
                    )}
                    <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                      {uploadingCover ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <Camera size={20} />
                          <span className="text-xs">更换背景</span>
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
                )}

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="relative h-16 w-16 rounded-none overflow-hidden bg-muted group border border-border shrink-0">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-muted-foreground font-medium text-lg">
                          {name.charAt(0)}
                        </div>
                      )}
                      {user.role !== "guest" && (
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white">
                          {uploadingAvatar ? (
                            <Loader2 className="animate-spin size-4" />
                          ) : (
                            <Camera size={14} />
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
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-normal text-muted-foreground">名字</label>
                      <Input
                        type="text"
                        placeholder="您的展示名字"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {user.role !== "guest" && (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-normal text-muted-foreground">个人简介</label>
                        <Textarea
                          placeholder="介绍一下你自己..."
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          rows={3}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-normal text-muted-foreground">主页路径</label>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground shrink-0">/</span>
                          <Input
                            type="text"
                            placeholder="昵称或自定义路径，支持中文"
                            value={slug}
                            maxLength={32}
                            onChange={(e) => setSlug(e.target.value)}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground">最大 32 位，留空则使用默认。修改后主页地址将变为 /你的路径</p>
                      </div>

                      {globalCustomDomainsAllowed && user.allowCustomDomain === true && (
                        <div className="space-y-1">
                          <label className="text-xs font-normal text-muted-foreground">自定义域名</label>
                          <Input
                            type="text"
                            placeholder="例如: moment.yourname.com"
                            value={customDomain}
                            onChange={(e) => setCustomDomain(e.target.value)}
                          />
                          <p className="text-[10px] text-muted-foreground">绑定并使用您自己的独立域名访问此主页。需提前将该域名 CNAME 解析至本站域名。</p>
                        </div>
                      )}

                      <div className="border-t border-border/60 pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">社交链接</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground">WeChat</label>
                            <Input
                              type="text"
                              placeholder="微信号"
                              value={wechat}
                              onChange={(e) => setWechat(e.target.value)}
                            />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground">Telegram</label>
                            <Input
                              type="text"
                              placeholder="用户名或链接"
                              value={telegram}
                              onChange={(e) => setTelegram(e.target.value)}
                            />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground">GitHub</label>
                            <Input
                              type="text"
                              placeholder="用户名或链接"
                              value={github}
                              onChange={(e) => setGithub(e.target.value)}
                            />
                          </div>
                          <div className="space-y-0.5">
                            <label className="text-[10px] text-muted-foreground">X (Twitter)</label>
                            <Input
                              type="text"
                              placeholder="用户名或链接"
                              value={x}
                              onChange={(e) => setX(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[10px] text-muted-foreground">其他链接</label>
                          <Input
                            type="text"
                            placeholder="个人网站或其他链接"
                            value={otherLink}
                            onChange={(e) => setOtherLink(e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <DialogFooter className="mt-4">
                  <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                    取消
                  </Button>
                  <Button type="submit" disabled={loading || uploadingAvatar || uploadingCover}>
                    {loading && <Loader2 className="mr-2 animate-spin size-4" />}
                    保存
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            {tgBotName && user.role !== "guest" && (
              <TabsContent value="telegram" className="space-y-4 py-2">
                <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">启用 Telegram 发帖</h3>
                    <p className="text-xs text-muted-foreground">
                      绑定 Telegram 后，你可以直接通过向机器人发送消息、图片、语音或视频来进行发帖同步。
                    </p>
                  </div>

                  {tgBound ? (
                    <div className="space-y-3 pt-2">
                      <div className="text-xs text-green-600 font-semibold flex items-center gap-1">
                        <CheckCircle size={14} /> 已绑定成功
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-950 border border-border p-3 rounded text-xs font-mono space-y-1">
                        <p>账号: @{telegram || "已绑定"}</p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={handleUnbindUserTelegram}
                        disabled={tgLoading}
                        className="text-xs text-red-600 border-red-500/20 hover:bg-red-50"
                      >
                        解除绑定
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="text-xs text-amber-600 font-semibold">
                        ● 未绑定
                      </div>

                      {tgBindToken ? (
                        <div className="space-y-3">
                          <div className="bg-zinc-50 dark:bg-zinc-950 border border-border p-3 rounded text-xs space-y-2">
                            <p className="font-semibold">绑定方式 1 (推荐)：</p>
                            <a
                              href={`https://t.me/${tgBotName}?start=${tgBindToken}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/80 font-medium"
                            >
                              🚀 一键打开 Telegram 绑定
                            </a>
                            
                            <p className="font-semibold pt-2">绑定方式 2 (手动)：</p>
                            <p className="text-muted-foreground text-[11px] leading-relaxed">
                              在 Telegram 搜索机器人 <span className="font-mono font-semibold text-foreground">@{tgBotName}</span>，然后向其发送：
                            </p>
                            <div className="bg-muted p-2 rounded text-[11px] font-mono break-all text-foreground select-all">
                              /start {tgBindToken}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={handleRefreshStatus}
                              disabled={tgLoading}
                              className="text-xs"
                            >
                              {tgLoading ? <Loader2 className="animate-spin size-3.5 mr-1" /> : null}
                              刷新绑定状态
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={handleGenerateBindToken}
                          disabled={tgLoading}
                          className="text-xs"
                        >
                          {tgLoading ? <Loader2 className="animate-spin size-3.5 mr-1" /> : null}
                          生成绑定链接与指令
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            <TabsContent value="password">
              <form onSubmit={handlePasswordSubmit} className="space-y-4 py-1">
                <div className="space-y-1">
                  <label className="text-xs font-normal text-muted-foreground">当前密码</label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? "text" : "password"}
                      placeholder="请输入当前密码"
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
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-normal text-muted-foreground">新密码</label>
                  <div className="relative">
                    <Input
                      type={showNew ? "text" : "password"}
                      placeholder="至少 8 位"
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
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-normal text-muted-foreground">确认新密码</label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      placeholder="再次输入新密码"
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
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <DialogFooter className="mt-4">
                  <Button type="button" variant="outline" onClick={onClose} disabled={passwordLoading}>
                    取消
                  </Button>
                  <Button type="submit" disabled={passwordLoading}>
                    {passwordLoading && <Loader2 className="mr-2 animate-spin size-4" />}
                    修改密码
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            {showThemeTab && (
              <TabsContent value="theme">
                <form onSubmit={handleProfileSubmit} className="space-y-4 py-3">
                  <div className="space-y-1 text-left">
                    <label className="text-sm font-medium text-foreground">选择主页个性化主题</label>
                    <p className="text-xs text-muted-foreground">
                      默认情况下（未选择）将使用全站设置的全局主题。您可以为自己的个人主页选择一个特定的主题。
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2.5 max-h-[40vh] overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => setSelectedTheme("")}
                      className={`flex items-center justify-between p-3 border rounded text-left transition-colors ${
                        selectedTheme === ""
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                      }`}
                    >
                      <div>
                        <div className="font-medium text-sm text-foreground">跟随全站默认</div>
                        <div className="text-xs text-muted-foreground mt-0.5">默认主题配置</div>
                      </div>
                    </button>

                    {THEME_LIST.map((themeItem) => (
                      <button
                        key={themeItem.id}
                        type="button"
                        onClick={() => setSelectedTheme(themeItem.id)}
                        className={`flex items-center justify-between p-3 border rounded text-left transition-colors ${
                          selectedTheme === themeItem.id
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-foreground">
                            {themeItem.name} <span className="text-[10px] text-muted-foreground font-normal">v{themeItem.version}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            作者: {themeItem.author} · 支持模式: {themeItem.features.supportedModes.join(", ")}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            顶图: {themeItem.features.showCoverImage ? "显示" : "隐藏"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                      取消
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      保存设置
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
