"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { loginAction, registerAction, sendVerificationCodeAction, resetPasswordAction } from "@/app/actions/auth";

interface AuthModalsProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "forgot";
  onSuccess: () => void;
}

export function AuthModals({ isOpen, onClose, initialMode = "login", onSuccess }: AuthModalsProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Form states
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const startCountdown = () => {
    setCountdown(60);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    if (!email) {
      toast.error("请输入电子邮箱");
      return;
    }
    setLoading(true);
    const type = mode === "register" ? "register" : "forgot_password";
    const res = await sendVerificationCodeAction(email, type);
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      const msg = "验证码已发送，请检查收件箱" + (res.emailConfigured === false ? "（尚未配置发信API）" : "");
      toast.success(msg);
      startCountdown();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await loginAction({ email, password });
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success("登录成功");
          onSuccess();
          onClose();
        }
      } else if (mode === "register") {
        const res = await registerAction({ email, name, code, password });
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success("注册成功，请登录");
          setMode("login");
          setCode("");
          setPassword("");
        }
      } else {
        // Forgot password / reset
        const res = await resetPasswordAction({ email, code, password });
        if (res.error) {
          toast.error(res.error);
        } else {
          toast.success("密码重置成功，请重新登录");
          setMode("login");
          setPassword("");
          setCode("");
        }
      }
    } catch {
      toast.error("操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "login" && "登录账号"}
            {mode === "register" && "注册新账号"}
            {mode === "forgot" && "重置密码"}
          </DialogTitle>
          <DialogDescription>
            {mode === "login" && "登录以发布日志或进行互动"}
            {mode === "register" && "创建一个新账户加入 Moment"}
            {mode === "forgot" && "通过邮箱验证码找回您的密码"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {mode === "register" && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">昵称</label>
              <Input
                type="text"
                placeholder="例如：张三"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">电子邮箱</label>
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {(mode === "register" || mode === "forgot") && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">验证码</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="6位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0}
                  className="whitespace-nowrap min-w-[100px]"
                >
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              {mode === "forgot" ? "新密码" : "密码"}
            </label>
            <Input
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "正在处理..." : mode === "login" ? "登录" : mode === "register" ? "注册" : "重置密码"}
          </Button>

          <div className="flex justify-between text-xs mt-4 text-muted-foreground">
            {mode === "login" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                  }}
                  className="hover:underline hover:text-primary"
                >
                  注册新账号
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                  }}
                  className="hover:underline hover:text-primary"
                >
                  忘记密码？
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMode("login")}
                className="hover:underline hover:text-primary mx-auto"
              >
                返回登录
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
