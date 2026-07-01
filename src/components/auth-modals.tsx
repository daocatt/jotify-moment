"use client";

import { useState, useRef, useEffect } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
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
import { loginAction, registerAction, sendVerificationCodeAction, sendResetPasswordLinkAction, isHcaptchaEnabledAction } from "@/app/actions/auth";

const HCAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY || "";

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
  const [hcaptchaEnabled, setHcaptchaEnabled] = useState(false);
  const [hcaptchaToken, setHcaptchaToken] = useState<string>("");
  const captchaRef = useRef<HCaptcha>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    isHcaptchaEnabledAction().then((res) => {
      if (res.enabled) setHcaptchaEnabled(true);
    });
  }, []);

  const resetCaptcha = () => {
    setHcaptchaToken("");
    captchaRef.current?.resetCaptcha();
  };

  const switchMode = (newMode: "login" | "register" | "forgot") => {
    setMode(newMode);
    resetCaptcha();
  };

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
    if (hcaptchaEnabled && !hcaptchaToken) {
      toast.error("请完成人机验证");
      return;
    }
    setLoading(true);
    const type = mode === "register" ? "register" : "forgot_password";
    const res = await sendVerificationCodeAction(email, type, hcaptchaToken || undefined);
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
      resetCaptcha();
    } else {
      const msg = "验证码已发送，请检查收件箱" + (res.emailConfigured === false ? "（尚未配置发信API）" : "");
      toast.success(msg);
      startCountdown();
      resetCaptcha();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hcaptchaEnabled && !hcaptchaToken) {
      toast.error("请完成人机验证");
      return;
    }
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await loginAction({ email, password, hcaptchaToken: hcaptchaToken || undefined });
        if (res.error) {
          toast.error(res.error);
          resetCaptcha();
        } else {
          toast.success("登录成功");
          onSuccess();
          onClose();
        }
      } else if (mode === "register") {
        const res = await registerAction({ email, name, code, password, hcaptchaToken: hcaptchaToken || undefined });
        if (res.error) {
          toast.error(res.error);
          resetCaptcha();
        } else {
          toast.success("注册成功，请登录");
          switchMode("login");
          setCode("");
          setPassword("");
        }
      } else {
        const res = await sendResetPasswordLinkAction(email, window.location.origin, hcaptchaToken || undefined);
        if (res.error) {
          toast.error(res.error);
          resetCaptcha();
        } else {
          toast.success("重置密码邮件已发送，请检查您的邮箱收件箱！");
          onClose();
        }
      }
    } catch {
      toast.error("操作失败，请重试");
      resetCaptcha();
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
            {mode === "forgot" && "通过邮箱重置链接找回您的密码"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {mode === "register" && (
            <>
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
            </>
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

          {mode === "register" && (
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

          {(mode === "login" || mode === "register") && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">密码</label>
              <Input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          {hcaptchaEnabled && HCAPTCHA_SITE_KEY && (
            <div className="flex justify-center">
              <HCaptcha
                ref={captchaRef}
                sitekey={HCAPTCHA_SITE_KEY}
                onVerify={(token) => setHcaptchaToken(token)}
                onExpire={() => setHcaptchaToken("")}
                languageOverride="zh"
              />
            </div>
          )}

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "正在处理..." : mode === "login" ? "登录" : mode === "register" ? "注册" : "发送重置邮件"}
          </Button>

          <div className="flex justify-between text-xs mt-4 text-muted-foreground">
            {mode === "login" ? (
              <>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="hover:underline hover:text-primary"
                >
                  注册新账号
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="hover:underline hover:text-primary"
                >
                  忘记密码？
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("login")}
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
