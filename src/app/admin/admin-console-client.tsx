"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  getUsersAction,
  getSettingsAction,
  getPendingPostsAction,
  updateSettingAction,
  updateUserStatusAction,
  updateUserRoleAction,
  approvePostAction,
  updateUserEmailAction,
  adminChangePasswordAction,
  getTelegramConfigAction,
  integrateTelegramAction,
  unbindTelegramAction,
} from "@/app/actions/admin";
import {
  Shield,
  UserX,
  UserCheck,
  Settings,
  ShieldAlert,
  Loader2,
  CheckCircle,
  FileText,
  Mail,
  Key,
  Eye,
  EyeOff,
  Send,
  RefreshCw,
  Trash2,
  ArrowLeft,
} from "lucide-react";

interface AdminConsoleClientProps {
  currentUser: {
    id: string;
    role: string;
  };
}

interface PendingPost {
  id: string;
  content: string;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    avatar: string | null;
  };
}

export function AdminConsoleClient({ currentUser }: AdminConsoleClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({
    allow_registration: "true",
    require_approval: "false",
  });

  // Telegram states
  const [tgBotName, setTgBotName] = useState("");
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgConfig, setTgConfig] = useState<Record<string, string>>({});
  const [tgActionLoading, setTgActionLoading] = useState(false);

  const isSuperAdmin = currentUser.role === "super_admin";

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, settingsRes, pendingRes, tgRes] = await Promise.all([
        getUsersAction(),
        getSettingsAction(),
        getPendingPostsAction(),
        getTelegramConfigAction(),
      ]);

      if (usersRes.users) setUsersList(usersRes.users);
      if (settingsRes.settings) setSysSettings(settingsRes.settings);
      if (pendingRes.posts) setPendingPosts(pendingRes.posts as PendingPost[]);
      
      if (tgRes.config) {
        setTgConfig(tgRes.config);
        setTgBotName(tgRes.config.telegram_bot_name || "");
        setTgBotToken(tgRes.config.telegram_bot_token || "");
      }
    } catch {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleSetting = async (key: string, currentValue: string) => {
    const newValue = currentValue === "true" ? "false" : "true";
    setSysSettings((prev) => ({ ...prev, [key]: newValue }));

    const res = await updateSettingAction(key, newValue);
    if (res.error) {
      toast.error(res.error);
      setSysSettings((prev) => ({ ...prev, [key]: currentValue }));
    } else {
      toast.success("配置已更新");
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    const res = await updateUserStatusAction(userId, newStatus);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(newStatus === "suspended" ? "用户已被封禁" : "用户已解除封禁");
      loadData();
    }
  };

  const handleChangeUserRole = async (userId: string, newRole: string) => {
    if (!isSuperAdmin) return;
    const res = await updateUserRoleAction(userId, newRole);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("用户角色已更新");
      loadData();
    }
  };

  const handleApprovePost = async (postId: string) => {
    const res = await approvePostAction(postId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("帖子审核已通过");
      setPendingPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  };

  const openEditor = (user: any) => {
    setEditingUserId(user.id);
    setEditEmail(user.email);
    setEditPassword("");
    setShowEditPassword(false);
  };

  const closeEditor = () => {
    setEditingUserId(null);
    setEditEmail("");
    setEditPassword("");
    setShowEditPassword(false);
  };

  const handleUpdateEmail = async (targetUserId: string) => {
    if (!editEmail.trim()) {
      toast.error("邮箱不能为空");
      return;
    }
    setEditLoading(true);
    const res = await updateUserEmailAction(targetUserId, editEmail);
    setEditLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("邮箱已更新");
      loadData();
    }
  };

  const handleAdminChangePassword = async (targetUserId: string) => {
    if (!editPassword) {
      toast.error("请输入新密码");
      return;
    }
    if (editPassword.length < 8) {
      toast.error("密码长度至少为 8 位");
      return;
    }
    setEditLoading(true);
    const res = await adminChangePasswordAction(targetUserId, editPassword);
    setEditLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("密码已重置");
      setEditPassword("");
      setShowEditPassword(false);
    }
  };

  // Telegram integrations
  const handleTelegramIntegrate = async () => {
    if (!tgBotName.trim() || !tgBotToken.trim()) {
      toast.error("请输入 Bot Name 和 Bot Token");
      return;
    }
    setTgActionLoading(true);
    const res = await integrateTelegramAction(tgBotName, tgBotToken, window.location.origin);
    setTgActionLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Telegram Bot 成功一键集成");
      loadData();
    }
  };

  const handleTelegramUnbind = async () => {
    if (!confirm("确认解绑并注销 Webhook 吗？")) return;
    setTgActionLoading(true);
    const res = await unbindTelegramAction();
    setTgActionLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("已成功解除 Telegram 绑定并注销 Webhook");
      setTgBotName("");
      setTgBotToken("");
      setTgConfig({});
      loadData();
    }
  };

  const isTgIntegrated = !!tgConfig.telegram_bot_token;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-zinc-900 border border-border rounded-2xl shadow-sm">
        <Loader2 className="animate-spin text-primary size-8 mb-3" />
        <span className="text-sm text-muted-foreground">正在加载控制台数据...</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="text-primary size-5" />
            <h1 className="text-lg font-bold text-foreground">系统控制台</h1>
          </div>
        </div>
        <span className="text-xs px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-muted-foreground">
          {currentUser.role === "super_admin" ? "超级管理员" : "管理员"}
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="px-6 pt-4">
          <TabsList className="inline-flex h-9 items-center justify-start rounded-lg bg-zinc-100/80 dark:bg-zinc-800/80 p-1 text-muted-foreground gap-1">
            <TabsTrigger
              value="settings"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <Settings size={13} />
              <span>常规设置</span>
            </TabsTrigger>
            <TabsTrigger
              value="telegram"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <Send size={13} />
              <span>Telegram 集成</span>
            </TabsTrigger>
            <TabsTrigger
              value="posts"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <FileText size={13} />
              <span>发帖审核 ({pendingPosts.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <ShieldAlert size={13} />
              <span>用户管理</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="p-6 flex-1 min-h-[400px]">
          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6 mt-0">
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">允许新用户注册</h3>
                  <p className="text-xs text-muted-foreground">关闭后，新用户无法自助注册账号</p>
                </div>
                <Switch
                  checked={sysSettings.allow_registration === "true"}
                  onCheckedChange={() => handleToggleSetting("allow_registration", sysSettings.allow_registration)}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">普通用户发帖需要审核</h3>
                  <p className="text-xs text-muted-foreground">开启后，普通用户的发帖需审核后才公开展示</p>
                </div>
                <Switch
                  checked={sysSettings.require_approval === "true"}
                  onCheckedChange={() => handleToggleSetting("require_approval", sysSettings.require_approval)}
                />
              </div>
            </div>
          </TabsContent>

          {/* Telegram Integration Tab */}
          <TabsContent value="telegram" className="space-y-6 mt-0">
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Telegram Bot 集成</h3>
                <p className="text-xs text-muted-foreground">配置此集成后，用户可以通过机器人发布消息</p>
              </div>

              <div className="grid gap-4 border-t border-border pt-4">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Bot Username (不含 @ 符号)</label>
                  <Input
                    placeholder="e.g. MyMomentBot"
                    value={tgBotName}
                    onChange={(e) => setTgBotName(e.target.value)}
                    disabled={isTgIntegrated}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Bot Token</label>
                  <Input
                    type="password"
                    placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={tgBotToken}
                    onChange={(e) => setTgBotToken(e.target.value)}
                  />
                </div>

                {isTgIntegrated && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-border text-xs space-y-2 mt-2 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-green-600">● 已成功一键集成</span>
                      <span className="text-[10px] text-muted-foreground">配置实时生效</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground break-all space-y-1">
                      <p>Webhook URL: {window.location.origin}/api/telegram/webhook</p>
                      <p>Secret Token: {tgConfig.telegram_webhook_secret?.slice(0, 8)}...</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  {!isTgIntegrated ? (
                    <Button
                      onClick={handleTelegramIntegrate}
                      disabled={tgActionLoading}
                      className="text-xs"
                    >
                      {tgActionLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-3.5 mr-1" />}
                      一键集成 Telegram Bot
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleTelegramIntegrate}
                        disabled={tgActionLoading}
                        className="text-xs text-blue-600 border-blue-500/20 hover:bg-blue-50"
                      >
                        <RefreshCw className="size-3.5 mr-1" />
                        更新配置 (重置 Webhook Token)
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleTelegramUnbind}
                        disabled={tgActionLoading}
                        className="text-xs text-red-600 border-red-500/20 hover:bg-red-50"
                      >
                        <Trash2 className="size-3.5 mr-1" />
                        解除绑定
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Post approval Tab */}
          <TabsContent value="posts" className="space-y-4 mt-0">
            {pendingPosts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                暂无待审核的帖子
              </div>
            ) : (
              <div className="space-y-3">
                {pendingPosts.map((post) => (
                  <div key={post.id} className="p-4 border border-border rounded-lg bg-muted/10 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="size-7 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border text-xs font-semibold">
                        {post.user.avatar ? (
                          <img src={post.user.avatar} alt={post.user.name} className="h-full w-full object-cover" />
                        ) : (
                          post.user.name.charAt(0)
                        )}
                      </div>
                      <span className="font-semibold">{post.user.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(post.createdAt).toLocaleString("zh-CN")}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 line-clamp-3 mb-3">{post.content}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleApprovePost(post.id)}
                      className="min-h-0 h-6 text-[10px] px-2 border-green-500/30 text-green-600 hover:bg-green-500/10 rounded-sm"
                    >
                      <CheckCircle className="mr-1 size-3" /> 审核通过
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-3 mt-0">
            <div className="space-y-3">
              {usersList.map((user) => (
                <div key={user.id} className="flex flex-col p-3 border border-border rounded-lg bg-muted/10 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="font-semibold text-xs">{user.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{user.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            user.role === "super_admin"
                              ? "bg-red-500/10 text-red-500"
                              : user.role === "admin"
                              ? "bg-blue-500/10 text-blue-500"
                              : user.role === "guest"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-neutral-500/10 text-neutral-500"
                          }`}>
                            {user.role === "super_admin" && "超级管理员"}
                            {user.role === "admin" && "管理员"}
                            {user.role === "user" && "普通用户"}
                            {user.role === "guest" && "访客"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>

                    {user.role !== "super_admin" && user.id !== currentUser.id && (
                      <div className="flex gap-2 items-center">
                        {isSuperAdmin && (
                          <select
                            value={user.role}
                            onChange={(e) => handleChangeUserRole(user.id, e.target.value)}
                            className="h-8 text-xs px-2 border border-border bg-background rounded-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="user">普通用户</option>
                            <option value="guest">访客</option>
                            <option value="admin">管理员</option>
                          </select>
                        )}

                        <Button
                          variant={user.status === "active" ? "outline" : "destructive"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleToggleUserStatus(user.id, user.status)}
                        >
                          {user.status === "active" ? (
                            <span className="flex items-center gap-1 text-red-500 hover:text-red-600">
                              <UserX size={12} /> 封禁
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <UserCheck size={12} /> 解封
                            </span>
                          )}
                        </Button>
                      </div>
                    )}

                    {isSuperAdmin && user.id !== currentUser.id && (
                      <div className="flex gap-2 ml-auto sm:ml-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => editingUserId === user.id ? closeEditor() : openEditor(user)}
                        >
                          {editingUserId === user.id ? "收起" : "编辑账号"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {editingUserId === user.id && (
                    <div className="mt-3 pt-3 border-t border-border space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs font-normal text-muted-foreground">邮箱</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type="email"
                              value={editEmail}
                              onChange={(e) => setEditEmail(e.target.value)}
                              className="h-8 text-xs pl-8"
                              placeholder="新邮箱"
                            />
                          </div>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={editLoading}
                            onClick={() => handleUpdateEmail(user.id)}
                          >
                            {editLoading ? <Loader2 className="size-3.5 animate-spin" /> : "保存邮箱"}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-normal text-muted-foreground">重置密码</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Key size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              type={showEditPassword ? "text" : "password"}
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              className="h-8 text-xs pl-8 pr-8"
                              placeholder="新密码（至少 8 位）"
                              minLength={8}
                            />
                            <button
                              type="button"
                              onClick={() => setShowEditPassword((v) => !v)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              tabIndex={-1}
                            >
                              {showEditPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={editLoading || !editPassword}
                            onClick={() => handleAdminChangePassword(user.id)}
                          >
                            重置密码
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
