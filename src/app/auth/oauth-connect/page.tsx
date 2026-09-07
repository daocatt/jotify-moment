import { getPendingDalaoAuthAction } from "@/app/actions/oauth-dalao";
import { OAuthConnectClient } from "./oauth-connect-client";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "账号授权确认 - Jotify Moment",
  description: "绑定或创建您的 Jotify Moment 账号",
};

export default async function OAuthConnectPage() {
  const res = await getPendingDalaoAuthAction();

  if (!res.success || !res.data) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="inline-flex items-center justify-center size-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto">
            <AlertCircle size={24} />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold text-foreground">授权会话已过期</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {res.error || "未找到有效的大佬论坛授权会话，请重新发起登录授权。"}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "outline" }), "w-full text-xs gap-1.5")}
            >
              <ArrowLeft size={14} />
              <span>返回首页重新登录</span>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F4F5] dark:bg-zinc-950 flex items-center justify-center p-4">
      <OAuthConnectClient dalaoInfo={res.data} />
    </main>
  );
}
