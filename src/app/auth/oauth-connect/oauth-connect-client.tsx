"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { directOAuthLoginAction, bindExistingAccountAction } from "@/app/actions/oauth-dalao";
import { CheckCircle2, UserPlus, Link2, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface OAuthConnectClientProps {
  dalaoInfo: {
    username: string;
    email: string;
    accountId: string;
  };
}

export function OAuthConnectClient({ dalaoInfo }: OAuthConnectClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"direct" | "bind">("direct");
  const [loading, setLoading] = useState(false);

  // Bind existing form
  const [email, setEmail] = useState(dalaoInfo.email || "");
  const [password, setPassword] = useState("");

  const handleDirectLogin = async () => {
    setLoading(true);
    const res = await directOAuthLoginAction();
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("欢迎加入 Jotify Moment！");
      router.push("/");
      router.refresh();
    }
  };

  const handleBindExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("请输入邮箱和密码");
      return;
    }

    setLoading(true);
    const res = await bindExistingAccountAction({ email, password });
    setLoading(false);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("账号绑定成功，已为您登录！");
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-card border border-border/80 shadow-md rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Header with Dalao authorized identity */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto">
            <CheckCircle2 size={26} />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-foreground">已授权大佬论坛账号</h1>
            <p className="text-xs text-muted-foreground">请确认您要如何进入 Jotify Moment</p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/60 border border-border text-xs text-foreground font-medium">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span>{dalaoInfo.username}</span>
            <span className="text-muted-foreground text-[10px]">(ID: {dalaoInfo.accountId})</span>
          </div>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/50 rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setTab("direct")}
            className={`py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === "direct"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus size={14} />
            <span>直接登录 (新用户)</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("bind")}
            className={`py-2 px-3 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === "bind"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Link2 size={14} />
            <span>绑定已有账号</span>
          </button>
        </div>

        {/* Tab 1: Direct Login */}
        {tab === "direct" && (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <p className="font-semibold text-foreground">💡 极简一键登录：</p>
              <p>系统将直接使用您的大佬论坛用户名与邮箱创建新身份，无需设置独立密码即可立刻开启您的 Moment 空间。</p>
              <p className="text-[11px] text-muted-foreground/80">后续如需解绑，可在个人设置中先设置登录密码后再解绑。</p>
            </div>

            <Button
              type="button"
              className="w-full h-10 font-medium"
              disabled={loading}
              onClick={handleDirectLogin}
            >
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              直接以此身份登录
            </Button>
          </div>
        )}

        {/* Tab 2: Bind Existing Account */}
        {tab === "bind" && (
          <form onSubmit={handleBindExisting} className="space-y-4 pt-1">
            <div className="p-3 rounded-lg border border-border/70 bg-muted/20 text-xs text-muted-foreground">
              请输入您在 Jotify Moment 已有的账号凭据以完成关联：
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">邮箱地址</label>
              <Input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">账号密码</label>
              <Input
                type="password"
                placeholder="请输入原账号密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full h-10 font-medium" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin mr-2" />}
              验证并绑定已有账号
            </Button>
          </form>
        )}

        <div className="pt-2 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            <span>放弃并返回首页</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
