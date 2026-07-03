"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  updateUserCustomDomainPermissionAction,
  approvePostAction,
  updateUserEmailAction,
  adminChangePasswordAction,
  getTelegramConfigAction,
  integrateTelegramAction,
  unbindTelegramAction,
  getResendConfigAction,
  saveResendConfigAction,
  deleteResendConfigAction,
  getStorageConfigAction,
  saveStorageConfigAction,
  updateFaviconAction,
  unlockLoginAction,
  adminCreateUserAction,
} from "@/app/actions/admin";
import { THEME_LIST } from "@/lib/theme-resolver";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";

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
  Upload,
  Cloud,
  LockOpen,
  HardDrive,
  ImagePlus,
  MessageSquare,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getAdminCommentsAction, toggleCommentVisibilityAction, deleteCommentAction } from "@/app/actions/comments";


interface AdminConsoleClientProps {
  currentUser: {
    id: string;
    role: string;
  };
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  slug: string | null;
  avatar: string | null;
  bio: string | null;
  role: "super_admin" | "admin" | "user" | "guest";
  status: "active" | "suspended";
  loginDisabledAt: Date | null;
  createdAt: Date;
  customDomain: string | null;
  allowCustomDomain: boolean;
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
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const usersCursorRef = useRef<string | null>(null);
  const usersSentinelRef = useRef<HTMLDivElement | null>(null);
  const [pendingPosts, setPendingPosts] = useState<PendingPost[]>([]);
  const [faviconUrl, setFaviconUrl] = useState("");
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({
    allow_registration: "true",
    require_approval: "false",
    global_theme: "default",
    allow_custom_domains: "true",
  });

  // Telegram states
  const [tgBotName, setTgBotName] = useState("");
  const [tgBotToken, setTgBotToken] = useState("");
  const [tgConfig, setTgConfig] = useState<Record<string, string>>({});
  const [tgActionLoading, setTgActionLoading] = useState(false);

