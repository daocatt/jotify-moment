"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { getUsersAction, getSettingsAction, getPendingPostsAction, updateSettingAction, updateUserStatusAction, updateUserRoleAction, approvePostAction, updateUserEmailAction, adminChangePasswordAction } from "@/app/actions/admin";
import { Shield, UserX, UserCheck, Settings, ShieldAlert, Loader2, CheckCircle, FileText, Mail, Key, Eye, EyeOff } from "lucide-react";

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    role: string;
  } | null;
  onRefresh: () => void;
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

export function AdminPanel({ isOpen, onClose, currentUser, onRefresh }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState("settings");
  const [loading, setLoading] = useState(false);
  const [usersList, setUsersList] = useState<Record<string, unknown>[]>([]);
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({
    allow_registration: "true",
    require_approval: "false",
  });

  const isSuperAdmin = currentUser?.role === "super_admin";

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, settingsRes, pendingRes] = await Promise.all([
        getUsersAction(),
        getSettingsAction(),
        getPendingPostsAction(),
      ]);

      if (usersRes.users) setUsersList(usersRes.users);
      if (settingsRes.settings) setSysSettings(settingsRes.settings);
      if (pendingRes.posts) setPendingPosts(pendingRes.posts as PendingPost[]);
    } catch {
      toast.error("加载管理数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadData();
    }
  }, [isOpen, loadData]);

  const handleToggleSetting = async (key: string, currentValue: string) => {
    const newValue = currentValue === "true" ? "false" : "true";

    setSysSettings((prev) => ({ ...prev, [key]: newValue }));

    const res = await updateSettingAction(key, newValue);
    if (res.error) {
      toast.error(res.error);
      setSysSettings((prev) => ({ ...prev, [key]: currentValue }));
    } else {
      toast.success("配置已更新");
      onRefresh();
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

  const handleChangeUserRole = async (userId: string, currentRole: string) => {
    if (!isSuperAdmin) return;

    const newRole = currentRole === "admin" ? "user" : "admin";
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
      onRefresh();
    }
  };

  const openEditor = (user: Record<string, unknown>) => {
    setEditingUserId(user.id as string);
    setEditEmail(user.email as string);
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="text-primary size-5" />
            系统控制台
          </DialogTitle>
        </DialogHeader>

        {loading && usersList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 flex-1">
            <Loader2 className="animate-spin text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">正在加载管理后台数据...</span>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col mt-2">
            <TabsList variant="line" className="w-full grid grid-cols-3 h-9 rounded-none p-0 gap-0 border-b border-border/60">
              <TabsTrigger value="settings" className="gap-1.5 rounded-none py-0">
                <Settings size={14} />
                <span className="text-xs">全局设置</span>
              </TabsTrigger>
              <TabsTrigger value="posts" className="gap-1.5 rounded-none py-0">
                <FileText size={14} />
                <span className="text-xs">审核队列</span>
                {pendingPosts.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[15px] h-[15px] px-1 text-[10px] rounded-full bg-amber-500 text-white font-bold leading-none">
                    {pendingPosts.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1.5 rounded-none py-0">
                <ShieldAlert size={14} />
                <span className="text-xs">用户管理</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="flex-1 overflow-y-auto py-4 space-y-6">
              <div className="rounded-lg border border-border p-4 bg-muted/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">允许新用户注册</h3>
                    <p className="text-xs text-muted-foreground">关闭后，除了超级管理员外，新用户无法进行自助注册</p>
                  </div>
                  <Switch
                    checked={sysSettings.allow_registration === "true"}
                    onCheckedChange={() => handleToggleSetting("allow_registration", sysSettings.allow_registration)}
                  />
                </div>

                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">普通用户发帖需要审核</h3>
                    <p className="text-xs text-muted-foreground">开启后，角色为普通用户的发帖需管理员审核通过才能在朋友圈公开展示</p>
                  </div>
                  <Switch
                    checked={sysSettings.require_approval === "true"}
                    onCheckedChange={() => handleToggleSetting("require_approval", sysSettings.require_approval)}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 bg-muted/20 text-xs text-muted-foreground space-y-2">
                <h4 className="font-bold text-foreground">Telegram Bot 接口说明</h4>
                <p>
                  您可以通过 Telegram Bot 发送文字、图片、语音，消息会自动同步发布至 Moment 中。
                </p>
                <div className="font-mono bg-background border border-border p-2 rounded overflow-x-auto text-[11px]">
                  Webhook URL: {"/api/telegram/webhook"}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="posts" className="flex-1 overflow-y-auto py-2">
              {pendingPosts.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  暂无待审核的帖子
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-3 border border-border rounded-lg bg-muted/20 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="size-6 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border text-xs font-semibold">
                          {post.user.avatar ? (
                            <img src={post.user.avatar} alt={post.user.name} className="h-full w-full object-cover" />
                          ) : (
                            post.user.name.charAt(0)
                          )}
                        </div>
                        <span className="font-semibold">{post.user.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(post.createdAt).toLocaleString("zh-CN")}
                        </span>
                      </div>
                      <p className="text-xs text-foreground/80 line-clamp-3 mb-3">{post.content}</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApprovePost(post.id)}
                        className="h-7 text-xs border-green-500/30 text-green-600 hover:bg-green-500/10"
                      >
                        <CheckCircle className="mr-1 size-3.5" /> 审核通过
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="users" className="flex-1 overflow-y-auto py-2">
              <div className="space-y-3">
                {usersList.map((user) => (
                  <div
                    key={user.id as string}
                    className="flex flex-col p-3 border border-border rounded-lg bg-muted/20 text-sm"
                  >
                    <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                        {user.avatar ? (
                          <img src={user.avatar as string} alt={user.name as string} className="h-full w-full object-cover" />
                        ) : (
                          <span className="font-semibold text-xs">{(user.name as string).charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{user.name as string}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            user.role === "super_admin"
                              ? "bg-red-500/10 text-red-500"
                              : user.role === "admin"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-neutral-500/10 text-neutral-500"
                          }`}>
                            {user.role === "super_admin" && "超级管理员"}
                            {user.role === "admin" && "管理员"}
                            {user.role === "user" && "普通用户"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">{user.email as string}</p>
                      </div>
                    </div>

                    {user.role !== "super_admin" && user.id !== currentUser?.id && (
                      <div className="flex gap-2">
                        {isSuperAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => handleChangeUserRole(user.id as string, user.role as string)}
                          >
                            设为{user.role === "admin" ? "普通" : "管理"}
                          </Button>
                        )}

                        <Button
                          variant={user.status === "active" ? "outline" : "destructive"}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleToggleUserStatus(user.id as string, user.status as string)}
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

                    {isSuperAdmin && user.id !== currentUser?.id && (
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
                            onClick={() => handleUpdateEmail(user.id as string)}
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
                            onClick={() => handleAdminChangePassword(user.id as string)}
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
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
