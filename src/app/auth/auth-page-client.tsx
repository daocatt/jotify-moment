"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Turnstile } from "@/components/ui/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  loginAction,
  registerAction,
  sendVerificationCodeAction,
  getOAuthClientInfoAction,
} from "@/app/actions/auth";
import { getPublicSettingsAction } from "@/app/actions/admin";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, Globe, ArrowRight } from "lucide-react";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
const TURNSTILE_ENABLED = !!TURNSTILE_SITE_KEY;

const formInputClass =
  "h-10 rounded-lg border-input/80 bg-background/80 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:bg-zinc-900/50 dark:border-zinc-800 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary transition-all duration-150 text-sm";

export interface AuthPageClientProps {
  initialMode?: "login" | "register";
}

export function AuthPageClient({ initialMode = "login" }: AuthPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();

  const clientId = searchParams.get("client_id") || "";
  const oauthReturn = searchParams.get("oauth_return") || "";
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [clientInfo, setClientInfo] = useState<{
    domain: string | null;
    ownerName: string;
    ownerAvatar: string | null;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [resetKey, setResetKey] = useState(0);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [allowRegistration, setAllowRegistration] = useState<boolean>(true);

  // 获取设置和 client_id 对应的自定义域名所有者信息
  useEffect(() => {
    getPublicSettingsAction().then((res) => {
      if (res.success && res.settings) {
        setAllowRegistration(res.settings.allow_registration !== "false");
      }
    });

    if (clientId) {
      getOAuthClientInfoAction(clientId).then((res) => {
        if (res.valid && res.client) {
          setClientInfo(res.client);
        }
      });
    }
  }, [clientId]);

  // 如果禁止注册且当前在 register，自动切到 login
  useEffect(() => {
    if (!allowRegistration && mode === "register") {
      setMode("login");
      toast.error("管理员已关闭注册通道");
    }
  }, [allowRegistration, mode]);

  const resetCaptcha = () => {
    setTurnstileToken("");
    setResetKey((prev) => prev + 1);
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
    const res = await sendVerificationCodeAction(email, "register", turnstileToken || undefined);
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
      resetCaptcha();
    } else {
      const msg =
        "验证码已发送，请检查收件箱" +
        (res.emailConfigured === false ? "（尚未配置发信API）" : "");
      toast.success(msg);
      startCountdown();
      resetCaptcha();
    }
  };

  const handleSuccessRedirect = useCallback(() => {
    if (oauthReturn) {
      window.location.href = oauthReturn;
    } else {
      router.push("/");
    }
  }, [oauthReturn, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (TURNSTILE_ENABLED && !turnstileToken) {
      toast.error("请完成人机验证");
      return;
    }
    setLoading(true);

    try {
      if (mode === "login") {
        const res = await loginAction({
          email,
          password,
          turnstileToken: turnstileToken || undefined,
        });
        if (res.error) {
          toast.error(res.error);
          resetCaptcha();
        } else {
          toast.success("登录成功");
          handleSuccessRedirect();
        }
      } else {
        const res = await registerAction({
          email,
          name,
          code,
          password,
          turnstileToken: turnstileToken || undefined,
        });
        if (res.error) {
          toast.error(res.error);
          resetCaptcha();
        } else {
          toast.success("注册成功！请使用新创建的账户登录");
          setMode("login");
          setCode("");
          setPassword("");
        }
      }
    } catch {
      toast.error("操作失败，请重试");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-neutral-50/60 dark:bg-zinc-950 flex flex-col justify-between selection:bg-primary/20 selection:text-primary">
      {/* 顶部简洁导航 */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-rounded.svg"
            alt="Jotify Moment Logo"
            className="size-8 rounded-lg shadow-2xs group-hover:scale-105 transition-transform"
          />
          <span className="font-semibold text-base tracking-tight text-foreground">
            Jotify Moment
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="size-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80"
            title="切换浅色/深色主题"
          >
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted/80 transition-colors"
          >
            返回主站
          </Link>
        </div>
      </header>

      {/* 登录/注册核心卡片 */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-4">
        <div className="w-full max-w-[420px] bg-card border border-border/80 rounded-2xl shadow-sm p-6 sm:p-8 relative backdrop-blur-xs">
          {/* 自定义域名来源标头提示 */}
          {clientId && (
            <div className="mb-6 p-3 rounded-xl bg-primary/5 border border-primary/15 flex items-center gap-3">
              <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Globe size={18} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[11px] text-muted-foreground">授权登录请求</p>
                <p className="text-xs font-semibold text-foreground truncate mt-0.5">
                  来自{" "}
                  <span className="text-primary font-bold">
                    {clientInfo?.domain || clientId}
                  </span>
                  {clientInfo?.ownerName && ` (${clientInfo.ownerName})`}
                </p>
              </div>
            </div>
          )}

          {/* 表单标题 */}
          <div className="text-left mb-6">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {mode === "login" ? "欢迎回来" : "创建新账户"}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === "login"
                ? "登录您的账户以继续访问与互动"
                : "注册一个新账户加入 Jotify Moment"}
            </p>
          </div>

          {/* 表单内容 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">昵称</label>
                <Input
                  type="text"
                  placeholder="例如：张三"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={formInputClass}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">电子邮箱</label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={formInputClass}
              />
            </div>

            {mode === "register" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">邮箱验证码</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="6位验证码"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    maxLength={6}
                    required
                    className={formInputClass}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={loading || countdown > 0}
                    className="whitespace-nowrap min-w-[104px] h-10 rounded-lg text-xs font-medium active:scale-[0.98] transition-all"
                  >
                    {countdown > 0 ? `${countdown}s` : "获取验证码"}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">密码</label>
                {mode === "login" && (
                  <Link
                    href="/reset-password"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    忘记密码？
                  </Link>
                )}
              </div>
              <Input
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={formInputClass}
              />
            </div>

            {TURNSTILE_ENABLED && TURNSTILE_SITE_KEY && (
              <div className="flex justify-center pt-1">
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

            <Button
              type="submit"
              className="w-full h-10 rounded-lg font-medium text-sm shadow-2xs active:scale-[0.98] transition-all mt-2"
              disabled={loading}
            >
              {loading ? (
                "正在处理..."
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  {mode === "login" ? "立即登录" : "完成注册"}
                  <ArrowRight size={14} />
                </span>
              )}
            </Button>
          </form>

          {/* 模式切换 */}
          <div className="mt-6 pt-5 border-t border-border/60 text-center text-xs text-muted-foreground">
            {mode === "login" ? (
              allowRegistration ? (
                <p>
                  还没有账户？{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      resetCaptcha();
                    }}
                    className="font-medium text-primary hover:underline cursor-pointer"
                  >
                    立即注册新账号
                  </button>
                </p>
              ) : (
                <p className="text-muted-foreground/80">目前暂未开放新用户注册</p>
              )
            ) : (
              <p>
                已有账户？{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    resetCaptcha();
                  }}
                  className="font-medium text-primary hover:underline cursor-pointer"
                >
                  返回账号登录
                </button>
              </p>
            )}
          </div>
        </div>
      </main>

      {/* 底部简约版权与驱动支持 */}
      <footer className="w-full max-w-5xl mx-auto px-4 py-6 text-center text-xs text-muted-foreground/80">
        <p>由 <span className="font-medium text-foreground">jotify.me</span> 驱动支持 · 随时记录生活点滴</p>
      </footer>
    </div>
  );
}
