"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Mail, User, KeyRound, Loader2, Send } from "lucide-react";
import { updateProfileAction } from "@/app/actions/admin";
import { guestSendResetPasswordAction } from "@/app/actions/auth";

export function GuestProfileClient() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetCountdown, setResetCountdown] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          setName(data.user.name || "");
        } else {
          router.push("/");
        }
      })
      .catch(() => router.push("/"));
  }, [router]);

  useEffect(() => {
    if (resetCountdown <= 0) return;
    const timer = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCountdown]);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("用户名不能为空");
      return;
    }
    setSaving(true);
    try {
      const res = await updateProfileAction({ name, slug: "", bio: "", avatar: "", coverImage: "", wechat: "", telegram: "", github: "", x: "", otherLink: "" });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("用户名已更新");
        setUser((prev) => prev ? { ...prev, name } : prev);
      }
    } catch {
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setSendingReset(true);
    try {
      const res = await guestSendResetPasswordAction(window.location.origin);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("重置密码邮件已发送，请检查您的邮箱");
        setResetCountdown(60);
      }
    } catch {
      toast.error("发送失败，请重试");
    } finally {
      setSendingReset(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary size-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-3 mb-8 mt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="size-8 rounded-full"
          >
            <ArrowLeft size={18} />
          </Button>
          <h1 className="text-lg font-bold text-foreground">访客资料</h1>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl shadow-sm p-6 space-y-6">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Mail size={12} /> 注册邮箱
            </label>
            <Input
              type="email"
              value={user.email}
              disabled
              className="bg-muted/50 cursor-not-allowed"
            />
          </div>

          <form onSubmit={handleSaveName} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <User size={12} /> 用户名
              </label>
              <div className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入用户名"
                  required
                />
                <Button type="submit" size="sm" disabled={saving} className="shrink-0">
                  {saving ? <Loader2 className="animate-spin size-4" /> : "保存"}
                </Button>
              </div>
            </div>
          </form>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <KeyRound size={12} /> 重置密码
            </label>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              点击下方按钮，系统将向您的注册邮箱发送一封密码重置邮件。
            </p>
            <Button
              variant="outline"
              onClick={handleResetPassword}
              disabled={sendingReset || resetCountdown > 0}
              className="w-full"
            >
              {sendingReset ? (
                <>
                  <Loader2 className="animate-spin mr-2 size-4" />
                  发送中...
                </>
              ) : resetCountdown > 0 ? (
                `${resetCountdown}s 后可重新发送`
              ) : (
                <>
                  <Send size={14} className="mr-2" />
                  发送重置邮件
                </>
              )}
            </Button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/40 mt-20 leading-relaxed">
          世界很大，能在同一个字里驻足，也是种运气。
        </p>
      </div>
    </div>
  );
}
