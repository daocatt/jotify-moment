"use client";

import { useState, useEffect, useCallback } from "react";
import { Turnstile } from "@/components/ui/turnstile";
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
import { loginAction, registerAction, sendVerificationCodeAction, sendResetPasswordLinkAction } from "@/app/actions/auth";
import { getPublicSettingsAction } from "@/app/actions/admin";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const TURNSTILE_ENABLED = !!TURNSTILE_SITE_KEY;

// Sunken / inset input: carved into the surface, lightens on focus.
// Straight corners (--radius: 0) per the project's square design.
const sunkenInputClass =
  "h-10 rounded-none border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.04] shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(0,0,0,0.03)] dark:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.35)] focus-visible:bg-background dark:focus-visible:bg-zinc-900/60 focus-visible:ring-2 focus-visible:ring-ring/25 focus-visible:border-ring/60 transition-all duration-150";

// Floating button: lifts with a deeper shadow on hover, settles on press.
const floatHoverClass =
  "transition-all duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0";
const primaryFloatClass = `${floatHoverClass} shadow-[0_2px_8px_rgba(0,0,0,0.14),0_1px_2px_rgba(0,0,0,0.08)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.18),0_2px_4px_rgba(0,0,0,0.08)] active:shadow-[0_1px_3px_rgba(0,0,0,0.14)]`;
const secondaryFloatClass = `${floatHoverClass} shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_3px_10px_rgba(0,0,0,0.1)]`;

interface AuthModalsProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "register" | "forgot";
  onSuccess: () => void;
  allowRegistration?: boolean;
}

export function AuthModals({ isOpen, onClose, initialMode = "login", onSuccess, allowRegistration }: AuthModalsProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [resetKey, setResetKey] = useState(0);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [allowRegState, setAllowRegState] = useState<boolean | undefined>(
    allowRegistration
  );

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    getPublicSettingsAction().then((res) => {
      if (cancelled) return;
      if (res.success && res.settings) {
        if (allowRegistration === undefined) {
          setAllowRegState(res.settings.allow_registration !== "false");
        } else {
          setAllowRegState(allowRegistration);
        }
      } else {
        if (allowRegistration === undefined) setAllowRegState(true);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen, allowRegistration]);

  const enforceRegRestriction = useCallback(() => {
    if (allowRegState === false && mode === "register") {
      setMode("login");
      toast.error("管理员已关闭注册通道");
    }
  }, [allowRegState, mode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch in effect is standard pattern
    enforceRegRestriction();
  }, [enforceRegRestriction]);

  const resetCaptcha = () => {
    setTurnstileToken("");
    setResetKey((prev) => prev + 1);
  };

  const switchMode = (newMode: "login" | "register" | "forgot") => {
    if (newMode === "register" && !allowRegState) {
      toast.error("注册通道已关闭，暂时无法注册");
      return;
    }
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
    if (TURNSTILE_ENABLED && !turnstileToken) {
      toast.error("请完成人机验证");
      return;
    }
    setLoading(true);
    const type = mode === "register" ? "register" : "forgot_password";
    const res = await sendVerificationCodeAction(email, type, turnstileToken || undefined);
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
    if (TURNSTILE_ENABLED && !turnstileToken) {
      toast.error("请完成人机验证");
      return;
    }
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await loginAction({ email, password, turnstileToken: turnstileToken || undefined });
        if (res.error) {
          toast.error(res.error);
          resetCaptcha();
        } else {
          toast.success("登录成功");
          onSuccess();
          onClose();
        }
      } else if (mode === "register") {
        const res = await registerAction({ email, name, code, password, turnstileToken: turnstileToken || undefined });
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
        const res = await sendResetPasswordLinkAction(email, window.location.origin, turnstileToken || undefined);
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
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">昵称</label>
                <Input
                  type="text"
                  placeholder="例如：张三"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={sunkenInputClass}
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">电子邮箱</label>
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={sunkenInputClass}
            />
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">验证码</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="6位验证码"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={6}
                  required
                  className={sunkenInputClass}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0}
                  className={`whitespace-nowrap min-w-[100px] h-10 rounded-none border-transparent dark:border-transparent focus-visible:border-transparent ${secondaryFloatClass}`}
                >
                  {countdown > 0 ? `${countdown}s` : "获取验证码"}
                </Button>
              </div>
            </div>
          )}

          {(mode === "login" || mode === "register") && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">密码</label>
              <Input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={sunkenInputClass}
              />
            </div>
          )}

          {TURNSTILE_ENABLED && TURNSTILE_SITE_KEY && (
            <div className="flex justify-center">
              <Turnstile
                key={`${mode}-${resetKey}`}
                sitekey={TURNSTILE_SITE_KEY}
                onVerify={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken("")}
                onError={() => {
                  setTurnstileToken("");
                  toast.error("人机验证加载失败，请刷新页面重试");
                }}
                languageOverride="zh"
              />
            </div>
          )}

          <Button type="submit" className={`w-full mt-2 h-10 rounded-none ${primaryFloatClass}`} disabled={loading}>
            {loading ? "正在处理..." : mode === "login" ? "登录" : mode === "register" ? "注册" : "发送重置邮件"}
          </Button>



          <div className="flex justify-between text-xs mt-4 text-muted-foreground">
            {mode === "login" ? (
              <>
                {allowRegState !== false && (
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                    className="hover:underline hover:text-primary"
                  >
                    注册新账号
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className={`hover:underline hover:text-primary ${allowRegState === false ? "mx-auto" : ""}`}
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
