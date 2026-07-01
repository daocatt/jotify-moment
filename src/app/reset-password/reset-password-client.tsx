"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { resetPasswordAction, verifyResetTokenAction } from "@/app/actions/auth";
import { Loader2, KeyRound } from "lucide-react";

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      return;
    }
    verifyResetTokenAction(token).then((res) => {
      if (res.valid) {
        setTokenValid(true);
        setEmail(res.email || "");
      } else {
        setTokenValid(false);
      }
      setVerifying(false);
    });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("密码长度至少为 8 位");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      const res = await resetPasswordAction({ token, password });
      if (res.error) {
        toast.error(res.error);
        setTokenValid(false);
      } else {
        toast.success("密码重置成功");
        setSuccess(true);
        setTimeout(() => {
          router.push("/");
        }, 3000);
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <Loader2 className="animate-spin text-primary size-8" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-white dark:bg-zinc-900 border border-border p-6 rounded-2xl shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-950/20 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <KeyRound className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">密码重置成功</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            您的账户密码已成功重置。正在为您跳转到主页，请使用新密码重新登录...
          </p>
          <Button onClick={() => router.push("/")} className="w-full mt-2">
            返回主页
          </Button>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-[400px] bg-white dark:bg-zinc-900 border border-border p-6 rounded-2xl shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-red-50 dark:bg-red-950/20 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <KeyRound className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">重置链接无效</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            此密码重置链接无效、已过期或已使用，请重新回到主页登录弹窗中申请密码重置。
          </p>
          <Button onClick={() => router.push("/")} className="w-full mt-2">
            返回主页
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[400px] bg-white dark:bg-zinc-900 border border-border p-6 rounded-2xl shadow-sm space-y-4">
        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-2">
            <KeyRound className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">重置您的密码</h2>
          <p className="text-xs text-muted-foreground">
            正在重置账户 <span className="font-semibold text-foreground">{email}</span> 的登录密码
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">新密码</label>
            <Input
              type="password"
              placeholder="最少 8 位新密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">确认新密码</label>
            <Input
              type="password"
              placeholder="再次输入以确认"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="animate-spin mr-2 size-4" />
                正在重置密码...
              </>
            ) : (
              "重置密码"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