  // Resend states
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendDomain, setResendDomain] = useState("");
  const [resendFromName, setResendFromName] = useState("");
  const [resendFromEmailPrefix, setResendFromEmailPrefix] = useState("");
  const [resendConfig, setResendConfig] = useState<Record<string, string>>({});
  const [resendActionLoading, setResendActionLoading] = useState(false);

  // Storage states
  const [storageMode, setStorageMode] = useState<"local" | "s3">("local");
  const [storageMaxSize, setStorageMaxSize] = useState("50");
  const [storageExtensions, setStorageExtensions] = useState("jpg,jpeg,png,gif,webp,mp4,webm,mp3,wav,ogg,m4a");
  const [s3AccessKeyId, setS3AccessKeyId] = useState("");
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState("");
  const [s3BucketName, setS3BucketName] = useState("");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Region, setS3Region] = useState("auto");
  const [s3PublicUrl, setS3PublicUrl] = useState("");
  const [storageActionLoading, setStorageActionLoading] = useState(false);

  // Comments tab states
  const [commentsList, setCommentsList] = useState<any[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsPage, setCommentsPage] = useState(1);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const isSuperAdmin = currentUser.role === "super_admin";

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editAllowCustomDomain, setEditAllowCustomDomain] = useState(false);
  const [editRole, setEditRole] = useState<"admin" | "user" | "guest">("user");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newAllowDomain, setNewAllowDomain] = useState(false);
  const [newRole, setNewRole] = useState<"admin" | "user" | "guest">("user");
  const [createLoading, setCreateLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, settingsRes, pendingRes, tgRes, resendRes, storageRes] = await Promise.all([
        getUsersAction(),
        getSettingsAction(),
        getPendingPostsAction(),
        getTelegramConfigAction(),
        getResendConfigAction(),
        getStorageConfigAction(),
      ]);

      if (usersRes.users) {
        setUsersList(usersRes.users);
        usersCursorRef.current = usersRes.nextCursor ?? null;
        setUsersHasMore(usersRes.hasMore ?? false);
      }
      if (settingsRes.settings) {
        setSysSettings(settingsRes.settings);
        setFaviconUrl(settingsRes.settings.site_favicon || "");
      }
      if (pendingRes.posts) setPendingPosts(pendingRes.posts as PendingPost[]);
      
      if (tgRes.config) {
        setTgConfig(tgRes.config);
        setTgBotName(tgRes.config.telegram_bot_name || "");
        setTgBotToken(tgRes.config.telegram_bot_token || "");
      }

      if (resendRes.config) {
        setResendConfig(resendRes.config);
        setResendApiKey(resendRes.config.resend_api_key || "");
        const dom = resendRes.config.resend_domain || "";
        setResendDomain(dom);
        setResendFromName(resendRes.config.resend_from_name || "");
        const fullEmail = resendRes.config.resend_from_email || "";
        if (fullEmail && dom) {
          const prefix = fullEmail.split(`@${dom}`)[0] || "";
          setResendFromEmailPrefix(prefix);
        } else {
          setResendFromEmailPrefix("");
        }
      }

      if (storageRes.config) {
        setStorageMode((storageRes.config.storage_mode as "local" | "s3") || "local");
        setStorageMaxSize(storageRes.config.storage_max_file_size_mb || "50");
        setStorageExtensions(storageRes.config.storage_allowed_extensions || "jpg,jpeg,png,gif,webp,mp4,webm,mp3,wav,ogg,m4a");
        setS3AccessKeyId(storageRes.config.storage_s3_access_key_id || "");
        setS3SecretAccessKey(storageRes.config.storage_s3_secret_access_key || "");
        setS3BucketName(storageRes.config.storage_s3_bucket_name || "");
        setS3Endpoint(storageRes.config.storage_s3_endpoint || "");
        setS3Region(storageRes.config.storage_s3_region || "auto");
        setS3PublicUrl(storageRes.config.storage_s3_public_url || "");
      }
    } catch {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchComments = useCallback(async (pageToLoad: number) => {
    setCommentsLoading(true);
    const res = await getAdminCommentsAction(pageToLoad, 20);
    setCommentsLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else if (res.comments) {
      setCommentsList(res.comments);
      setCommentsTotal(res.total || 0);
      setCommentsPage(pageToLoad);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "comments") {
      fetchComments(1);
    }
  }, [activeTab, fetchComments]);

  const handleAdminToggleCommentVisibility = async (commentId: string, currentStatus: string) => {
    const isHidden = currentStatus === "hidden";
    const res = await toggleCommentVisibilityAction(commentId, !isHidden);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(isHidden ? "已取消隐藏" : "已隐藏该评论");
      fetchComments(commentsPage);
    }
  };

  const handleAdminDeleteComment = async (commentId: string) => {
    if (!confirm("确定要删除这条评论吗？")) return;
    const res = await deleteCommentAction(commentId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("评论已彻底删除");
      if (commentsList.length === 1 && commentsPage > 1) {
        fetchComments(commentsPage - 1);
      } else {
        fetchComments(commentsPage);
      }
    }
  };

  const loadMoreUsers = useCallback(async () => {
    if (usersLoadingMore || !usersHasMore) return;
    setUsersLoadingMore(true);
    const res = await getUsersAction(usersCursorRef.current ?? undefined);
    setUsersLoadingMore(false);
    if (res.users) {
      setUsersList((prev) => [...prev, ...res.users]);
      usersCursorRef.current = res.nextCursor ?? null;
      setUsersHasMore(res.hasMore ?? false);
    }
  }, [usersLoadingMore, usersHasMore]);

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("只能上传图片文件");
      return;
    }
    setFaviconUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload?biz=profile", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        const saveRes = await updateFaviconAction(data.url);
        if (saveRes.error) {
          toast.error(saveRes.error);
        } else {
          setFaviconUrl(data.url);
          toast.success("图标已更新，刷新页面即可生效");
        }
      }
    } catch {
      toast.error("图标上传失败");
    } finally {
      setFaviconUploading(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!usersSentinelRef.current || !usersHasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreUsers();
      },
      { threshold: 0 }
    );
    observer.observe(usersSentinelRef.current);
    return () => observer.disconnect();
  }, [loadMoreUsers, usersHasMore]);

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

  const handleSaveGlobalTheme = async (themeId: string) => {
    const prevTheme = sysSettings.global_theme || "default";
    setSysSettings((prev) => ({ ...prev, global_theme: themeId }));

    const res = await updateSettingAction("global_theme", themeId);
    if (res.error) {
      toast.error(res.error);
      setSysSettings((prev) => ({ ...prev, global_theme: prevTheme }));
    } else {
      toast.success("全局默认主题已更新");
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

  const handleUnlockLogin = async (userId: string) => {
    const res = await unlockLoginAction(userId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("已解锁登录");
      loadData();
    }
  };

  const handleToggleUserCustomDomainPermission = async (userId: string, currentAllowed: boolean) => {
    const res = await updateUserCustomDomainPermissionAction(userId, !currentAllowed);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(!currentAllowed ? "已启用该用户的自定义域名权限" : "已禁用该用户的自定义域名权限");
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

  const openEditor = (user: AdminUser) => {
    setEditingUser(user);
    setEditEmail(user.email);
    setEditPassword("");
    setEditAllowCustomDomain(user.allowCustomDomain);
    setEditRole(user.role === "super_admin" ? "admin" : user.role);
    setShowEditPassword(false);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setEditLoading(true);
    try {
      const errors: string[] = [];
      const successLabels: string[] = [];

      if (editEmail.trim() && editEmail.trim() !== editingUser.email) {
        const res = await updateUserEmailAction(editingUser.id, editEmail.trim());
        if (res.error) {
          errors.push(`邮箱: ${res.error}`);
        } else {
          successLabels.push("邮箱");
        }
      }

      if (editPassword) {
        if (editPassword.length < MIN_PASSWORD_LENGTH) {
          errors.push(`密码长度至少为 ${MIN_PASSWORD_LENGTH} 位`);
        } else {
          const res = await adminChangePasswordAction(editingUser.id, editPassword);
          if (res.error) {
            errors.push(`密码: ${res.error}`);
          } else {
            successLabels.push("密码");
          }
        }
      }

      if (editAllowCustomDomain !== editingUser.allowCustomDomain) {
        const res = await updateUserCustomDomainPermissionAction(editingUser.id, editAllowCustomDomain);
        if (res.error) {
          errors.push(`自定义域名: ${res.error}`);
        } else {
          successLabels.push("自定义域名");
        }
      }

      if (editRole !== editingUser.role) {
        const res = await updateUserRoleAction(editingUser.id, editRole);
        if (res.error) {
          errors.push(`角色: ${res.error}`);
        } else {
          successLabels.push("角色");
        }
      }

      if (errors.length > 0) {
        toast.error(errors.join("；"));
      }

      if (successLabels.length > 0) {
        if (errors.length === 0) {
          toast.success("用户信息已更新");
          setEditingUser(null);
        } else {
          toast.success(`已更新: ${successLabels.join("、")}`);
        }
        loadData();
      } else if (errors.length === 0) {
        toast.success("没有需要更新的内容");
        setEditingUser(null);
      }
    } catch {
      toast.error("更新失败，请稍后重试");
    } finally {
      setEditLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail.trim() || !newPassword) {
      toast.error("邮箱和密码不能为空");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(`密码长度至少为 ${MIN_PASSWORD_LENGTH} 位`);
      return;
    }
    setCreateLoading(true);
    const res = await adminCreateUserAction({
      email: newEmail,
      password: newPassword,
      allowCustomDomain: newAllowDomain,
      role: newRole,
    });
    setCreateLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("用户创建成功");
      setCreateUserOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewAllowDomain(false);
      setNewRole("user");
      loadData();
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

  // Resend integrations
  const handleResendSave = async () => {
    if (!resendApiKey.trim() || !resendDomain.trim() || !resendFromName.trim() || !resendFromEmailPrefix.trim()) {
      toast.error("请输入所有配置项");
      return;
    }
    const fullFromEmail = `${resendFromEmailPrefix}@${resendDomain}`;
    setResendActionLoading(true);
    const res = await saveResendConfigAction(resendApiKey, resendDomain, resendFromName, fullFromEmail);
    setResendActionLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Resend 配置保存成功");
      loadData();
    }
  };

  const handleResendDelete = async () => {
    if (!confirm("确认清除 Resend 配置吗？")) return;
    setResendActionLoading(true);
    const res = await deleteResendConfigAction();
    setResendActionLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Resend 配置已成功清除");
      setResendApiKey("");
      setResendDomain("");
      setResendFromName("");
      setResendFromEmailPrefix("");
      setResendConfig({});
      loadData();
    }
  };

  const isTgIntegrated = !!tgConfig.telegram_bot_token;
  const isResendIntegrated = !!resendConfig.resend_api_key;

  const handleStorageSave = async () => {
    if (storageMode === "s3") {
      if (!s3AccessKeyId.trim() || !s3SecretAccessKey.trim() || !s3BucketName.trim()) {
        toast.error("S3 模式需要填写 Access Key ID、Secret Access Key 和 Bucket Name");
        return;
      }
    }

    const mb = parseInt(storageMaxSize, 10);
    if (isNaN(mb) || mb < 1 || mb > 500) {
      toast.error("文件大小限制必须在 1-500 MB 之间");
      return;
    }

    if (!storageExtensions.trim()) {
      toast.error("请至少配置一个允许的文件后缀");
      return;
    }

    setStorageActionLoading(true);
    const res = await saveStorageConfigAction({
      mode: storageMode,
      maxFileSizeMB: storageMaxSize,
      allowedExtensions: storageExtensions,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3BucketName,
      s3Endpoint,
      s3Region,
      s3PublicUrl,
    });
    setStorageActionLoading(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("上传配置保存成功");
      loadData();
    }
  };

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
              value="resend"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <Mail size={13} />
              <span>Resend 集成</span>
            </TabsTrigger>
            <TabsTrigger
              value="storage"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <Upload size={13} />
              <span>上传配置</span>
            </TabsTrigger>
            <TabsTrigger
              value="users"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <ShieldAlert size={13} />
              <span>用户管理</span>
            </TabsTrigger>
            <TabsTrigger
              value="posts"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <FileText size={13} />
              <span>发帖审核 ({pendingPosts.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="comments"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-foreground data-[state=active]:shadow-sm gap-1.5"
            >
              <MessageSquare size={13} />
              <span>评论管理</span>
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

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">全局默认主题</h3>
                  <p className="text-xs text-muted-foreground">设置全站默认使用的显示主题</p>
                </div>
                <select
                  value={sysSettings.global_theme || "default"}
                  onChange={(e) => handleSaveGlobalTheme(e.target.value)}
                  className="px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {THEME_LIST.map((themeItem) => (
                    <option key={themeItem.id} value={themeItem.id}>
                      {themeItem.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">允许自定义域名</h3>
                  <p className="text-xs text-muted-foreground">开启后，拥有主页的用户可以绑定并使用自己的独立域名访问个人主页</p>
                </div>
                <Switch
                  checked={sysSettings.allow_custom_domains === "true"}
                  onCheckedChange={() => handleToggleSetting("allow_custom_domains", sysSettings.allow_custom_domains)}
                />
              </div>

              <div className="flex items-center justify-between border-t border-border pt-4">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-semibold">站点图标 (Favicon)</h3>
                  <p className="text-xs text-muted-foreground">建议上传正方形图片，用于浏览器标签页图标</p>
                </div>
                <div className="flex items-center gap-3">
                  {faviconUrl && (
                    <img src={faviconUrl} alt="favicon" className="size-8 rounded border border-border object-cover" />
                  )}
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium cursor-pointer transition-colors ${faviconUploading ? "opacity-50 pointer-events-none" : "hover:bg-muted/50"}`}>
                    {faviconUploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus size={13} />}
                    <span>{faviconUrl ? "更换图标" : "上传图标"}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleFaviconUpload}
                      disabled={faviconUploading}
                    />
                  </label>
                </div>
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

          {/* Resend Integration Tab */}
          <TabsContent value="resend" className="space-y-6 mt-0">
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Resend 邮件服务集成</h3>
                <p className="text-xs text-muted-foreground">配置此集成后，系统将自动使用该域名发送注册验证码、通知和密码重置邮件</p>
              </div>

              <div className="grid gap-4 border-t border-border pt-4">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">发信域名 (Domain)</label>
                  <Input
                    placeholder="e.g. moment.cc"
                    value={resendDomain}
                    onChange={(e) => setResendDomain(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Resend API Key</label>
                  <Input
                    type="password"
                    placeholder="re_123456789_ABCdefGh..."
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">发信人显示名称</label>
                  <Input
                    placeholder="e.g. Jotify Moment"
                    value={resendFromName}
                    onChange={(e) => setResendFromName(e.target.value)}
                  />
                </div>

                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">发信邮件地址</label>
                  <div className="flex rounded-md shadow-sm">
                    <Input
                      placeholder="e.g. no-reply"
                      value={resendFromEmailPrefix}
                      onChange={(e) => setResendFromEmailPrefix(e.target.value)}
                      className="rounded-r-none border-r-0 flex-1"
                    />
                    <span className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted/40 text-muted-foreground text-xs select-none">
                      @{resendDomain || "发信域名"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">发信域名自动追加且无法修改，系统将使用该后缀发送邮件</p>
                </div>

                {isResendIntegrated && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-border text-xs space-y-2 mt-2 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-green-600">● 邮件服务运行中</span>
                      <span className="text-[10px] text-muted-foreground">实时发信中</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-1">
                      <p>完整发信地址: {resendFromName} &lt;{resendFromEmailPrefix}@{resendDomain}&gt;</p>
                      <p>API Key: re_***...{resendApiKey.slice(-6)}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <Button
                    onClick={handleResendSave}
                    disabled={resendActionLoading}
                    className="text-xs"
                  >
                    {resendActionLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : <Mail className="size-3.5 mr-1" />}
                    {isResendIntegrated ? "保存最新配置" : "一键集成 Resend 邮件服务"}
                  </Button>
                  
                  {isResendIntegrated && (
                    <Button
                      variant="outline"
                      onClick={handleResendDelete}
                      disabled={resendActionLoading}
                      className="text-xs text-red-600 border-red-500/20 hover:bg-red-50"
                    >
                      <Trash2 className="size-3.5 mr-1" />
                      清除邮件配置
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Storage/Upload Config Tab */}
          <TabsContent value="storage" className="space-y-6 mt-0">
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">上传存储配置</h3>
                <p className="text-xs text-muted-foreground">配置文件上传的存储方式、大小限制和允许的文件类型</p>
              </div>

              <div className="grid gap-4 border-t border-border pt-4">
                <div className="grid gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">存储模式</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStorageMode("local")}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                        storageMode === "local"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <HardDrive size={14} />
                      本地上传
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorageMode("s3")}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                        storageMode === "s3"
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Cloud size={14} />
                      云上传 (S3/R2)
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {storageMode === "local" ? "文件将保存到服务器本地 public/uploads/ 目录" : "文件将上传到 S3 兼容的对象存储服务（如 Cloudflare R2、AWS S3 等）"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">文件大小限制 (MB)</label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={storageMaxSize}
                      onChange={(e) => setStorageMaxSize(e.target.value)}
                      placeholder="50"
                    />
                    <p className="text-[10px] text-muted-foreground">范围 1-500 MB</p>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">允许的文件后缀</label>
                    <Input
                      value={storageExtensions}
                      onChange={(e) => setStorageExtensions(e.target.value)}
                      placeholder="jpg,jpeg,png,gif,webp,mp4,webm,mp3,wav,ogg,m4a"
                    />
                    <p className="text-[10px] text-muted-foreground">多个后缀用英文逗号分隔，不含点号</p>
                  </div>
                </div>

                {storageMode === "s3" && (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="flex items-center gap-2">
                      <Cloud size={14} className="text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground">S3 / R2 连接配置</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Access Key ID</label>
                        <Input
                          type="password"
                          placeholder="S3_ACCESS_KEY_ID"
                          value={s3AccessKeyId}
                          onChange={(e) => setS3AccessKeyId(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Secret Access Key</label>
                        <Input
                          type="password"
                          placeholder="S3_SECRET_ACCESS_KEY"
                          value={s3SecretAccessKey}
                          onChange={(e) => setS3SecretAccessKey(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Bucket Name</label>
                      <Input
                        placeholder="S3_BUCKET_NAME"
                        value={s3BucketName}
                        onChange={(e) => setS3BucketName(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Endpoint</label>
                        <Input
                          placeholder="https://xxx.r2.cloudflarestorage.com"
                          value={s3Endpoint}
                          onChange={(e) => setS3Endpoint(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Region</label>
                        <Input
                          placeholder="auto"
                          value={s3Region}
                          onChange={(e) => setS3Region(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Public URL</label>
                      <Input
                        placeholder="https://cdn.example.com"
                        value={s3PublicUrl}
                        onChange={(e) => setS3PublicUrl(e.target.value)}
                      />
                      <p className="text-[10px] text-muted-foreground">文件的公开访问基础 URL，用于生成可访问的文件链接</p>
                    </div>
                  </div>
                )}

                {storageMode === "s3" && s3AccessKeyId && s3BucketName && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-border text-xs space-y-2 mt-2 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-green-600">● 云存储已配置</span>
                      <span className="text-[10px] text-muted-foreground">配置实时生效</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-1">
                      <p>Bucket: {s3BucketName}</p>
                      <p>Endpoint: {s3Endpoint || "(未配置)"}</p>
                      <p>Public URL: {s3PublicUrl || "(未配置，将使用 Endpoint/Bucket 拼接)"}</p>
                      <p>Region: {s3Region || "auto"}</p>
                    </div>
                  </div>
                )}

                {storageMode === "local" && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-border text-xs space-y-2 mt-2 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-blue-600">● 本地存储模式</span>
                      <span className="text-[10px] text-muted-foreground">文件保存到服务器</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground space-y-1">
                      <p>存储路径: public/uploads/YYYYMM/</p>
                      <p>文件名: 32位随机加密哈希.后缀</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <Button
                    onClick={handleStorageSave}
                    disabled={storageActionLoading}
                    className="text-xs"
                  >
                    {storageActionLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : <Upload className="size-3.5 mr-1" />}
                    保存上传配置
                  </Button>
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
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-foreground">用户列表</h2>
              {isSuperAdmin && (
                <Button onClick={() => setCreateUserOpen(true)} size="sm" className="h-8 text-xs gap-1">
                  <UserPlus size={14} />
                  <span>新增用户</span>
                </Button>
              )}
            </div>

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
                        <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>自定义域名: </span>
                          {user.allowCustomDomain ? (
                            <>
                              <span className="text-green-600 font-medium">允许</span>
                              {user.customDomain ? (
                                <a
                                  href={`https://${user.customDomain}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline font-mono text-[10px] ml-1 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.2 rounded"
                                >
                                  {user.customDomain}
                                </a>
                              ) : (
                                <span className="text-muted-foreground/50">(未绑定)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-red-500 font-medium">禁止</span>
                          )}
                        </div>
                        {user.loginDisabledAt && (
                          <span className="text-[10px] text-orange-500 font-medium block mt-0.5">登录已禁用</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 items-center ml-auto">
                      {user.role !== "super_admin" && user.id !== currentUser.id && (
                        <>
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

                          {user.loginDisabledAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs text-orange-500 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950"
                              onClick={() => handleUnlockLogin(user.id)}
                            >
                              <LockOpen size={12} className="mr-1" /> 解锁登录
                            </Button>
                          )}
                        </>
                      )}

                      {user.id !== currentUser.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => openEditor(user)}
                        >
                          编辑账号
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {usersLoadingMore && (
                <>
                  {[...Array(3)].map((_, i) => (
                    <div key={`skeleton-${i}`} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-muted/10 animate-pulse">
                      <div className="size-8 rounded-full bg-border/50 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-border/50 rounded w-24" />
                        <div className="h-3 bg-border/50 rounded w-40" />
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div ref={usersSentinelRef} className="h-1" />
            </div>

            {/* 新增用户 Dialog */}
            <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>新增用户</DialogTitle>
                  <DialogDescription>
                    手动创建一个新的系统用户。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold">邮箱</label>
                    <Input
                      type="email"
                      placeholder="email@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold">密码</label>
                    <Input
                      type="password"
                      placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位密码`}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-xs font-semibold">角色</label>
                    <select
                      value={newRole}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewRole(e.target.value as "admin" | "user" | "guest")}
                      className="w-full h-9 text-xs px-3 border border-border bg-background rounded-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="user">普通用户</option>
                      <option value="guest">访客</option>
                      {isSuperAdmin && <option value="admin">管理员</option>}
                    </select>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <div className="space-y-0.5">
                      <label className="text-xs font-semibold">允许使用自定义域名</label>
                      <p className="text-[10px] text-muted-foreground">控制此用户是否拥有绑定自定义域名的权限</p>
                    </div>
                    <Switch
                      checked={newAllowDomain}
                      onCheckedChange={setNewAllowDomain}
                    />
                  </div>
                </div>
                <DialogFooter className="sm:justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setCreateUserOpen(false)} disabled={createLoading}>
                    取消
                  </Button>
                  <Button size="sm" onClick={handleCreateUser} disabled={createLoading}>
                    {createLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                    创建用户
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* 编辑用户 Dialog */}
            <Dialog open={editingUser !== null} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>编辑账号</DialogTitle>
                  <DialogDescription>
                    修改该用户的账户信息。留空密码表示不重置密码。
                  </DialogDescription>
                </DialogHeader>
                {editingUser && (
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold">邮箱</label>
                      <Input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold">重置密码 (可选)</label>
                      <div className="relative">
                        <Input
                          type={showEditPassword ? "text" : "password"}
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder={`新密码（至少 ${MIN_PASSWORD_LENGTH} 位，留空则不修改）`}
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
                    </div>
                    <div className="grid gap-1.5">
                      <label className="text-xs font-semibold">角色</label>
                      <select
                        value={editRole}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditRole(e.target.value as "admin" | "user" | "guest")}
                        className="w-full h-9 text-xs px-3 border border-border bg-background rounded-md cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="user">普通用户</option>
                        <option value="guest">访客</option>
                        {isSuperAdmin && <option value="admin">管理员</option>}
                      </select>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="space-y-0.5">
                        <label className="text-xs font-semibold">允许使用自定义域名</label>
                        <p className="text-[10px] text-muted-foreground">控制此用户是否拥有绑定自定义域名的权限</p>
                      </div>
                      <Switch
                        checked={editAllowCustomDomain}
                        onCheckedChange={setEditAllowCustomDomain}
                      />
                    </div>
                  </div>
                )}
                <DialogFooter className="sm:justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingUser(null)} disabled={editLoading}>
                    取消
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={editLoading}>
                    {editLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                    保存修改
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Comments Tab */}
          <TabsContent value="comments" className="space-y-3 mt-0">
            {commentsLoading && commentsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="size-6 animate-spin mb-2" />
                <span className="text-xs">加载评论中...</span>
              </div>
            ) : commentsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-xs">
                <span>暂无任何评论</span>
              </div>
            ) : (
              <div className="space-y-3">
                {commentsList.map((comment) => (
                  <div key={comment.id} className="flex flex-col p-3 border border-border rounded-lg bg-muted/10 text-sm gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                          {comment.author?.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={comment.author.avatar} alt={comment.author.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="font-semibold text-xs">{comment.author?.name?.charAt(0) || "U"}</span>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{comment.author?.name || "未知用户"}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                              comment.author?.role === "super_admin"
                                ? "bg-red-500/10 text-red-500"
                                : comment.author?.role === "admin"
                                ? "bg-blue-500/10 text-blue-500"
                                : "bg-neutral-500/10 text-neutral-500"
                            }`}>
                              {comment.author?.role === "super_admin" ? "超级管理员" : comment.author?.role === "admin" ? "管理员" : "普通用户"}
                            </span>
                            {comment.status === "hidden" && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 rounded font-medium">
                                已隐藏
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAdminToggleCommentVisibility(comment.id, comment.status)}
                          className="h-7 text-xs px-2.5 gap-1.5"
                        >
                          {comment.status === "hidden" ? (
                            <>
                              <Eye size={12} />
                              <span>取消隐藏</span>
                            </>
                          ) : (
                            <>
                              <EyeOff size={12} />
                              <span>隐藏</span>
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleAdminDeleteComment(comment.id)}
                          className="h-7 text-xs px-2.5 gap-1.5"
                        >
                          <Trash2 size={12} />
                          <span>删除</span>
                        </Button>
                      </div>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded border border-border/40 text-xs text-foreground/80 break-all">
                      {comment.content}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>来自日志 ID: <code className="bg-muted px-1 py-0.5 rounded">{comment.postId}</code></span>
                      <a
                        href={`/mo/${comment.postId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        查看原日志 →
                      </a>
                    </div>
                  </div>
                ))}

                {/* Pagination Controls */}
                {commentsTotal > 20 && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                    <span className="text-muted-foreground">
                      共 {commentsTotal} 条评论，第 {commentsPage} / {Math.ceil(commentsTotal / 20)} 页
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={commentsPage <= 1 || commentsLoading}
                        onClick={() => fetchComments(commentsPage - 1)}
                        className="h-7 px-2"
                      >
                        上一页
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={commentsPage >= Math.ceil(commentsTotal / 20) || commentsLoading}
                        onClick={() => fetchComments(commentsPage + 1)}
                        className="h-7 px-2"
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
